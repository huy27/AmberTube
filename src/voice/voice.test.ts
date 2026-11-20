import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Track } from '../types.ts';
import { rankForVoice } from './rank.ts';

const yt = (id: string, title: string, channel: string, extra: Partial<Track> = {}): Track => ({ id: `yt:${id}`, provider: 'youtube', videoId: id, title, channel, channelId: null, views: 1, duration: 240, isLive: false, license: 'standard', ...extra });

test('spoken request → the official upload of that song, not a cover/karaoke that YouTube ranked first', () => {
  const r = rankForVoice('lối nhỏ đen vâu', [
    yt('a', 'Lối Nhỏ - Đen Vâu (Karaoke Beat)', 'Karaoke VN'),
    yt('b', 'Lối Nhỏ | Cover by Ai Đó', 'Ai Đó'),
    yt('c', 'Đen - Lối Nhỏ ft. Phương Anh Đào (M/V)', 'Đen Vâu Official'),
    yt('d', 'Lối Nhỏ', 'Đen - Topic'),
  ]);
  assert.equal(r[0].id, 'yt:d');
  assert.ok(['yt:c'].includes(r[1].id));
  assert.deepEqual(r.slice(2).map((t) => t.id).sort(), ['yt:a', 'yt:b']);
});

test('asking for a version gets that version; live streams, local files and hour-long mixes are not chosen', () => {
  const tracks = [yt('o', 'Hơn Cả Yêu - Đức Phúc (Official MV)', 'Đức Phúc'), yt('k', 'Hơn Cả Yêu Karaoke Tone Nam', 'Karaoke')];
  assert.equal(rankForVoice('hơn cả yêu karaoke', tracks)[0].id, 'yt:k');
  assert.equal(rankForVoice('hơn cả yêu', tracks)[0].id, 'yt:o');
  const r = rankForVoice('lofi chill', [yt('live', 'lofi chill radio 24/7', 'Lofi', { isLive: true }), yt('long', 'lofi chill 3 hours', 'Lofi', { duration: 3 * 3600 }), yt('ok', 'Lofi Chill Mix Bài Hát', 'Lofi')]);
  assert.equal(r[0].id, 'yt:ok');
  assert.ok(!r.some((t) => t.id === 'yt:live'));
  assert.equal(rankForVoice('x', [{ ...yt('l', 'x', 'me'), provider: 'local' }]).length, 0);
});

test('keeps YouTube order when nothing else distinguishes the results', () => {
  const r = rankForVoice('nhạc chill', [yt('1', 'Nhạc Chill Tiktok 2026', 'A'), yt('2', 'Nhạc Chill Nhẹ Nhàng', 'B')]);
  assert.deepEqual(r.map((t) => t.id), ['yt:1', 'yt:2']);
});
