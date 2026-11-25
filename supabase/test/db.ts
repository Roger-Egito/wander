/**
 * A real Postgres (PGlite, in-process) with every migration applied, for checking them as
 * the roles the app uses. Supabase's own pieces the migrations rely on are stood in for
 * by a few lines below, the way Supabase defines them:
 *   - the auth schema, and auth.uid() reading the signed-in user from the JWT claims
 *   - the anon and authenticated roles
 *   - the storage schema: buckets, and objects with Row Level Security on and the table
 *     itself granted to both roles, so the policies alone decide who reads what
 */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';

const SUPABASE_STAND_IN = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
    name text, owner_id text, metadata jsonb
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
`;

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const migrations = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

export const ROGER = '00000000-0000-0000-0000-000000000001';
export const PLAYER = '00000000-0000-0000-0000-000000000002';

/**
 * A fresh database: Roger signed in before the migrations ran (the backfill must cover
 * him) and is the admin, and a player signed in after them.
 */
export async function freshDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"full_name": "Roger"}')`, [ROGER]);
  for (const file of migrations) await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"name": "Kallista"}')`, [PLAYER]);
  await db.query(`update public.profiles set is_admin = true where id = $1`, [ROGER]);
  return db;
}

/**
 * Runs SQL as a person would through the Data API (SET ROLE authenticated with their user
 * ID as the JWT subject, or anon with no user), then goes back to the owner.
 */
export async function runAs<T>(db: PGlite, user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}
