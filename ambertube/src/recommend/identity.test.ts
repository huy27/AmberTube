import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Track } from '../types.ts';
import { classifyVersion, dedupeSongs, info, isSameSong } from './identity.ts';

const tr = (id: string, title: string, channel: string, duration = 240, extra: Partial<Track> = {}): Track => ({
  id, provider: 'youtube', videoId: id, title, channel, channelId: null, views: 1000, duration, isLive: false, license: 'standard', tags: [], ...extra,
});

test('same song uploaded with different video ids is one song', () => {
  const a = tr('v1', 'Sơn Tùng M-TP - Chúng Ta Của Hiện Tại (Official Music Video)', 'Sơn Tùng M-TP Official', 301);
  const b = tr('v2', 'Chúng Ta Của Hiện Tại', 'Sơn Tùng M-TP - Topic', 290);
  const c = tr('v3', 'Sơn Tùng M-TP | Chúng Ta Của Hiện Tại | Lyrics Video', 'Lyrics Hub VN', 295);
  assert.ok(isSameSong(a, b), 'MV vs Topic audio');
  assert.ok(isSameSong(a, c) || isSameSong(b, c), 'lyric re-upload');
});

test('Official Audio vs Music Video vs Lyrics are the same song', () => {
  const audio = tr('a', 'Coldplay - Yellow (Official Audio)', 'Coldplay', 269);
  const mv = tr('b', 'Coldplay - Yellow (Official Video)', 'Coldplay', 272);
  const lyr = tr('c', 'Coldplay - Yellow [Lyrics]', 'Some Lyrics Channel', 268);
  assert.ok(isSameSong(audio, mv));
  assert.ok(isSameSong(audio, lyr));
  assert.equal(info(audio).key, info(mv).key);
});

test('remix / live / acoustic / cover are kept as different songs', () => {
  const orig = tr('o', 'Coldplay - Yellow (Official Audio)', 'Coldplay', 269);
  for (const [title, v] of [
    ['Coldplay - Yellow (Live at Glastonbury)', 'live'],
    ['Coldplay - Yellow (Remix)', 'remix'],
    ['Coldplay - Yellow (Acoustic)', 'acoustic'],
    ['Yellow - Coldplay (Cover by Jane)', 'cover'],
    ['Coldplay - Yellow (Instrumental)', 'instrumental'],
  ] as const) {
    assert.equal(classifyVersion(title), v, title);
    assert.ok(!isSameSong(orig, tr(v, title, 'X', 270)), `${v} must stay distinct`);
  }
});

test('different songs by the same artist are not merged', () => {
  const a = tr('a', 'Coldplay - Yellow (Official Audio)', 'Coldplay', 269);
  const b = tr('b', 'Coldplay - Fix You (Official Audio)', 'Coldplay', 295);
  const c = tr('c', 'Coldplay - Yellow Submarine Dreams', 'Coldplay', 200);
  assert.ok(!isSameSong(a, b));
  assert.ok(!isSameSong(a, c), 'a title that merely starts the same and has a very different length');
});

test('dedupeSongs keeps one clean representative per song', () => {
  const list = [
    tr('lyr', 'Coldplay - Yellow [Lyrics]', 'Lyrics Hub', 268, { views: 9e6 }),
    tr('topic', 'Yellow', 'Coldplay - Topic', 269, { views: 1e6 }),
    tr('fix', 'Coldplay - Fix You (Official Audio)', 'Coldplay', 295),
  ];
  const out = dedupeSongs(list);
  assert.deepEqual(out.map((t) => t.id).sort(), ['fix', 'topic']);
});

test('numbered parts and near-identical short titles are not merged', () => {
  assert.ok(!isSameSong(tr('p1', 'Lofi Mix - Part 1', 'Lofi Mix', 240), tr('p2', 'Lofi Mix - Part 2', 'Lofi Mix', 240)));
  assert.ok(!isSameSong(tr('y', 'Coldplay - Yellow', 'Coldplay', 240), tr('m', 'Coldplay - Mellow', 'Coldplay', 240)));
  assert.ok(isSameSong(tr('t1', 'Sơn Tùng - Hãy Trao Cho Anh', 'X', 245), tr('t2', 'Sơn Tùng - Hãy Trao Cho Anhh', 'Y', 246)), 'typo-level difference');
});
