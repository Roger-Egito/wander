/**
 * The profiles migration, run on a real Postgres (PGlite, in-process) and checked as the
 * roles the app uses. Supabase's own pieces the migration relies on (the auth schema,
 * auth.uid(), the anon and authenticated roles) are stood in for by a few lines below,
 * the way Supabase defines them: auth.uid() reads the signed-in user from the request's
 * JWT claims.
 *
 * Each test works as a person would through the Data API: SET ROLE authenticated with
 * their user ID as the JWT subject.
 */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'vitest';

const SUPABASE_STAND_IN = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const migrations = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

const ROGER = '00000000-0000-0000-0000-000000000001';
const PLAYER = '00000000-0000-0000-0000-000000000002';

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  // Someone who signed in before the migration ran: the backfill must cover them.
  await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"full_name": "Roger"}')`, [ROGER]);
  for (const file of migrations) await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"name": "Kallista"}')`, [PLAYER]);
  await db.query(`update public.profiles set is_admin = true where id = $1`, [ROGER]);
});

/** Runs SQL as a signed-in person (or as anon with no user), then goes back to the owner. */
async function as<T>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

describe('profiles', () => {
  test('Row Level Security is on', async () => {
    const { rows } = await db.query<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where oid = 'public.profiles'::regclass`);
    expect(rows[0].relrowsecurity).toBe(true);
  });

  test('signing in makes a profile with the Google name, and earlier accounts got one too', async () => {
    const { rows } = await db.query<{ id: string; display_name: string }>('select id, display_name from public.profiles order by id');
    expect(rows).toEqual([{ id: ROGER, display_name: 'Roger' }, { id: PLAYER, display_name: 'Kallista' }]);
  });

  test('a person reads only their own profile', async () => {
    expect(await as(PLAYER, 'select id, is_admin from public.profiles')).toEqual([{ id: PLAYER, is_admin: false }]);
    expect(await as(ROGER, 'select id, is_admin from public.profiles')).toEqual([{ id: ROGER, is_admin: true }]);
  });

  test('a person edits their own name, language and theme', async () => {
    await as(PLAYER, `update public.profiles set display_name = 'Kal', language = 'en', theme = 'light' where id = $1`, [PLAYER]);
    const { rows } = await db.query('select display_name, language, theme from public.profiles where id = $1', [PLAYER]);
    expect(rows[0]).toEqual({ display_name: 'Kal', language: 'en', theme: 'light' });
  });

  test("another person's profile can't be changed: the update finds no row", async () => {
    await as(PLAYER, `update public.profiles set display_name = 'hacked' where id = $1`, [ROGER]);
    const { rows } = await db.query<{ display_name: string }>('select display_name from public.profiles where id = $1', [ROGER]);
    expect(rows[0].display_name).toBe('Roger');
  });

  test('nobody can make themselves an admin', async () => {
    await expect(as(PLAYER, 'update public.profiles set is_admin = true where id = $1', [PLAYER])).rejects.toThrow(/permission denied/);
    const { rows } = await db.query<{ is_admin: boolean }>('select is_admin from public.profiles where id = $1', [PLAYER]);
    expect(rows[0].is_admin).toBe(false);
  });

  test('profiles are never inserted or deleted through the API', async () => {
    await expect(as(PLAYER, `insert into public.profiles (id) values ('00000000-0000-0000-0000-000000000003')`)).rejects.toThrow(/permission denied/);
    await expect(as(PLAYER, 'delete from public.profiles where id = $1', [PLAYER])).rejects.toThrow(/permission denied/);
  });

  test('without signing in, profiles are out of reach', async () => {
    await expect(as(null, 'select * from public.profiles')).rejects.toThrow(/permission denied/);
  });

  test('language and theme only take the known values', async () => {
    await expect(as(PLAYER, `update public.profiles set language = 'fr' where id = $1`, [PLAYER])).rejects.toThrow(/check constraint/);
  });

  test('the trigger function is not callable through the API', async () => {
    await expect(as(PLAYER, 'select public.handle_new_user()')).rejects.toThrow(/permission denied|trigger functions can only be called as triggers/);
  });

  test('deleting an account deletes its profile', async () => {
    await db.query('delete from auth.users where id = $1', [PLAYER]);
    const { rows } = await db.query('select id from public.profiles where id = $1', [PLAYER]);
    expect(rows).toEqual([]);
  });
});
