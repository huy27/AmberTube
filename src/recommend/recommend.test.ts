import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Track } from '../types.ts';
import { aggregate, isRealListen, isSkip, prune, type ListenEvent } from './listening.ts';
import { EMPTY_FEEDBACK, radio, radioPicks, recommend, similarity, type Inputs } from './engine.ts';

const NOW = new Date(2026, 10, 18, 12).getTime();
const tr = (id: string, title: string, channel: string, tags: string[] = [], extra: Partial<Track> = {}): Track => ({
  id, provider: 'demo', title, channel, channelId: null, views: 1000, duration: 240, isLive: false, license: 'owned', tags, ...extra,
});
const ev = (t: Track, listenedSec: number, completion: number, reason: ListenEvent['reason'] = 'ended', agoMin = 30): ListenEvent => ({
  id: `${t.id}-${agoMin}-${listenedSec}`, trackId: t.id, track: t, at: NOW - agoMin * 60_000, listenedSec, durationSec: t.duration, completion, reason,
});

const lofi1 = tr('l1', 'Lofi Rainy Night', 'Night Owl', ['lofi', 'rain', 'chill']);
const lofi2 = tr('l2', 'Lofi Study Beats', 'Amber Sessions', ['lofi', 'study', 'chill']);
const lofi3 = tr('l3', 'Chill Lofi Morning', 'Kettle', ['lofi', 'chill', 'morning']);
const metal1 = tr('m1', 'Thrash Metal Anthem', 'Iron Fist', ['metal', 'rock']);
const metal2 = tr('m2', 'Heavy Metal Riffs', 'Steel Wolf', ['metal', 'rock']);
const jazz = tr('j1', 'Cafe Jazz Piano', 'Quiet Hours', ['jazz', 'piano']);
const POOL = [lofi1, lofi2, lofi3, metal1, metal2, jazz];

const inputs = (events: ListenEvent[], extra: Partial<Inputs> = {}): Inputs => ({
  events, favorites: [], playlistTracks: [], searches: [], feedback: EMPTY_FEEDBACK, pool: POOL, now: NOW, ...extra,
});

test('selection vs real listening vs skip', () => {
  assert.equal(isRealListen({ listenedSec: 45, completion: 0.2, durationSec: 240 }), true);
  assert.equal(isRealListen({ listenedSec: 8, completion: 0.03, durationSec: 240 }), false);
  assert.equal(isSkip({ listenedSec: 8, completion: 0.03, durationSec: 240, reason: 'skipped' }), true);
  assert.equal(isSkip({ listenedSec: 1, completion: 0, durationSec: 240, reason: 'skipped' }), false, 'accidental taps are ignored');
  assert.equal(isSkip({ listenedSec: 8, completion: 0.03, durationSec: 240, reason: 'stopped' }), false);
});

test('aggregate counts plays and skips separately', () => {
  const s = aggregate([ev(lofi1, 200, 0.9), ev(lofi1, 5, 0.02, 'skipped', 10), ev(lofi1, 120, 0.5, 'switched', 5)]).get('l1')!;
  assert.equal(s.plays, 2);
  assert.equal(s.skips, 1);
  assert.equal(s.listenSec, 325);
});

test('prune applies the retention policy', () => {
  const old = { ...ev(lofi1, 100, 1), at: NOW - 200 * 86_400_000 };
  assert.equal(prune([old, ev(lofi2, 100, 1)], NOW).length, 1);
});

test('cold start until there is real listening', () => {
  assert.equal(recommend(inputs([])).coldStart, true);
  assert.equal(recommend(inputs([ev(lofi1, 4, 0.01, 'skipped')])).coldStart, true, 'a brief skip is not a preference');
});

test('recommendations follow actual listening behaviour', () => {
  const lofiFan = recommend(inputs([ev(lofi1, 230, 0.96, 'ended', 90), ev(lofi2, 220, 0.92, 'ended', 60)]));
  assert.equal(lofiFan.coldStart, false);
  assert.equal(lofiFan.madeForYou[0].id, 'l3', 'unplayed similar track ranks first');
  assert.ok(!lofiFan.madeForYou.slice(0, 1).some((t) => t.id.startsWith('m')));
  const metalFan = recommend(inputs([ev(metal1, 240, 1, 'ended', 90), ev(metal1, 230, 0.95, 'ended', 50)]));
  assert.equal(metalFan.madeForYou[0].id, 'm2');
});

test('because-you-listened uses the latest real listen as seed', () => {
  const r = recommend(inputs([ev(metal1, 240, 1, 'ended', 200), ev(lofi1, 200, 0.9, 'ended', 20)]));
  assert.equal(r.because?.seed.id, 'l1');
  assert.ok(['l2', 'l3'].includes(r.because!.items[0].id));
});

test('daily mix mixes familiar and new tracks and is stable within a day', () => {
  const i = inputs([ev(lofi1, 230, 0.96, 'ended', 90), ev(lofi2, 220, 0.92, 'ended', 60)]);
  const a = recommend(i).dailyMix;
  assert.ok(a.some((t) => t.id === 'l1') && a.some((t) => t.id === 'l3'));
  assert.deepEqual(recommend(i).dailyMix.map((t) => t.id), a.map((t) => t.id));
});

test('discover weekly only suggests unplayed artists', () => {
  const r = recommend(inputs([ev(lofi1, 230, 0.96, 'ended', 90), ev(lofi2, 220, 0.92, 'ended', 60)]));
  assert.ok(r.discoverWeekly.every((t) => !['Night Owl', 'Amber Sessions'].includes(t.channel)));
});

test('feedback removes tracks and artists', () => {
  const evs = [ev(lofi1, 230, 0.96, 'ended', 90), ev(lofi2, 220, 0.92, 'ended', 60)];
  const r1 = recommend(inputs(evs, { feedback: { ...EMPTY_FEEDBACK, blockedTracks: ['l3'] } }));
  assert.ok(!r1.madeForYou.some((t) => t.id === 'l3'));
  const r2 = recommend(inputs(evs, { feedback: { ...EMPTY_FEEDBACK, blockedChannels: ['kettle'] } }));
  assert.ok(!r2.madeForYou.some((t) => t.channel === 'Kettle'));
  const r3 = recommend(inputs(evs, { feedback: { ...EMPTY_FEEDBACK, notInterested: { l3: NOW - 1000 } } }));
  assert.ok(!r3.madeForYou.some((t) => t.id === 'l3'));
});

test('repeated skips push a track down', () => {
  const evs = [ev(lofi1, 230, 0.96, 'ended', 300), ev(lofi3, 6, 0.02, 'skipped', 200), ev(lofi3, 5, 0.02, 'skipped', 100), ev(lofi3, 7, 0.03, 'skipped', 50)];
  const r = recommend(inputs(evs));
  assert.notEqual(r.madeForYou[0]?.id, 'l3');
});

test('smart radio builds a related queue without the seed or repeats', () => {
  const q = radio(lofi1, inputs([]), 10, () => 0.5);
  assert.ok(!q.some((t) => t.id === 'l1'));
  assert.equal(new Set(q.map((t) => t.id)).size, q.length);
  assert.ok(['l2', 'l3'].includes(q[0].id), 'most similar first');
  assert.ok(similarity(lofi1, lofi2) > similarity(lofi1, metal1));
});

test('radio modes: recently played excluded, exclude is respected, reasons are given', () => {
  const evs = [ev(lofi2, 220, 0.92, 'ended', 60 * 26)]; // yesterday — familiar but not "just played"
  const disc = radioPicks(lofi1, inputs(evs), 10, { mode: 'discovery', random: () => 0.5 });
  assert.ok(disc.length > 0);
  assert.notEqual(disc[0].track.id, 'l2', 'discovery prefers songs the user has not heard');
  const sim = radioPicks(lofi1, inputs(evs), 10, { mode: 'similar', random: () => 0.5, exclude: new Set(['l3']) });
  assert.ok(!sim.some((x) => x.track.id === 'l3'));
  assert.equal(sim[0].track.id, 'l2');
  assert.ok(sim[0].reason.length > 0);
  const recent = radioPicks(lofi1, inputs([ev(lofi2, 220, 0.92, 'ended', 20)]), 10, { mode: 'similar', random: () => 0.5 });
  assert.ok(!recent.some((x) => x.track.id === 'l2'), 'a song played 20 minutes ago is not recommended again');
});

test('less like this pushes similar tracks down; more like this pulls them up', () => {
  const base = inputs([ev(jazz, 200, 0.9, 'ended', 100), ev(lofi1, 200, 0.9, 'ended', 90)]);
  const less = recommend({ ...base, feedback: { ...EMPTY_FEEDBACK, lessLike: [lofi1] } });
  const more = recommend({ ...base, feedback: { ...EMPTY_FEEDBACK, moreLike: [lofi1] } });
  const rank = (r: ReturnType<typeof recommend>) => r.madeForYou.findIndex((t) => t.id === 'l2' || t.id === 'l3');
  assert.ok(rank(more) <= rank(less) || rank(less) === -1);
});

// ---------------- recommendation engine overhaul ----------------
import { contextPicks } from './engine.ts';
import { appendAuto } from '../playback/queue.ts';
import { info } from './identity.ts';
import { languageOf } from './style.ts';
const infoKey = (t: Track) => info(t).key;

const yt = (id: string, title: string, channel: string, genres: string[], duration = 230, extra: Partial<Track> = {}): Track => ({
  id, provider: 'youtube', videoId: id, title, channel, channelId: null, views: 1000, duration, isLive: false, license: 'standard', tags: [], genres, categoryId: '10', ...extra,
});
const seed = yt('s0', 'Mây - Đêm Thu (Official Audio)', 'Mây', ['ballad', 'vpop'], 240, { lang: 'vi' });
const dupes = [
  yt('s1', 'Mây - Đêm Thu (Official MV)', 'Mây', ['ballad', 'vpop'], 248, { lang: 'vi' }),
  yt('s2', 'Đêm Thu', 'Mây - Topic', ['ballad', 'vpop'], 240, { lang: 'vi' }),
  yt('s3', 'Mây - Đêm Thu | Lyrics', 'Lyrics VN', ['ballad', 'vpop'], 241, { lang: 'vi' }),
];
const others = [
  yt('a1', 'Hà Anh - Mùa Xa (Official Audio)', 'Hà Anh', ['ballad', 'vpop'], 250, { lang: 'vi' }),
  yt('a2', 'Hà Anh - Phố Cũ (Official Audio)', 'Hà Anh', ['ballad', 'vpop'], 230, { lang: 'vi' }),
  yt('a3', 'Hà Anh - Gió Lạnh (Official Audio)', 'Hà Anh', ['ballad', 'vpop'], 220, { lang: 'vi' }),
  yt('b1', 'Minh Khoa - Chiều Mưa (Official Audio)', 'Minh Khoa', ['ballad', 'acoustic'], 210, { lang: 'vi' }),
  yt('b2', 'Minh Khoa - Hẹn Ước (Official Audio)', 'Minh Khoa', ['ballad', 'vpop'], 215, { lang: 'vi' }),
  yt('c1', 'Lan Vy - Xa Rồi (Official Audio)', 'Lan Vy', ['ballad', 'sad'], 205, { lang: 'vi' }),
  yt('c2', 'Mây - Ngày Xanh (Official Audio)', 'Mây', ['ballad', 'vpop'], 235, { lang: 'vi' }),
  yt('d1', 'Brutal Riffs - Inferno', 'Brutal Riffs', ['metal'], 300),
  yt('r1', 'Mây - Đêm Thu (Remix)', 'DJ Hải', ['edm', 'vpop'], 200, { lang: 'vi' }),
];
const pool2 = [seed, ...dupes, ...others];
const inp2 = (extra: Partial<Inputs> = {}): Inputs => ({ events: [], favorites: [], playlistTracks: [], searches: [], feedback: EMPTY_FEEDBACK, pool: pool2, now: NOW, ...extra });
const pick = (extra: Partial<Inputs> = {}, n = 8, opts = {}) => contextPicks({ type: 'autoplay', track: seed }, inp2(extra), n, { random: () => 0.5, ...opts });

test('song radio never returns another upload of the seed song', () => {
  const ids = pick().map((p) => p.track.id);
  assert.ok(ids.length >= 4);
  for (const d of ['s1', 's2', 's3']) assert.ok(!ids.includes(d), `${d} is the same song`);
});

test('no two uploads of the same song in one batch', () => {
  const extraDupes = [yt('a1b', 'Hà Anh - Mùa Xa (Lyrics)', 'Lyric Box', ['ballad', 'vpop'], 251, { lang: 'vi' })];
  const res = contextPicks({ type: 'autoplay', track: seed }, inp2({ pool: [...pool2, ...extraDupes] }), 10, { random: () => 0.5 });
  const ids = res.map((p) => p.track.id);
  assert.ok(!(ids.includes('a1') && ids.includes('a1b')));
});

test('similar style from different artists ranks above an unrelated genre', () => {
  const ids = pick({}, 10).map((p) => p.track.id);
  const iMetal = ids.indexOf('d1');
  const iBallad = ids.findIndex((x) => ['a1', 'a2', 'b1', 'b2', 'c1'].includes(x));
  assert.ok(iBallad >= 0);
  assert.ok(iMetal === -1 || iMetal > iBallad);
  assert.ok(new Set(pick({}, 6).map((p) => p.track.channel)).size >= 3, 'mixes several artists');
});

test('diversity: at most 2 per artist, no back-to-back same artist', () => {
  const res = pick({}, 8);
  const count: Record<string, number> = {};
  res.forEach((p) => (count[p.track.channel] = (count[p.track.channel] ?? 0) + 1));
  assert.ok(Object.values(count).every((n) => n <= 2), JSON.stringify(count));
  for (let i = 1; i < res.length; i++) assert.notEqual(res[i].track.channel, res[i - 1].track.channel);
});

test('recently played songs (any upload) are excluded', () => {
  const played = yt('a1x', 'Hà Anh - Mùa Xa [Official MV]', 'Hà Anh', ['ballad', 'vpop'], 255, { lang: 'vi' });
  const res = pick({ events: [ev(played, 240, 0.95, 'ended', 20)] }, 8);
  assert.ok(!res.some((p) => p.track.id === 'a1'), 'same song as one played 20 min ago');
  const hourAgo = pick({ events: [ev(played, 240, 0.95, 'ended', 90)] }, 8).map((p) => p.track.id);
  assert.ok(!hourAgo.includes('a1') || hourAgo.indexOf('a1') >= hourAgo.length - 2, 'played 90 min ago only fills in at the end: ' + hourAgo.join(','));
});

test('disliked songs and blocked artists are never recommended', () => {
  const fb = { ...EMPTY_FEEDBACK, dislikedSongs: ['hà anh|mua xa|original'], blockedChannels: ['minh khoa'] };
  // build dislike key from the identity module to avoid hard-coding normalization
  const res = pick({ feedback: { ...fb, dislikedSongs: [infoKey(others[0])] } }, 10);
  assert.ok(!res.some((p) => p.track.id === 'a1'));
  assert.ok(!res.some((p) => p.track.channel === 'Minh Khoa'));
});

test('queue insertion dedupes by song identity and keeps the manual queue', () => {
  const manual = yt('m1', 'Hà Anh - Phố Cũ (Official Audio)', 'Hà Anh', ['ballad'], 230);
  const q = { items: [seed, manual], index: 0 };
  const { state, added } = appendAuto(q, [yt('dupe', 'Hà Anh - Phố Cũ (Lyrics)', 'Lyric Box', ['ballad'], 231), others[0], dupes[0]]);
  assert.deepEqual(added.map((t) => t.id), ['a1'], 'other upload of a queued song and of the current song are skipped');
  assert.deepEqual(state.items.map((t) => t.id), ['s0', 'm1', 'a1']);
});

test('empty or insufficient candidates return what is valid (no filler)', () => {
  assert.deepEqual(contextPicks({ type: 'autoplay', track: seed }, inp2({ pool: [seed, ...dupes] }), 8), []);
  const few = contextPicks({ type: 'autoplay', track: seed }, inp2({ pool: [seed, others[0]] }), 8);
  assert.equal(few.length, 1);
});

test('repeated refreshes rotate candidates instead of repeating the same list', () => {
  const first = pick({}, 4).map((p) => p.track.id);
  const shown: Record<string, number> = {};
  for (const id of first) shown[infoKey(pool2.find((t) => t.id === id)!)] = 3;
  const second = pick({ recentlyRecommended: shown }, 4).map((p) => p.track.id);
  assert.notDeepEqual(second, first);
});

test('short clips and non-music uploads are filtered out', () => {
  const clip = yt('clip', 'Hà Anh - Mùa Xa teaser', 'Hà Anh', ['ballad'], 25);
  const vlog = yt('vlog', 'Hà Anh behind the scenes vlog', 'Hà Anh', ['ballad'], 600, { categoryId: '22' });
  const res = contextPicks({ type: 'autoplay', track: seed }, inp2({ pool: [seed, clip, vlog] }), 8);
  assert.equal(res.length, 0);
});

test('mood and my radio contexts produce picks; reasons only cite real signals', () => {
  const mood = contextPicks({ type: 'mood', mood: 'sad' }, inp2(), 6, { random: () => 0.5 });
  assert.ok(mood.length > 0 && mood.every((p) => !p.track.genres?.includes('metal')));
  const listened = inp2({ events: [ev(others[0], 240, 0.95, 'ended', 60 * 30), ev(others[3], 200, 0.9, 'ended', 60 * 28)] });
  const my = contextPicks({ type: 'my' }, listened, 6, { random: () => 0.5 });
  assert.ok(my.length > 0);
  const cold = contextPicks({ type: 'autoplay', track: seed }, inp2(), 6, { random: () => 0.5 });
  assert.ok(!cold.some((p) => /lịch sử nghe|bạn thích/i.test(p.reason)), 'no history → never claims history-based reasons');
});

test('English music category: no songs known to be in another language', () => {
  const en = [yt('e1', 'Adele - Hello (Official Audio)', 'Adele', ['pop', 'ballad'], 295, { lang: 'en' }), yt('e2', 'Coldplay - Yellow (Official Audio)', 'Coldplay', ['rock', 'pop'], 266, { lang: 'en' })];
  const res = contextPicks({ type: 'mood', mood: 'english' }, inp2({ pool: [...pool2, ...en] }), 8, { random: () => 0.5 });
  assert.ok(res.length >= 2);
  assert.ok(res.every((p) => languageOf(p.track) !== 'vi'), res.map((p) => p.track.title).join(', '));
});
