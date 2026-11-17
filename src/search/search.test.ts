import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Track } from '../types.ts';
import { editDistance, highlightRanges, matchQuery, normalize } from './normalize.ts';
import { addToHistory, removeFromHistory } from './history.ts';
import { describeTrack, suggest } from './suggest.ts';

const tr = (id: string, title: string, channel: string, extra: Partial<Track> = {}): Track => ({
  id, provider: 'youtube', title, channel, channelId: null, views: 1000, duration: 230, isLive: false, license: 'standard', ...extra,
});

test('normalize folds Vietnamese diacritics, case and punctuation', () => {
  assert.equal(normalize('  Nhạc   Đen Vâu – Lối Nhỏ! '), 'nhac den vau loi nho');
});

test('matchQuery: prefix, word prefix, contains, fuzzy and no match', () => {
  assert.equal(matchQuery('lofi', 'Lofi Hip Hop').kind, 'prefix');
  assert.equal(matchQuery('hip', 'Lofi Hip Hop').kind, 'word-prefix');
  assert.equal(matchQuery('ip ho', 'Lofi Hip Hop').kind, 'contains');
  assert.equal(matchQuery('relxing', 'Relaxing Piano').kind, 'fuzzy');
  assert.equal(matchQuery('den vau', 'Đen Vâu - Bài Này Chill Phết').kind, 'prefix');
  assert.equal(matchQuery('xyz', 'Lofi').kind, null);
});

test('editDistance handles transpositions', () => {
  assert.equal(editDistance('lofi', 'loif'), 1);
  assert.equal(editDistance('acoustic', 'acuostic'), 1);
  assert.equal(editDistance('abc', 'xyz', 1), 2);
});

test('highlightRanges maps back to the original (accented) text', () => {
  const text = 'Đen Vâu – Lối Nhỏ';
  const r = highlightRanges(text, 'loi');
  assert.deepEqual(r.map(([a, b]) => text.slice(a, b)), ['Lối']);
});

test('history: newest first, no duplicates, removable', () => {
  let h = addToHistory([], 'lofi', 1);
  h = addToHistory(h, 'jazz', 2);
  h = addToHistory(h, ' LOFI ', 3);
  assert.deepEqual(h.map((x) => x.q), ['LOFI', 'jazz']);
  assert.deepEqual(removeFromHistory(h, 'lofi').map((x) => x.q), ['jazz']);
});

test('describeTrack uses real metadata only', () => {
  assert.deepEqual(describeTrack(tr('1', 'Sơn Tùng M-TP - Chúng Ta Của Hiện Tại', 'Sơn Tùng M-TP Official')), { kind: 'song', artist: 'Sơn Tùng M-TP' });
  assert.deepEqual(describeTrack(tr('2', 'Hãy Trao Cho Anh', 'Sơn Tùng M-TP - Topic')), { kind: 'song', artist: 'Sơn Tùng M-TP' });
  assert.deepEqual(describeTrack(tr('3', 'Lofi radio 24/7', 'Amber', { duration: 0, isLive: true })), { kind: 'video', artist: null });
});

test('suggest: empty input shows recent searches then trending', () => {
  const s = suggest('', { history: [{ q: 'lofi', at: 1 }], cachedQueries: [], tracks: [], trending: [tr('t', 'Top hit', 'X')] }, { limit: 8 });
  assert.deepEqual(s.map((x) => x.kind), ['recent', 'trending']);
});

test('suggest: typed input mixes queries, songs, artists and channels', () => {
  const tracks = [
    tr('a', 'Sơn Tùng M-TP - Chúng Ta Của Hiện Tại', 'Sơn Tùng M-TP Official'),
    tr('b', 'Lofi hip hop radio', 'Lofi Girlish', { duration: 0 }),
    tr('c', 'Sóng Gió', 'K-ICM'),
  ];
  const s = suggest('son tung', { history: [{ q: 'sơn tùng mtp', at: 1 }], cachedQueries: ['sơn tùng remix'], tracks, trending: [] }, { limit: 8 });
  const kinds = s.map((x) => x.kind);
  assert.ok(kinds.includes('recent'));
  assert.ok(kinds.includes('song'));
  assert.ok(kinds.includes('artist'));
  assert.ok(!s.some((x) => x.text === 'Sóng Gió'), 'unrelated tracks are not suggested');
  const compact = suggest('son tung', { history: [{ q: 'sơn tùng mtp', at: 1 }], cachedQueries: [], tracks, trending: [] }, { limit: 8, compact: true });
  assert.ok(compact.length <= 5);
});

test('suggest tolerates a typo', () => {
  const s = suggest('acuostic', { history: [], cachedQueries: [], tracks: [tr('x', 'Acoustic Morning Session', 'Field Notes')], trending: [] }, { limit: 8 });
  assert.equal(s[0]?.text, 'Acoustic Morning Session');
});
