// Shared YouTube quota counter (0003_api_usage.sql). Run: node --test supabase/test/api-usage.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { asUser, createDb } from './pg.mjs';

let db;
before(async () => { db = await createDb(); });
const rec = (uid, s, v, c) => asUser(db, uid, (tx) => tx.query('select public.ambertube_record_api_usage($1, $2, $3)', [s, v, c]));
const read = async (uid, days) => (await asUser(db, uid, (tx) => tx.query('select public.ambertube_api_usage($1) as r', [days]))).rows[0].r;

test('guests and users add to one shared counter; units = search*100 + videos + channels', async () => {
  await rec(null, 2, 5, 1);
  await rec('00000000-0000-4000-8000-0000000000a1', 1, 0, 0);
  const rows = await read(null, 7);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].search, rows[0].videos, rows[0].channels, rows[0].units], [3, 5, 1, 306]);
});

test('each number is capped per call, negatives and nulls are ignored', async () => {
  await rec(null, 100000, -5, null);
  const [r] = await read(null, 7);
  assert.equal(r.search, 503);
  assert.equal(r.videos, 5);
});

test('the table itself is closed to the API (no direct read/write, no counter reset)', async () => {
  await assert.rejects(asUser(db, null, (tx) => tx.query('select * from public.api_usage')), /permission denied/);
  await assert.rejects(asUser(db, null, (tx) => tx.query('update public.api_usage set search = 0')), /permission denied/);
  await assert.rejects(asUser(db, null, (tx) => tx.query('delete from public.api_usage')), /permission denied/);
});

test('old rows are pruned and the read window is clamped', async () => {
  await db.query(`insert into public.api_usage (day, search) values ((now() at time zone 'America/Los_Angeles')::date - 90, 1)`);
  await rec(null, 1, 0, 0);
  assert.equal(Number((await db.query('select count(*) n from public.api_usage where day < (now() at time zone \'America/Los_Angeles\')::date - 60')).rows[0].n), 0);
  assert.ok((await read(null, 9999)).length >= 1);
});
