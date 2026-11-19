// Database tests: RLS isolation, stale-write protection, settings merge. Run: node --test supabase/test/
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { asUser, createDb, createUser } from './pg.mjs';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
let db;
before(async () => {
  db = await createDb();
  await createUser(db, A, 'a@test.dev', { full_name: 'An' });
  await createUser(db, B, 'b@test.dev');
});

const fav = (uid, id, changed = '2026-01-01T00:00:00Z', deleted = false) => asUser(db, uid, (tx) => tx.query(
  `insert into public.favorites (user_id, provider, track_id, track, changed_at, deleted) values ($1, 'youtube', $2, '{"title":"x"}', $3, $4)
   on conflict (user_id, provider, track_id) do update set track = excluded.track, changed_at = excluded.changed_at, deleted = excluded.deleted
   returning track_id, deleted`, [uid, id, changed, deleted]));

test('signup creates a profile; users read only their own', async () => {
  const mine = await asUser(db, A, (tx) => tx.query('select id, display_name from public.profiles'));
  assert.deepEqual(mine.rows, [{ id: A, display_name: 'An' }]);
  const b = await asUser(db, B, (tx) => tx.query('select display_name from public.profiles'));
  assert.deepEqual(b.rows, [{ display_name: 'b' }]);
});

test('RLS: a user sees and changes only their own favorites', async () => {
  await fav(A, 'vidA');
  await fav(B, 'vidB');
  const a = await asUser(db, A, (tx) => tx.query('select track_id from public.favorites'));
  assert.deepEqual(a.rows.map((r) => r.track_id), ['vidA']);
  await assert.rejects(fav(A, 'sneaky').then(() => asUser(db, A, (tx) => tx.query(`insert into public.favorites (user_id, provider, track_id) values ($1, 'youtube', 'x')`, [B]))), /row-level security/);
  const upd = await asUser(db, A, (tx) => tx.query(`update public.favorites set deleted = true where track_id = 'vidB'`));
  assert.equal(upd.affectedRows, 0, "can't update another user's row");
  const del = await asUser(db, A, (tx) => tx.query(`delete from public.favorites where user_id = $1`, [B]));
  assert.equal(del.affectedRows, 0, "can't delete another user's rows");
  await asUser(db, A, (tx) => tx.query(`update public.favorites set user_id = $1 where track_id = 'vidA'`, [B]).catch(() => null));
  const still = await asUser(db, A, (tx) => tx.query(`select 1 from public.favorites where track_id = 'vidA'`));
  assert.equal(still.rows.length, 1, "can't hand a row to someone else (owner is kept)");
  const bRows = await asUser(db, B, (tx) => tx.query('select track_id, deleted from public.favorites order by track_id'));
  assert.deepEqual(bRows.rows, [{ track_id: 'vidB', deleted: false }]);
});

test('profiles: a user can create only their own profile (when the sign-up trigger is unavailable)', async () => {
  const C = '00000000-0000-4000-8000-00000000000c';
  await createUser(db, C, 'c@test.dev');
  await asUser(db, C, (tx) => tx.query('delete from public.profiles where id = $1', [C]).catch(() => null));
  await assert.rejects(asUser(db, C, (tx) => tx.query(`insert into public.profiles (id, display_name) values ($1, 'x')`, [A])), /row-level security|duplicate key/);
  await asUser(db, C, (tx) => tx.query(`insert into public.profiles (id, display_name) values ($1, 'Cường') on conflict (id) do nothing`, [C]));
  const r = await asUser(db, C, (tx) => tx.query('select display_name from public.profiles'));
  assert.equal(r.rows.length, 1);
});

test('RLS: signed-out (anon) gets nothing at all', async () => {
  await assert.rejects(asUser(db, null, (tx) => tx.query('select * from public.favorites')), /permission denied/);
  await assert.rejects(asUser(db, null, (tx) => tx.query('select * from public.profiles')), /permission denied/);
});

test("RLS: can't add tracks to someone else's playlist", async () => {
  await asUser(db, B, (tx) => tx.query(`insert into public.playlists (user_id, id, name) values ($1, 'plB', 'B list')`, [B]));
  await asUser(db, A, (tx) => tx.query(`insert into public.playlists (user_id, id, name) values ($1, 'plA', 'A list')`, [A]));
  await assert.rejects(asUser(db, A, (tx) => tx.query(`insert into public.playlist_tracks (user_id, playlist_id, provider, track_id) values ($1, 'plB', 'youtube', 'v')`, [A])), /row-level security|foreign key/);
  await asUser(db, A, (tx) => tx.query(`insert into public.playlist_tracks (user_id, playlist_id, provider, track_id) values ($1, 'plA', 'youtube', 'v')`, [A]));
  const b = await asUser(db, B, (tx) => tx.query('select * from public.playlist_tracks'));
  assert.equal(b.rows.length, 0);
});

test('every table: other users see none of my rows', async () => {
  await asUser(db, A, async (tx) => {
    await tx.query(`insert into public.search_history (user_id, query_norm, query) values ($1, 'son tung', 'Sơn Tùng')`, [A]);
    await tx.query(`insert into public.listening_history (user_id, id, kind, provider, track_id, played_at) values ($1, 'e1', 'recent', 'youtube', 'v', now())`, [A]);
    await tx.query(`insert into public.user_settings (user_id, data) values ($1, '{"autoplay":{"v":true,"t":1}}')`, [A]);
  });
  for (const t of ['favorites', 'listening_history', 'search_history', 'playlists', 'playlist_tracks', 'user_settings', 'profiles']) {
    const r = await asUser(db, B, (tx) => tx.query(`select * from public.${t} where ${t === 'profiles' ? 'id' : 'user_id'} = $1`, [A]));
    assert.equal(r.rows.length, 0, t);
  }
});

test('stale write from an offline device is ignored; newer wins; tombstones sync', async () => {
  await fav(A, 'song', '2026-03-01T10:00:00Z');
  const stale = await fav(A, 'song', '2026-03-01T09:00:00Z', true); // older delete arrives late
  assert.equal(stale.rows.length, 0, 'skipped');
  let r = await asUser(db, A, (tx) => tx.query(`select deleted from public.favorites where track_id = 'song'`));
  assert.equal(r.rows[0].deleted, false);
  await fav(A, 'song', '2026-03-01T11:00:00Z', true); // newer delete
  r = await asUser(db, A, (tx) => tx.query(`select deleted, updated_at > now() - interval '1 minute' as fresh from public.favorites where track_id = 'song'`));
  assert.deepEqual(r.rows[0], { deleted: true, fresh: true });
});

test('a client clock in the future cannot win forever', async () => {
  await fav(A, 'clock', '2099-01-01T00:00:00Z');
  const r = await asUser(db, A, (tx) => tx.query(`select changed_at < now() + interval '6 minutes' as clamped from public.favorites where track_id = 'clock'`));
  assert.equal(r.rows[0].clamped, true);
});

test('settings merge per setting: newest value of each wins', async () => {
  const up = (data) => asUser(db, A, (tx) => tx.query(`insert into public.user_settings (user_id, data) values ($1, $2) on conflict (user_id) do update set data = excluded.data, changed_at = excluded.changed_at`, [A, JSON.stringify(data)]));
  await up({ autoplay: { v: false, t: 5 }, visualizer: { v: 'wave', t: 5 } });
  await up({ autoplay: { v: true, t: 3 }, voiceLang: { v: 'en-US', t: 4 } }); // phone: older autoplay, new key
  const r = await asUser(db, A, (tx) => tx.query('select data from public.user_settings'));
  assert.deepEqual(r.rows[0].data, { autoplay: { v: false, t: 5 }, visualizer: { v: 'wave', t: 5 }, voiceLang: { v: 'en-US', t: 4 } });
});

test('validation: unknown provider, oversized metadata, empty playlist name are rejected', async () => {
  await assert.rejects(asUser(db, A, (tx) => tx.query(`insert into public.favorites (user_id, provider, track_id) values ($1, 'napster', 'x')`, [A])), /check/);
  await assert.rejects(asUser(db, A, (tx) => tx.query(`insert into public.favorites (user_id, provider, track_id, track) values ($1, 'youtube', 'big', $2)`, [A, JSON.stringify({ t: 'x'.repeat(20000) + Math.random() })])), /check/);
  await assert.rejects(asUser(db, A, (tx) => tx.query(`insert into public.playlists (user_id, id, name) values ($1, 'p', '   ')`, [A])), /check/);
});

test('prune function only touches my own old history', async () => {
  await asUser(db, B, (tx) => tx.query(`insert into public.listening_history (user_id, id, kind, provider, track_id, played_at) values ($1, 'old', 'listen', 'youtube', 'v', now() - interval '400 days')`, [B]));
  await asUser(db, A, (tx) => tx.query(`insert into public.listening_history (user_id, id, kind, provider, track_id, played_at) values ($1, 'old', 'listen', 'youtube', 'v', now() - interval '400 days')`, [A]));
  await asUser(db, A, (tx) => tx.query('select public.ambertube_prune_my_history(180)'));
  assert.equal((await asUser(db, A, (tx) => tx.query(`select 1 from public.listening_history where id = 'old'`))).rows.length, 0);
  assert.equal((await asUser(db, B, (tx) => tx.query(`select 1 from public.listening_history where id = 'old'`))).rows.length, 1);
});
