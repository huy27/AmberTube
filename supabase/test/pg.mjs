// A real Postgres (PGlite, in-process) with a minimal stand-in for Supabase's auth schema and roles,
// so the migration — tables, triggers, RLS policies, grants — runs and is tested exactly as written.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = ['0001_init.sql', '0002_limits.sql'].map((f) => fileURLToPath(new URL(`../migrations/${f}`, import.meta.url)));

const SUPABASE_STUB = `
  create schema if not exists auth;
  create table auth.users (id uuid primary key, email text unique, encrypted_password text, raw_user_meta_data jsonb not null default '{}', created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
  $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Supabase's default: API roles get table privileges, RLS decides which rows
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

export async function createDb() {
  const db = await PGlite.create();
  await db.exec(SUPABASE_STUB);
  for (const m of MIGRATIONS) await db.exec(readFileSync(m, 'utf8'));
  return db;
}

export async function createUser(db, id, email, meta = {}) {
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, JSON.stringify(meta)]);
}

/** Run `fn(tx)` as the API would for this user (role authenticated + JWT sub), or as anon when uid is null. */
export async function asUser(db, uid, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    return fn(tx);
  });
}
