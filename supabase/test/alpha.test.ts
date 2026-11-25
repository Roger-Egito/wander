/**
 * The Alpha group migration: who can read the alpha snapshot in Storage, and that nobody
 * can join the group or write the snapshot through the API.
 */
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, test } from 'vitest';
import { freshDb, PLAYER, ROGER, runAs } from './db.ts';

const ALPHA = '00000000-0000-0000-0000-000000000003';

let db: PGlite;
beforeEach(async () => {
  db = await freshDb();
  await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"name": "Alfa"}')`, [ALPHA]);
  await db.query('update public.profiles set is_alpha = true where id = $1', [ALPHA]);
  // What the snapshot workflow uploads with the service key (it bypasses RLS, like the
  // table owner here), plus a file in another bucket.
  await db.query(`insert into storage.objects (bucket_id, name) values ('alpha', 'rules-v0.1.1-beta.json')`);
  await db.query(`insert into storage.buckets (id, name) values ('other', 'other')`);
  await db.query(`insert into storage.objects (bucket_id, name) values ('other', 'secret.json')`);
});

const as = <T>(user: string | null, sql: string, params: unknown[] = []) => runAs<T>(db, user, sql, params);
const files = (user: string | null) => as<{ name: string }>(user, 'select name from storage.objects order by name');

describe('alpha content', () => {
  test('the alpha bucket is private and takes only JSON', async () => {
    const { rows } = await db.query('select public, allowed_mime_types from storage.buckets where id = $1', ['alpha']);
    expect(rows).toEqual([{ public: false, allowed_mime_types: ['application/json'] }]);
  });

  test('nobody is in the Alpha group until Roger adds them', async () => {
    const { rows } = await db.query<{ id: string; is_alpha: boolean }>('select id, is_alpha from public.profiles order by id');
    expect(rows).toEqual([
      { id: ROGER, is_alpha: false },
      { id: PLAYER, is_alpha: false },
      { id: ALPHA, is_alpha: true },
    ]);
  });

  test('an Alpha member reads the alpha snapshot', async () => {
    expect(await files(ALPHA)).toEqual([{ name: 'rules-v0.1.1-beta.json' }]);
  });

  test('an admin reads it too', async () => {
    expect(await files(ROGER)).toEqual([{ name: 'rules-v0.1.1-beta.json' }]);
  });

  test("a player outside the group, or someone not signed in, doesn't see it", async () => {
    expect(await files(PLAYER)).toEqual([]);
    expect(await files(null)).toEqual([]);
  });

  test("a member can see their own flag, which the app needs to know what to load", async () => {
    expect(await as(ALPHA, 'select is_alpha from public.profiles')).toEqual([{ is_alpha: true }]);
  });

  test('nobody can add themselves to the group', async () => {
    await expect(as(PLAYER, 'update public.profiles set is_alpha = true where id = $1', [PLAYER])).rejects.toThrow(/permission denied/);
  });

  test('not even a member or an admin can write the snapshot through the API', async () => {
    for (const user of [ALPHA, ROGER]) {
      await expect(as(user, `insert into storage.objects (bucket_id, name) values ('alpha', 'fake.json')`)).rejects.toThrow(/row-level security/);
      await as(user, `update storage.objects set name = 'renamed.json' where bucket_id = 'alpha'`);
      await as(user, `delete from storage.objects where bucket_id = 'alpha'`);
    }
    const { rows } = await db.query('select name from storage.objects where bucket_id = $1', ['alpha']);
    expect(rows).toEqual([{ name: 'rules-v0.1.1-beta.json' }]);
  });
});
