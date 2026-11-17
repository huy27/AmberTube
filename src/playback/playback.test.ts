import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Track } from '../types.ts';
import { append, appendAuto, appendManual, clear, fromList, insertNext, move, pickNext, pickPrev, remove, removeUpcoming, upcomingCount, type QueueState } from './queue.ts';
import { effectiveSpeed, formatSpeed, supportedSpeeds } from './speeds.ts';
import { loadPlayerSnapshot, savePlayerSnapshot, DEFAULT_SNAPSHOT } from './persistence.ts';
import { activeLineIndex, isSynced, parseLrc } from '../services/lrc.ts';

const tr = (id: string, extra: Partial<Track> = {}): Track => ({
  id, provider: 'demo', title: id, channel: 'c', channelId: null, views: 0, duration: 100, isLive: false, license: 'owned', ...extra,
});
const ids = (q: QueueState) => q.items.map((t) => t.id).join(',');
const all = () => true;

test('fromList starts at the chosen track and de-duplicates', () => {
  const q = fromList([tr('a'), tr('b'), tr('a'), tr('c')], 'b');
  assert.equal(ids(q), 'a,b,c');
  assert.equal(q.index, 1);
});

test('insertNext places the track after the current one and keeps index', () => {
  const q = insertNext({ items: [tr('a'), tr('b'), tr('c')], index: 0 }, tr('c'));
  assert.equal(ids(q), 'a,c,b');
  assert.equal(q.index, 0);
});

test('append moves an existing track to the end but never the current one', () => {
  const base = { items: [tr('a'), tr('b'), tr('c')], index: 1 };
  assert.equal(ids(append(base, tr('a'))), 'b,c,a');
  assert.equal(append(base, tr('a')).index, 0);
  assert.equal(append(base, tr('b')), base);
});

test('remove keeps the current track and its index', () => {
  const q = remove({ items: [tr('a'), tr('b'), tr('c')], index: 2 }, 'a');
  assert.equal(ids(q), 'b,c');
  assert.equal(q.index, 1);
  const same = { items: [tr('a')], index: 0 };
  assert.equal(remove(same, 'a'), same);
});

test('move reorders and the index follows the current track', () => {
  const q = move({ items: [tr('a'), tr('b'), tr('c'), tr('d')], index: 1 }, 1, 3);
  assert.equal(ids(q), 'a,c,d,b');
  assert.equal(q.index, 3);
  const q2 = move({ items: [tr('a'), tr('b'), tr('c')], index: 0 }, 2, 0);
  assert.equal(ids(q2), 'c,a,b');
  assert.equal(q2.index, 1);
});

test('clear keeps only the current track', () => {
  assert.equal(ids(clear({ items: [tr('a'), tr('b'), tr('c')], index: 1 })), 'b');
  assert.equal(clear({ items: [tr('a')], index: -1 }).index, -1);
});

test('pickNext skips unplayable tracks and stops at the end when repeat is off', () => {
  const q = { items: [tr('a'), tr('x', { unavailable: true }), tr('c')], index: 0 };
  const playable = (t: Track) => !t.unavailable;
  assert.equal(pickNext(q, { shuffle: false, repeat: 'off', auto: true, isPlayable: playable })?.index, 2);
  assert.equal(pickNext({ ...q, index: 2 }, { shuffle: false, repeat: 'off', auto: true, isPlayable: playable }), null);
  assert.equal(pickNext({ ...q, index: 2 }, { shuffle: false, repeat: 'all', auto: true, isPlayable: playable })?.index, 0);
  // the user pressing Next always wraps
  assert.equal(pickNext({ ...q, index: 2 }, { shuffle: false, repeat: 'off', auto: false, isPlayable: playable })?.index, 0);
});

test('pickNext returns null when nothing else is playable', () => {
  const q = { items: [tr('a'), tr('b', { unavailable: true })], index: 0 };
  assert.equal(pickNext(q, { shuffle: false, repeat: 'all', auto: true, isPlayable: (t) => !t.unavailable }), null);
});

test('shuffle avoids tracks already played in this cycle and resets when exhausted', () => {
  const q = { items: [tr('a'), tr('b'), tr('c')], index: 0 };
  const p = pickNext(q, { shuffle: true, repeat: 'off', auto: true, isPlayable: all, played: new Set(['a', 'b']), random: () => 0 });
  assert.deepEqual(p, { index: 2, cycleReset: false });
  assert.equal(pickNext(q, { shuffle: true, repeat: 'off', auto: true, isPlayable: all, played: new Set(['a', 'b', 'c']) }), null);
  assert.equal(pickNext(q, { shuffle: true, repeat: 'all', auto: true, isPlayable: all, played: new Set(['a', 'b', 'c']), random: () => 0 })?.cycleReset, true);
});

test('pickPrev wraps and skips unplayable tracks', () => {
  const q = { items: [tr('a'), tr('b', { unavailable: true }), tr('c')], index: 0 };
  assert.equal(pickPrev(q, (t) => !t.unavailable), 2);
  assert.equal(pickPrev({ items: [tr('a')], index: 0 }, all), null);
});

test('speeds are limited to what the provider supports', () => {
  assert.deepEqual(supportedSpeeds([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]), [0.5, 0.75, 1, 1.25, 1.5, 2]);
  assert.deepEqual(supportedSpeeds([1]), [1]);
  assert.deepEqual(supportedSpeeds([]), [1]);
  assert.equal(effectiveSpeed(1.5, [1]), 1);
  assert.equal(effectiveSpeed(1.5, [0.5, 1, 2]), 1);
  assert.equal(effectiveSpeed(2, [0.5, 1, 2]), 2);
  assert.equal(formatSpeed(1), '1.0x');
  assert.equal(formatSpeed(0.75), '0.75x');
  assert.equal(formatSpeed(2), '2.0x');
});

test('player snapshot round-trips and never persists local files', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.deepEqual(loadPlayerSnapshot(storage), DEFAULT_SNAPSHOT);
  savePlayerSnapshot(storage, {
    ...DEFAULT_SNAPSHOT, volume: 33, rate: 1.25, shuffle: true, repeat: 'one', position: 42.7,
    queue: [tr('a'), tr('local1', { provider: 'local', src: 'blob:x' }), tr('b')], index: 2,
  });
  const snap = loadPlayerSnapshot(storage);
  assert.equal(snap.volume, 33);
  assert.equal(snap.rate, 1.25);
  assert.equal(snap.repeat, 'one');
  assert.equal(snap.queue.map((t) => t.id).join(','), 'a,b');
  assert.equal(snap.index, 1);
  assert.equal(snap.position, 42);
  store.set('ambertube:player:v1', '{"rate": 3, "volume": 900, "repeat": "x"}');
  const bad = loadPlayerSnapshot(storage);
  assert.equal(bad.rate, 1);
  assert.equal(bad.volume, 100);
  assert.equal(bad.repeat, 'off');
});

test('LRC parsing handles multiple stamps, offsets, metadata and unsynced text', () => {
  const lines = parseLrc('[ti:Song]\n[offset:+500]\n[00:01.00][00:05.50]Chorus\n[00:03.2]Verse');
  assert.deepEqual(lines.map((l) => [l.time, l.text]), [[0.5, 'Chorus'], [2.7, 'Verse'], [5, 'Chorus']]);
  assert.ok(isSynced(lines));
  const plain = parseLrc('\nfirst line\nsecond\n\n');
  assert.equal(plain.length, 2);
  assert.equal(isSynced(plain), false);
});

test('activeLineIndex finds the current lyric line', () => {
  const lines = parseLrc('[00:02.00]a\n[00:04.00]b\n[00:06.00]c');
  assert.equal(activeLineIndex(lines, 0), -1);
  assert.equal(activeLineIndex(lines, 2), 0);
  assert.equal(activeLineIndex(lines, 5.9), 1);
  assert.equal(activeLineIndex(lines, 99), 2);
});

test('manual queue additions go before auto recommendations', () => {
  const auto = new Set(['r1', 'r2']);
  const q = { items: [tr('a'), tr('m1'), tr('r1'), tr('r2')], index: 0 };
  const q2 = appendManual(q, tr('m2'), (id) => auto.has(id));
  assert.equal(ids(q2), 'a,m1,m2,r1,r2');
  assert.equal(ids(appendManual({ items: [tr('a')], index: 0 }, tr('m'), () => false)), 'a,m');
});

test('appendAuto never duplicates and removeUpcoming keeps history', () => {
  const q = { items: [tr('a'), tr('b'), tr('c')], index: 1 };
  const r = appendAuto(q, [tr('c'), tr('d'), tr('d'), tr('e')]);
  assert.equal(ids(r.state), 'a,b,c,d,e');
  assert.deepEqual(r.added.map((t) => t.id), ['d', 'e']);
  const cleaned = removeUpcoming(r.state, (t) => ['a', 'd', 'e'].includes(t.id));
  assert.equal(ids(cleaned), 'a,b,c');
  assert.equal(cleaned.index, 1);
  assert.equal(upcomingCount(cleaned), 1);
});
