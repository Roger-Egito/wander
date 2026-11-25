/**
 * The profiles migration, checked as the roles the app uses (see db.ts for the stand-in
 * of Supabase's own pieces).
 */
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, test } from 'vitest';
import { freshDb, PLAYER, ROGER, runAs } from './db.ts';

let db: PGlite;
beforeEach(async () => {
  db = await freshDb();
});

const as = <T>(user: string | null, sql: string, params: unknown[] = []) => runAs<T>(db, user, sql, params);

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
