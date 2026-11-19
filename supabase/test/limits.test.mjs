// Plan-B storage limits (0002_limits.sql) on a real Postgres. Run: node --test supabase/test/limits.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { asUser, createDb, createUser } from './pg.mjs';

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';
let db;
before(async () => {
  db = await createDb();
  await createUser(db, A, 'a@limits.dev');
  await createUser(db, B, 'b@limits.dev');
});
const bulk = (uid, sql, n) => asUser(db, uid, (tx) => tx.query(sql, [uid, n]));
const count = async (uid, sql) => Number((await asUser(db, uid, (tx) => tx.query(sql))).rows[0].n);

test('favorites: 5,000 max; re-saving an existing one and un-deleting within the limit still work', async () => {
  await bulk(A, `insert into public.favorites (user_id, provider, track_id) select $1, 'youtube', 'f' || g from generate_series(1, $2) g`, 5000);
  await assert.rejects(asUser(db, A, (tx) => tx.query(`insert into public.favorites (user_id, provider, track_id) values ($1, 'youtube', 'one-more')`, [A])), /AMBERTUBE_LIMIT:favorites:5000/);
  // the sync pushes an edit of an existing favorite as an upsert: must not be refused
  await asUser(db, A, (tx) => tx.query(`insert into public.favorites (user_id, provider, track_id, track, changed_at) values ($1, 'youtube', 'f1', '{"title":"x"}', now()) on conflict (user_id, provider, track_id) do update set track = excluded.track, changed_at = excluded.changed_at`, [A]));
  // delete one → room for one
  await asUser(db, A, (tx) => tx.query(`update public.favorites set deleted = true, changed_at = now() where user_id = $1 and track_id = 'f2'`, [A]));
  await asUser(db, A, (tx) => tx.query(`insert into public.favorites (user_id, provider, track_id) values ($1, 'youtube', 'replacement')`, [A]));
  await assert.rejects(asUser(db, A, (tx) => tx.query(`update public.favorites set deleted = false, changed_at = now() + interval '1 second' where user_id = $1 and track_id = 'f2'`, [A])), /AMBERTUBE_LIMIT/, 'bringing a deleted one back counts too');
  // the limit is per user
  await asUser(db, B, (tx) => tx.query(`insert into public.favorites (user_id, provider, track_id) values ($1, 'youtube', 'b1')`, [B]));
});

test('playlists: 200 max; songs: 1,000 per playlist and 5,000 in total', async () => {
  await bulk(A, `insert into public.playlists (user_id, id, name) select $1, 'p' || g, 'List ' || g from generate_series(1, $2) g`, 200);
  await assert.rejects(asUser(db, A, (tx) => tx.query(`insert into public.playlists (user_id, id, name) values ($1, 'p201', 'x')`, [A])), /AMBERTUBE_LIMIT:playlists:200/);
  await bulk(A, `insert into public.playlist_tracks (user_id, playlist_id, provider, track_id) select $1, 'p1', 'youtube', 't' || g from generate_series(1, $2) g`, 1000);
  await assert.rejects(asUser(db, A, (tx) => tx.query(`insert into public.playlist_tracks (user_id, playlist_id, provider, track_id) values ($1, 'p1', 'youtube', 'extra')`, [A])), /AMBERTUBE_LIMIT:playlist_tracks:1000/);
  for (const p of ['p2', 'p3', 'p4', 'p5']) await asUser(db, A, (tx) => tx.query(`insert into public.playlist_tracks (user_id, playlist_id, provider, track_id) select $1, $2, 'youtube', 't' || g from generate_series(1, 1000) g`, [A, p]));
  await assert.rejects(asUser(db, A, (tx) => tx.query(`insert into public.playlist_tracks (user_id, playlist_id, provider, track_id) values ($1, 'p6', 'youtube', 'over')`, [A])), /AMBERTUBE_LIMIT:playlist_total:5000/);
});

test('rolling: recently played 500, listening stats 2,000, searches 100 (newest kept, nothing refused)', async () => {
  await bulk(B, `insert into public.listening_history (user_id, id, kind, provider, track_id, played_at) select $1, 'r' || g, 'recent', 'youtube', 'v', now() - (g || ' minutes')::interval from generate_series(1, $2) g`, 600);
  await bulk(B, `insert into public.listening_history (user_id, id, kind, provider, track_id, played_at) select $1, 'l' || g, 'listen', 'youtube', 'v', now() - (g || ' minutes')::interval from generate_series(1, $2) g`, 2100);
  await bulk(B, `insert into public.search_history (user_id, query_norm, query, searched_at) select $1, 'q' || g, 'q' || g, now() - (g || ' minutes')::interval from generate_series(1, $2) g`, 130);
  assert.equal(await count(B, `select count(*) n from public.listening_history where kind = 'recent'`), 500);
  assert.equal(await count(B, `select count(*) n from public.listening_history where kind = 'listen'`), 2000);
  assert.equal(await count(B, `select count(*) n from public.search_history`), 100);
  assert.equal(await count(B, `select count(*) n from public.listening_history where id = 'r1'`), 1, 'the newest are kept');
  assert.equal(await count(B, `select count(*) n from public.listening_history where id = 'r600'`), 0, 'the oldest rolled off');
  // a new search goes in, the oldest goes out
  await asUser(db, B, (tx) => tx.query(`insert into public.search_history (user_id, query_norm, query) values ($1, 'brand new', 'Brand new')`, [B]));
  assert.equal(await count(B, `select count(*) n from public.search_history where query_norm = 'brand new'`), 1);
  assert.equal(await count(B, `select count(*) n from public.search_history`), 100);
  // A's rows are untouched by B's rolling
  assert.equal(await count(A, `select count(*) n from public.favorites`), 5001);
});

test('daily clean-up: 180-day stats, 90-day deletion markers; not callable by users', async () => {
  await db.query(`insert into public.listening_history (user_id, id, kind, provider, track_id, played_at) values ($1, 'ancient', 'listen', 'youtube', 'v', now() - interval '200 days')`, [A]);
  await db.query(`update public.favorites set deleted = true where user_id = $1 and track_id = 'f3'`, [A]);
  await db.query(`alter table public.favorites disable trigger favorites_sync_guard`);
  await db.query(`update public.favorites set updated_at = now() - interval '100 days' where user_id = $1 and track_id = 'f3'`, [A]);
  await db.query(`alter table public.favorites enable trigger favorites_sync_guard`);
  await assert.rejects(asUser(db, A, (tx) => tx.query('select public.ambertube_cleanup()')), /permission denied/);
  await db.query('select public.ambertube_cleanup()');
  assert.equal(await count(A, `select count(*) n from public.listening_history where id = 'ancient'`), 0);
  assert.equal(await count(A, `select count(*) n from public.favorites where track_id = 'f3'`), 0);
  assert.equal(await count(A, `select count(*) n from public.favorites where track_id = 'f2'`), 1, 'a recent deletion marker stays');
});

test('usage report: only my own numbers', async () => {
  const u = (await asUser(db, B, (tx) => tx.query('select public.ambertube_my_usage() as u'))).rows[0].u;
  assert.equal(u.favorites, 1);
  assert.equal(u.recent, 500);
  assert.equal(u.listens, 2000);
  assert.equal(u.searches, 100);
  assert.ok(u.bytes > 0);
  await assert.rejects(asUser(db, null, (tx) => tx.query('select public.ambertube_my_usage()')), /permission denied/);
});
