import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Track } from '../types.ts';
import { SyncEngine, SyncError, emptyMeta, type Remote, type RemoteRow } from './engine.ts';
import { keyOfRow, mergeGuestInto, guestCounts, restoreTrack, snapshot, trackRef, type Content, type LocalData, type Table } from './model.ts';

// ---------- an in-memory server with the same rules as the SQL migration ----------
class FakeServer {
  tables = new Map<Table, Map<string, RemoteRow>>();
  favCap = Infinity;
  clock = Date.parse('2026-01-01T00:00:00Z');
  offline = false;
  calls = 0;
  private tick() { this.clock += 1000; return new Date(this.clock).toISOString(); }
  rows(t: Table) { if (!this.tables.has(t)) this.tables.set(t, new Map()); return this.tables.get(t)!; }
  remote(userId: string): Remote {
    const guard = () => { this.calls++; if (this.offline) throw new SyncError('offline', 'network'); };
    return {
      pull: async (table, since, { offset, limit }) => {
        guard();
        return [...this.rows(table).values()]
          .filter((r) => r.user_id === userId && (since ? r.updated_at > since : !r.deleted))
          .sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(offset, offset + limit).map((r) => structuredClone(r));
      },
      upsert: async (table, rows) => {
        guard();
        for (const row of rows) {
          assert.equal(row.user_id, userId);
          const key = table === 'user_settings' ? String(row.user_id) : `${userId}|${keyOfRow(table, row)}`;
          const old = this.rows(table).get(key);
          if (table === 'user_settings') {
            const data = { ...((old?.data ?? {}) as Record<string, { t: number }>) };
            for (const [k, v] of Object.entries(row.data as Record<string, { t: number }>)) if (!data[k] || data[k].t <= v.t) data[k] = v;
            this.rows(table).set(key, { ...row, data, updated_at: this.tick() } as unknown as RemoteRow);
            continue;
          }
          if (old && Date.parse(String(row.changed_at)) < Date.parse(old.changed_at)) continue; // stale write
          if (table === 'favorites' && !row.deleted && (!old || old.deleted) && [...this.rows(table).values()].filter((r) => r.user_id === userId && !r.deleted).length >= this.favCap) {
            throw new SyncError(`AMBERTUBE_LIMIT:favorites:${this.favCap}`, 'limit');
          }
          this.rows(table).set(key, { ...structuredClone(row), updated_at: this.tick() } as unknown as RemoteRow);
        }
      },
      markDeleted: async (table, eq, col, values, changedAt) => {
        guard();
        for (const r of this.rows(table).values()) {
          if (r.user_id !== userId || !values.includes(String(r[col])) || Object.entries(eq).some(([k, v]) => r[k] !== v)) continue;
          if (Date.parse(changedAt) < Date.parse(r.changed_at)) continue;
          Object.assign(r, { deleted: true, changed_at: changedAt, updated_at: this.tick() });
        }
      },
    };
  }
}

const yt = (v: string, title = `Song ${v}`, extra: Partial<Track> = {}): Track => ({
  id: `yt:${v}`, provider: 'youtube', videoId: v, title, channel: 'Artist', channelId: 'UCx', views: 10, duration: 200, isLive: false, license: 'standard',
  thumbnail: `https://i.ytimg.com/vi/${v}/mqdefault.jpg`, tags: ['x'], ...extra,
});
const empty = (): LocalData => ({ saved: [], history: [], listens: [], searches: [], playlists: [], settings: {} });

/** One device: local data + its sync engine, with a controllable clock. */
function device(server: FakeServer, uid = 'u1', start = empty()) {
  const dev = { data: start, clock: Date.parse('2026-01-02T00:00:00Z'), engine: null as unknown as SyncEngine };
  dev.engine = new SyncEngine(server.remote(uid), uid, { read: () => dev.data, write: (d) => { dev.data = d; } }, emptyMeta(), () => dev.clock);
  return dev;
}

test('favorite on desktop → appears on the phone with its metadata; local files never sync', async () => {
  const s = new FakeServer();
  const desk = device(s); const phone = device(s);
  desk.data = { ...desk.data, saved: [yt('aaaaaaaaaa1', 'Chúng Ta Của Hiện Tại', { addedAt: 5 }), { ...yt('x'), id: 'local:1', provider: 'local' }] };
  await desk.engine.sync();
  assert.equal(s.rows('favorites').size, 1, 'the local file is not uploaded');
  const row = [...s.rows('favorites').values()][0];
  assert.equal(row.provider, 'youtube'); assert.equal(row.track_id, 'aaaaaaaaaa1');
  assert.ok(!('tags' in (row.track as Content)), 'only the metadata snapshot is stored');
  await phone.engine.sync();
  assert.equal(phone.data.saved.length, 1);
  assert.equal(phone.data.saved[0].title, 'Chúng Ta Của Hiện Tại');
  assert.equal(phone.data.saved[0].id, 'yt:aaaaaaaaaa1');
  assert.equal(phone.data.saved[0].videoId, 'aaaaaaaaaa1', 'playable by the existing YouTube player');
  // nothing to do on a second round
  assert.deepEqual(await phone.engine.sync(), { pulled: 0, pushed: 0, rejected: 0 });
  assert.deepEqual(await desk.engine.sync(), { pulled: 0, pushed: 0, rejected: 0 });
});

test('unfavorite on one device removes it everywhere (tombstone), and the same song from two devices is one row', async () => {
  const s = new FakeServer();
  const a = device(s); const b = device(s);
  a.data = { ...a.data, saved: [yt('bbbbbbbbbb1', 'B', { addedAt: 1 })] };
  b.data = { ...b.data, saved: [yt('bbbbbbbbbb1', 'B', { addedAt: 2 })] };
  await a.engine.sync(); b.clock += 10; await b.engine.sync(); await a.engine.sync();
  assert.equal(s.rows('favorites').size, 1, 'no duplicate');
  b.clock += 1000; b.data = { ...b.data, saved: [] };
  await b.engine.sync();
  assert.equal([...s.rows('favorites').values()][0].deleted, true);
  await a.engine.sync();
  assert.equal(a.data.saved.length, 0);
});

test('playlists + tracks sync in order; deleting a playlist removes it on other devices', async () => {
  const s = new FakeServer();
  const a = device(s); const b = device(s);
  a.data = { ...a.data, playlists: [{ id: 'p1', name: 'Đi xe', createdAt: 1, tracks: [yt('ccccccccc01', 'One', { addedAt: 10 }), yt('ccccccccc02', 'Two', { addedAt: 20 })] }] };
  await a.engine.sync();
  await b.engine.sync();
  assert.deepEqual(b.data.playlists.map((p) => [p.name, p.tracks.map((t) => t.title)]), [['Đi xe', ['One', 'Two']]]);
  b.clock += 1000;
  b.data = { ...b.data, playlists: [{ ...b.data.playlists[0], name: 'Đi xe VF5', tracks: [b.data.playlists[0].tracks[1]] }] };
  await b.engine.sync(); a.clock += 2000; await a.engine.sync();
  assert.deepEqual(a.data.playlists.map((p) => [p.name, p.tracks.map((t) => t.title)]), [['Đi xe VF5', ['Two']]]);
  a.clock += 1000; a.data = { ...a.data, playlists: [] };
  await a.engine.sync(); await b.engine.sync();
  assert.equal(b.data.playlists.length, 0);
});

test('concurrent edits: the newer change wins, even when the older device syncs last', async () => {
  const s = new FakeServer();
  const a = device(s); const b = device(s);
  a.data = { ...a.data, playlists: [{ id: 'p', name: 'Gốc', createdAt: 1, tracks: [] }] };
  await a.engine.sync(); await b.engine.sync();
  // A renames at 10:00 while offline; B renames at 10:05 and syncs; A comes back online afterwards
  a.clock = Date.parse('2026-01-03T10:00:00Z'); a.data = { ...a.data, playlists: [{ ...a.data.playlists[0], name: 'Tên của A' }] }; a.engine.scan();
  b.clock = Date.parse('2026-01-03T10:05:00Z'); b.data = { ...b.data, playlists: [{ ...b.data.playlists[0], name: 'Tên của B' }] };
  await b.engine.sync();
  await a.engine.sync();
  assert.equal(a.data.playlists[0].name, 'Tên của B');
  assert.equal([...s.rows('playlists').values()][0].name, 'Tên của B');
  // and the other way round: A's newer offline edit beats B's older one
  b.clock = Date.parse('2026-01-03T11:00:00Z'); b.data = { ...b.data, playlists: [{ ...b.data.playlists[0], name: 'B lúc 11h' }] }; b.engine.scan();
  a.clock = Date.parse('2026-01-03T11:30:00Z'); a.data = { ...a.data, playlists: [{ ...a.data.playlists[0], name: 'A lúc 11h30' }] };
  await a.engine.sync(); await b.engine.sync(); await a.engine.sync();
  assert.equal(b.data.playlists[0].name, 'A lúc 11h30');
});

test('offline / failed sync keeps every local change and retries later', async () => {
  const s = new FakeServer();
  const a = device(s);
  s.offline = true;
  a.data = { ...a.data, saved: [yt('ddddddddd01', 'Offline fav', { addedAt: 3 })], searches: [{ q: 'Đen Vâu', at: 5 }] };
  await assert.rejects(a.engine.sync(), (e: unknown) => e instanceof SyncError && e.kind === 'network');
  assert.equal(a.data.saved.length, 1, 'local data untouched');
  s.offline = false;
  await a.engine.sync(); // first successful round
  a.clock += 1000;
  a.data = { ...a.data, saved: [yt('ddddddddd02', 'Second', { addedAt: 4 }), ...a.data.saved] };
  s.offline = true;
  await assert.rejects(a.engine.sync());
  assert.equal(a.engine.pendingCount, 1, 'the change waits');
  s.offline = false;
  await a.engine.sync();
  assert.equal(a.engine.pendingCount, 0);
  assert.equal(s.rows('favorites').size, 2);
  assert.equal([...s.rows('search_history').values()][0].query, 'Đen Vâu');
});

test('local size limits never delete cloud history; clearing history does', async () => {
  const s = new FakeServer();
  const a = device(s);
  const entries = Array.from({ length: 200 }, (_, i) => ({ entryId: `e${i}`, track: yt(`eeeeeeee${String(i).padStart(3, '0')}`), playedAt: 1_000_000 + i }));
  a.data = { ...a.data, history: entries.slice().reverse() };
  await a.engine.sync();
  assert.equal(s.rows('listening_history').size, 200);
  // a new play pushes the oldest entry out of the local 200 → it stays in the cloud
  a.clock += 1000;
  a.data = { ...a.data, history: [{ entryId: 'new', track: yt('fffffffff01'), playedAt: 2_000_000 }, ...a.data.history.slice(0, 199)] };
  await a.engine.sync();
  assert.equal([...s.rows('listening_history').values()].filter((r) => r.deleted).length, 0);
  a.clock += 1000; a.data = { ...a.data, history: [] };
  await a.engine.sync();
  assert.equal([...s.rows('listening_history').values()].filter((r) => !r.deleted).length, 1, 'cleared (only the trimmed one, never on this device, stays)');
});

test("a new device's default settings never override the account's", async () => {
  const s = new FakeServer();
  const a = device(s); const b = device(s);
  a.data = { ...a.data, settings: { 'lib.visualizer': 'spectrum', 'lib.autoplay': false } };
  await a.engine.sync();
  b.clock += 60_000; b.data = { ...b.data, settings: { 'lib.visualizer': 'wave', 'lib.autoplay': true, 'lib.bitrate': 192 } }; // fresh defaults
  await b.engine.sync();
  assert.deepEqual(b.data.settings, { 'lib.visualizer': 'spectrum', 'lib.autoplay': false, 'lib.bitrate': 192 });
  await a.engine.sync();
  assert.deepEqual(a.data.settings, { 'lib.visualizer': 'spectrum', 'lib.autoplay': false, 'lib.bitrate': 192 }, 'only the setting the account never had is added');
});

test('listening statistics and settings sync; settings merge per setting', async () => {
  const s = new FakeServer();
  const a = device(s); const b = device(s);
  a.data = { ...a.data, listens: [{ id: 'L1', trackId: 'yt:ggggggggg01', track: yt('ggggggggg01'), at: Date.parse('2026-01-01T12:00:00Z'), listenedSec: 187.123456, durationSec: 200, completion: 0.93571, reason: 'ended' }], settings: { 'lib.autoplay': false, 'lib.visualizer': 'spectrum' } };
  await a.engine.sync();
  b.clock += 5000; b.data = { ...b.data, settings: { 'lib.voiceLang': 'en-US' } };
  await b.engine.sync();
  assert.equal(b.data.listens[0].listenedSec, 187.123);
  assert.equal(b.data.listens[0].reason, 'ended');
  assert.deepEqual(b.data.settings, { 'lib.autoplay': false, 'lib.visualizer': 'spectrum', 'lib.voiceLang': 'en-US' });
  await a.engine.sync();
  assert.deepEqual(a.data.settings, { 'lib.autoplay': false, 'lib.visualizer': 'spectrum', 'lib.voiceLang': 'en-US' });
  assert.deepEqual(await a.engine.sync(), { pulled: 0, pushed: 0, rejected: 0 }, 'converged');
});

test('rows from a provider this version cannot play are left alone (never deleted)', async () => {
  const s = new FakeServer();
  const a = device(s);
  s.rows('favorites').set('u1|radio-browser|st1', { user_id: 'u1', provider: 'radio-browser', track_id: 'st1', track: { title: 'VOV' }, created_at: '2026-01-01T00:00:00Z', changed_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:01Z', deleted: false });
  await a.engine.sync(); a.clock += 1000; await a.engine.sync();
  assert.equal(a.data.saved.length, 0);
  assert.equal(s.rows('favorites').get('u1|radio-browser|st1')!.deleted, false);
});

test('accounts are separate: a second user never receives the first user\'s rows', async () => {
  const s = new FakeServer();
  const u1 = device(s, 'u1'); const u2 = device(s, 'u2');
  u1.data = { ...u1.data, saved: [yt('hhhhhhhhh01', 'Riêng tư', { addedAt: 1 })] };
  await u1.engine.sync(); await u2.engine.sync();
  assert.equal(u2.data.saved.length, 0);
});

test('guest → account: merged without duplicates or overwrites', () => {
  const account: LocalData = {
    ...empty(),
    saved: [yt('iiiiiiiii01', 'Account title', { addedAt: 100 })],
    playlists: [{ id: 'acc1', name: 'Chill', createdAt: 1, tracks: [yt('iiiiiiiii02')] }],
    settings: { 'lib.autoplay': true },
    searches: [{ q: 'son tung', at: 10 }],
  };
  const guest: LocalData = {
    ...empty(),
    saved: [yt('iiiiiiiii01', 'Guest title'), yt('iiiiiiiii03', 'Guest only', { addedAt: 50 }), { ...yt('z'), id: 'local:9', provider: 'local' }],
    playlists: [
      { id: 'pl-focus', name: 'Tập trung đêm khuya', createdAt: 1, tracks: [] }, // untouched default: skipped
      { id: 'g1', name: 'chill', createdAt: 2, tracks: [yt('iiiiiiiii02'), yt('iiiiiiiii04')] }, // same name → merged
      { id: 'acc1', name: 'Road trip', createdAt: 3, tracks: [yt('iiiiiiiii05')] }, // id clash → new id
    ],
    settings: { 'lib.autoplay': false, 'lib.visualizer': 'spectrum' },
    searches: [{ q: 'Sơn Tùng', at: 20 }, { q: 'Hà Anh Tuấn', at: 5 }],
    history: [{ entryId: 'h1', track: yt('iiiiiiiii06'), playedAt: 7 }],
  };
  assert.deepEqual(guestCounts(guest), { favorites: 2, playlists: 2, history: 1, searches: 2 });
  const { data: m, skipped } = mergeGuestInto(account, guest, new Set(['lib.autoplay']), Date.now(), () => 'new-id');
  assert.equal(skipped, 0);
  assert.deepEqual(m.saved.map((t) => t.title), ['Account title', 'Guest only'], 'account version kept, local file skipped');
  assert.deepEqual(m.playlists.map((p) => [p.id, p.name, p.tracks.length]), [['acc1', 'Chill', 2], ['new-id', 'Road trip', 1]]);
  assert.deepEqual(m.settings, { 'lib.autoplay': true, 'lib.visualizer': 'spectrum' }, "account setting not overwritten");
  assert.deepEqual(m.searches.map((x) => x.q), ['Sơn Tùng', 'Hà Anh Tuấn']);
  assert.equal(m.history.length, 1);
});

test('restoring tracks: provider ids are validated; snapshot fields are type-checked', () => {
  assert.equal(restoreTrack('youtube', 'bad id!', {}), null);
  assert.equal(restoreTrack('spotify', 'x', {}), null);
  const t = restoreTrack('youtube', 'jjjjjjjjj01', { title: 'T', duration: '5', thumbnail: 'http://insecure', views: 3 })!;
  assert.equal(t.title, 'T'); assert.equal(t.duration, 0); assert.equal(t.thumbnail, 'https://i.ytimg.com/vi/jjjjjjjjj01/mqdefault.jpg'); assert.equal(t.views, 3);
  assert.deepEqual(trackRef(t), { provider: 'youtube', track_id: 'jjjjjjjjj01' });
  assert.ok(!('tags' in snapshot(yt('jjjjjjjjj01'))));
});

test('account limit: what fits syncs, the rest waits (no retry loop) and goes up once there is room', async () => {
  const s = new FakeServer();
  s.favCap = 2;
  const a = device(s);
  a.data = { ...a.data, saved: [yt('kkkkkkkkk01', 'One', { addedAt: 3 }), yt('kkkkkkkkk02', 'Two', { addedAt: 2 }), yt('kkkkkkkkk03', 'Three', { addedAt: 1 })] };
  const r = await a.engine.sync();
  assert.equal(r.rejected, 1);
  assert.equal([...s.rows('favorites').values()].filter((x) => !x.deleted).length, 2);
  assert.equal(a.engine.rejectedCount, 1);
  assert.equal(a.data.saved.length, 3, 'nothing removed locally');
  const before = s.calls;
  a.clock += 1000;
  assert.deepEqual(await a.engine.sync(), { pulled: 0, pushed: 0, rejected: 0 });
  assert.ok(s.calls - before <= 6, 'no hammering the server with the refused item');
  // the user removes a favorite → room → the waiting one is sent
  const synced = [...s.rows('favorites').values()].map((x) => x.track_id);
  a.clock += 1000;
  a.data = { ...a.data, saved: a.data.saved.filter((t) => t.videoId !== synced[0]) };
  await a.engine.sync();
  a.clock += 1000;
  await a.engine.sync();
  assert.equal([...s.rows('favorites').values()].filter((x) => !x.deleted).length, 2);
  assert.equal(a.engine.rejectedCount, 0);
});

test('guest merge respects account limits and reports what was left out', () => {
  const caps = { favorites: 3, playlists: 2, playlistTracks: 2, playlistTotal: 3 };
  const user: LocalData = { ...empty(), saved: [yt('mmmmmmmmm01', 'u1', { addedAt: 9 }), yt('mmmmmmmmm02', 'u2', { addedAt: 8 })], playlists: [{ id: 'u', name: 'Mine', createdAt: 1, tracks: [yt('mmmmmmmmm10')] }] };
  const guest: LocalData = {
    ...empty(),
    saved: [yt('mmmmmmmmm03', 'g1'), yt('mmmmmmmmm04', 'g2'), yt('mmmmmmmmm05', 'g3')],
    playlists: [
      { id: 'g1', name: 'Mine', createdAt: 2, tracks: [yt('mmmmmmmmm11'), yt('mmmmmmmmm12')] },
      { id: 'g2', name: 'Other', createdAt: 3, tracks: [yt('mmmmmmmmm13'), yt('mmmmmmmmm14')] },
      { id: 'g3', name: 'Third', createdAt: 4, tracks: [] },
    ],
  };
  const { data, skipped } = mergeGuestInto(user, guest, new Set(), Date.now(), () => 'n', caps);
  assert.equal(data.saved.length, 3);
  assert.equal(data.playlists.length, 2);
  assert.equal(data.playlists.reduce((n, p) => n + p.tracks.length, 0), 3);
  assert.ok(data.playlists.every((p) => p.tracks.length <= 2));
  assert.equal(skipped, 2 + 2 + 1, '2 favorites, 2 songs, 1 playlist');
});
