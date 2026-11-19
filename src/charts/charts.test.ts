import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Track } from '../types.ts';
import { mergeChartTracks, normalizeTopTracks } from './normalize.ts';
import { pickBestMatch } from './match.ts';

const PH = 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';

test('geo.getTopTracks page → ChartTrack (rank from position, placeholder image dropped)', () => {
  const r = normalizeTopTracks({ tracks: { track: [
    { name: 'Chúng Ta Của Hiện Tại', artist: { name: 'Sơn Tùng M-TP' }, listeners: '5000', url: 'https://www.last.fm/music/x', image: [{ '#text': PH, size: 'extralarge' }], mbid: '' },
    { name: 'Blinding Lights', artist: { name: 'The Weeknd' }, listeners: 'n/a', playcount: '99', image: [{ '#text': 'https://img/x.jpg', size: 'large' }] },
    { name: '', artist: { name: 'Nobody' } },
    { name: 'No Artist' },
  ], '@attr': { page: '2', totalPages: '4', total: '80' } } }, 2, 20, 'vietnam');
  assert.equal(r.tracks.length, 2, 'entries without title or artist are dropped');
  assert.deepEqual(r.tracks[0], { key: 'son tung m tp|chung ta cua hien tai', title: 'Chúng Ta Của Hiện Tại', artist: 'Sơn Tùng M-TP', image: null, url: 'https://www.last.fm/music/x', listeners: 5000, playcount: null, rank: 21, source: 'vietnam' });
  assert.equal(r.tracks[1].image, 'https://img/x.jpg');
  assert.equal(r.tracks[1].listeners, null);
  assert.equal(r.tracks[1].rank, 22);
  assert.equal(r.totalPages, 4);
  const g = normalizeTopTracks({ tracks: { track: { name: 'Solo', artist: 'Someone' } } }, 1, 50, 'global');
  assert.equal(g.tracks[0].artist, 'Someone', 'artist given as a plain string; single object');
  assert.equal(g.tracks[0].source, 'global');
});

test('pages merge without duplicate songs', () => {
  const a = normalizeTopTracks({ tracks: { track: [{ name: 'Song A', artist: { name: 'X' } }, { name: 'Song B', artist: { name: 'Y' } }] } }, 1, 2, 'global').tracks;
  const b = normalizeTopTracks({ tracks: { track: [{ name: 'song b', artist: { name: 'y' } }, { name: 'Song C', artist: { name: 'Z' } }] } }, 2, 2, 'global').tracks;
  assert.deepEqual(mergeChartTracks(a, b).map((t) => t.title), ['Song A', 'Song B', 'Song C']);
});

const yt = (id: string, title: string, channel: string, extra: Partial<Track> = {}): Track => ({ id, provider: 'youtube', videoId: id, title, channel, channelId: null, views: 1000, duration: 230, isLive: false, license: 'standard', tags: [], ...extra });

test('YouTube match: same song, official upload preferred, other versions rejected', () => {
  const chart = { title: 'Blinding Lights', artist: 'The Weeknd' };
  const results = [
    yt('cover', 'Blinding Lights (Cover by Jane)', 'Jane Music'),
    yt('remix', 'The Weeknd - Blinding Lights (Remix)', 'DJ X'),
    yt('live', 'The Weeknd - Blinding Lights (Live at the Grammys)', 'The Weeknd'),
    yt('lyrics', 'The Weeknd - Blinding Lights (Lyrics)', 'Lyric Hub', { views: 9e8 }),
    yt('mv', 'The Weeknd - Blinding Lights (Official Video)', 'The Weeknd', { views: 1e9 }),
    yt('topic', 'Blinding Lights', 'The Weeknd - Topic', { views: 1e6 }),
    yt('other', 'The Weeknd - Save Your Tears (Official Audio)', 'The Weeknd'),
  ];
  assert.equal(pickBestMatch(chart, results)?.id, 'topic', 'Topic upload beats the MV and lyric videos');
  assert.equal(pickBestMatch(chart, results.filter((t) => t.id !== 'topic'))?.id, 'mv');
  assert.equal(pickBestMatch(chart, results.filter((t) => ['cover', 'remix', 'live', 'other'].includes(t.id))), null, 'never a cover/remix/live or a different song');
  assert.equal(pickBestMatch({ title: 'Blinding Lights (Remix)', artist: 'The Weeknd' }, results)?.id, 'remix', 'a remix on the chart resolves to the remix');
});

test('YouTube match: Vietnamese titles without diacritics differences; wrong artist rejected', () => {
  const chart = { title: 'Chúng Ta Của Hiện Tại', artist: 'Sơn Tùng M-TP' };
  const res = [yt('a', 'CHÚNG TA CỦA HIỆN TẠI | OFFICIAL MUSIC VIDEO | SƠN TÙNG M-TP', 'Sơn Tùng M-TP Official'), yt('b', 'Chúng Ta Của Hiện Tại - Ca sĩ khác', 'Ca sĩ khác')];
  assert.equal(pickBestMatch(chart, res)?.id, 'a');
  assert.equal(pickBestMatch(chart, [res[1]]), null);
});
