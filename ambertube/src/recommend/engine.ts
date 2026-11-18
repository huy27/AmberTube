// Rule-based, explainable recommendation engine (pure; no UI imports).
//
// Pipeline: candidate hygiene → song-identity dedupe → context seed → weighted scoring
//           → penalties → diversity-aware selection → reasons.
//
// Signals actually available: uploader tags/category (→ approximate genres), language, artist
// (parsed from title/channel), featuring links, co-listening, real listening time/completion,
// skips, favourites, playlists, searches and explicit feedback. There is no audio analysis, so
// "style" is an approximation from metadata and behaviour — and reasons only cite real signals.
import type { Track } from '../types.ts';
import { aggregate, isRealListen, isSkip, type ListenEvent } from './listening.ts';
import { normalize } from '../search/normalize.ts';
import { dedupeSongs, info, isSameSong, cleanArtist } from './identity.ts';
import { GENRE_LABEL, MOOD_GENRES, genresOf, languageOf } from './style.ts';

// ------------------------------------------------------------------ types

export interface Feedback {
  notInterested: Record<string, number>; // trackId → when (temporary)
  blockedTracks: string[]; // legacy: video ids
  /** disliked songs by song identity — blocks every upload/version-equivalent of that song */
  dislikedSongs?: string[];
  blockedChannels: string[]; // normalized artist names
  styles: string[]; // cold-start style picks (mood search terms)
  moreLike: Track[];
  lessLike: Track[];
}

export const EMPTY_FEEDBACK: Feedback = { notInterested: {}, blockedTracks: [], dislikedSongs: [], blockedChannels: [], styles: [], moreLike: [], lessLike: [] };

export interface Inputs {
  events: ListenEvent[];
  favorites: Track[];
  playlistTracks: Track[];
  searches: { q: string; at: number }[];
  feedback: Feedback;
  pool: Track[];
  now: number;
  /** song keys recommended recently (and how often) — avoids repeating the same candidates across refreshes */
  recentlyRecommended?: Record<string, number>;
}

export type RadioMode = 'similar' | 'balanced' | 'discovery';

export type RecoContext =
  | { type: 'song'; track: Track } // Song Radio
  | { type: 'artist'; artist: string; sample?: Track } // Artist Radio
  | { type: 'my' } // My Radio (listening history)
  | { type: 'mood'; mood: string } // Mood Radio (MOODS id)
  | { type: 'autoplay'; track: Track }; // continue after the current song

export interface Weights {
  genre: number;
  artist: number;
  listening: number;
  favorites: number;
  language: number;
  discovery: number;
}

/** Initial weights (configurable). Components with no data for a candidate are dropped and the rest renormalised. */
export const DEFAULT_WEIGHTS: Weights = { genre: 0.25, artist: 0.2, listening: 0.2, favorites: 0.15, language: 0.1, discovery: 0.1 };

export const MODE_WEIGHTS: Record<RadioMode, Weights> = {
  similar: { genre: 0.35, artist: 0.25, listening: 0.15, favorites: 0.1, language: 0.1, discovery: 0.05 },
  balanced: DEFAULT_WEIGHTS,
  discovery: { genre: 0.3, artist: 0.1, listening: 0.15, favorites: 0.05, language: 0.1, discovery: 0.3 },
};

export interface RadioPick {
  track: Track;
  /** short reason backed by a real signal ('' when none is strong enough to state) */
  reason: string;
  score: number;
}

// ------------------------------------------------------------------ profile

const DAY = 86_400_000;
const decay = (age: number, halfLifeDays: number) => Math.pow(0.5, age / (halfLifeDays * DAY));
const add = (m: Map<string, number>, k: string, v: number) => k && m.set(k, (m.get(k) ?? 0) + v);
const maxOf = (m: Map<string, number>) => Math.max(1e-6, ...[...m.values()].map((v) => Math.abs(v)));

export const artistOf = (t: Track): string => info(t).artist || cleanArtist(t.channel);
/** kept for callers that block "this artist" */
export const channelKey = artistOf;

export interface SongStat {
  track: Track;
  plays: number;
  skips: number;
  listenSec: number;
  lastAt: number;
}

export interface Profile {
  songs: Map<string, SongStat>; // by song identity key
  genre: Map<string, number>;
  artist: Map<string, number>;
  lang: Map<string, number>;
  favArtists: Set<string>;
  favGenres: Map<string, number>;
  favSongs: Track[];
  /** artist → related artists (featuring links, co-listening) */
  related: Map<string, Map<string, number>>;
  /** artist → genres seen on that artist's tracks */
  artistGenres: Map<string, Map<string, number>>;
  knownArtists: Set<string>;
  longListener: boolean;
  evidence: number;
}

/** listening weight of one event: listening time first, completion matters for songs (not hour-long mixes) */
function listenWeight(e: ListenEvent): number {
  const completion = e.durationSec > 1200 || e.durationSec === 0 ? 1 : e.completion;
  return Math.min(2, 0.4 + e.listenedSec / 180) * (0.6 + 0.4 * completion);
}

function relate(p: Profile, a: string, b: string, w: number) {
  if (!a || !b || a === b) return;
  for (const [x, y] of [[a, b], [b, a]]) {
    const m = p.related.get(x) ?? new Map<string, number>();
    m.set(y, (m.get(y) ?? 0) + w);
    p.related.set(x, m);
  }
}

// One recommendation pass (Home shelves, a radio, an autoplay refill) asks for the profile and the
// de-duplicated pool several times with the same inputs — compute each once per Inputs object.
const profileCache = new WeakMap<Inputs, Profile>();
const poolCache = new WeakMap<Inputs, Track[]>();

/** Candidate pool without blocked/disliked music, one representative upload per song (cached per inputs). */
function cleanPool(inp: Inputs): Track[] {
  let pool = poolCache.get(inp);
  if (!pool) {
    pool = dedupeSongs(inp.pool.filter((t) => !isExcluded(t, inp.feedback, inp.now)));
    poolCache.set(inp, pool);
  }
  return pool;
}

export function buildProfile(inp: Inputs): Profile {
  const cached = profileCache.get(inp);
  if (cached) return cached;
  const p = computeProfile(inp);
  profileCache.set(inp, p);
  return p;
}

function computeProfile(inp: Inputs): Profile {
  const p: Profile = {
    songs: new Map(), genre: new Map(), artist: new Map(), lang: new Map(), favArtists: new Set(), favGenres: new Map(), favSongs: inp.favorites,
    related: new Map(), artistGenres: new Map(), knownArtists: new Set(), longListener: false, evidence: 0,
  };
  const bump = (t: Track, w: number) => {
    const a = artistOf(t);
    add(p.artist, a, w);
    for (const g of genresOf(t)) {
      add(p.genre, g, w);
      const ag = p.artistGenres.get(a) ?? new Map<string, number>();
      ag.set(g, (ag.get(g) ?? 0) + Math.abs(w));
      p.artistGenres.set(a, ag);
    }
    const l = languageOf(t);
    if (l) add(p.lang, l, w);
  };
  // featuring links from everything we know
  for (const t of [...inp.pool, ...inp.favorites, ...inp.events.map((e) => e.track)]) {
    const i = info(t);
    for (const f of i.featuring) relate(p, i.artist, f, 1);
    if (i.artist) {
      const ag = p.artistGenres.get(i.artist) ?? new Map<string, number>();
      for (const g of genresOf(t)) ag.set(g, (ag.get(g) ?? 0) + 0.2);
      p.artistGenres.set(i.artist, ag);
    }
  }
  // listening history, aggregated by song identity (all uploads of a song count together)
  let longSec = 0;
  let totalSec = 0;
  let prevReal: ListenEvent | null = null;
  for (const e of inp.events) {
    const key = info(e.track).key;
    const s = p.songs.get(key) ?? { track: e.track, plays: 0, skips: 0, listenSec: 0, lastAt: 0 };
    s.listenSec += e.listenedSec;
    s.lastAt = Math.max(s.lastAt, e.at);
    const age = inp.now - e.at;
    if (isRealListen(e)) {
      s.plays++;
      const w = listenWeight(e) * decay(age, 21);
      bump(e.track, w);
      p.evidence += w;
      p.knownArtists.add(artistOf(e.track));
      totalSec += e.listenedSec;
      if (e.durationSec > 1200) longSec += e.listenedSec;
      // artists enjoyed in the same session are related (co-listening)
      if (prevReal && e.at - prevReal.at < 2 * 3600_000) relate(p, artistOf(prevReal.track), artistOf(e.track), 0.5);
      prevReal = e;
    } else if (isSkip(e)) {
      // a skip is a mild negative signal, not a dislike
      s.skips++;
      bump(e.track, -0.25 * decay(age, 21));
    }
    p.songs.set(key, s);
  }
  p.longListener = totalSec > 0 && longSec / totalSec > 0.5;
  for (const t of inp.favorites) {
    bump(t, 1.4);
    p.evidence += 0.8;
    p.favArtists.add(artistOf(t));
    for (const g of genresOf(t)) add(p.favGenres, g, 1);
  }
  for (const t of inp.playlistTracks) {
    bump(t, 0.5);
    p.evidence += 0.25;
  }
  for (const t of inp.feedback.moreLike ?? []) {
    bump(t, 1.2);
    p.evidence += 0.6;
  }
  for (const t of inp.feedback.lessLike ?? []) bump(t, -0.9);
  for (const s of inp.searches.slice(0, 15)) for (const g of genresOf({ title: s.q })) add(p.genre, g, 0.3 * decay(inp.now - s.at, 14));
  for (const style of inp.feedback.styles) for (const g of genresOf({ title: style })) add(p.genre, g, 1);
  return p;
}

// ------------------------------------------------------------------ seeds (what "similar" means per context)

interface Seed {
  genres: Map<string, number>;
  artists: Map<string, number>;
  lang: Map<string, number>;
  long: boolean;
  /** artist that may appear more often (artist radio) */
  focusArtist?: string;
  /** track that started it (song radio / autoplay) */
  track?: Track;
  label?: string;
}

function trackGenres(t: Track, p: Profile): Map<string, number> {
  const out = new Map<string, number>();
  const own = genresOf(t);
  for (const g of own) out.set(g, 1);
  // no metadata on this upload → borrow what we know about the artist's other tracks (weaker)
  if (!own.length) {
    const ag = p.artistGenres.get(artistOf(t));
    if (ag) {
      const m = maxOf(ag);
      for (const [g, v] of ag) if (v / m > 0.3) out.set(g, (0.6 * v) / m);
    }
  }
  return out;
}

function songSeed(t: Track, p: Profile): Seed {
  const i = info(t);
  const artists = new Map<string, number>([[artistOf(t), 1]]);
  for (const f of i.featuring) artists.set(f, 0.8);
  const lang = new Map<string, number>();
  const l = languageOf(t);
  if (l) lang.set(l, 1);
  return { genres: trackGenres(t, p), artists, lang, long: t.duration > 900 || t.isLive, track: t, label: t.title };
}

function blend(a: Seed, b: Seed, wb: number): Seed {
  const mix = (x: Map<string, number>, y: Map<string, number>) => {
    const out = new Map<string, number>();
    for (const [k, v] of x) out.set(k, v * (1 - wb));
    for (const [k, v] of y) out.set(k, (out.get(k) ?? 0) + v * wb);
    return out;
  };
  return { ...a, genres: mix(a.genres, b.genres), artists: mix(a.artists, b.artists), lang: mix(a.lang, b.lang) };
}

function topN(m: Map<string, number>, n: number): Map<string, number> {
  const max = maxOf(m);
  return new Map([...m].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, v / max]));
}

function seedFor(ctx: RecoContext, inp: Inputs, p: Profile, pool: Track[]): Seed {
  switch (ctx.type) {
    case 'song':
      return songSeed(ctx.track, p);
    case 'autoplay': {
      // current song first, previous listening context second
      const s = songSeed(ctx.track, p);
      const recent = inp.events.filter((e) => isRealListen(e) && e.trackId !== ctx.track.id).slice(-3).map((e) => songSeed(e.track, p));
      return recent.reduce((acc, r) => blend(acc, r, 0.1), s);
    }
    case 'artist': {
      const a = normalize(ctx.artist);
      const tracks = pool.filter((t) => artistOf(t) === a);
      const genres = new Map<string, number>();
      for (const t of tracks) for (const [g, v] of trackGenres(t, p)) add(genres, g, v);
      for (const [g, v] of p.artistGenres.get(a) ?? []) add(genres, g, v);
      const lang = new Map<string, number>();
      for (const t of tracks) add(lang, languageOf(t), 1);
      return { genres: topN(genres, 4), artists: new Map([[a, 1], ...[...(p.related.get(a) ?? [])].map(([k]) => [k, 0.6] as [string, number])]), lang: topN(lang, 1), long: false, focusArtist: a, label: ctx.artist };
    }
    case 'mood': {
      const genres = new Map((MOOD_GENRES[ctx.mood] ?? []).map((g, i) => [g, 1 - i * 0.15] as [string, number]));
      return { genres, artists: new Map(), lang: topN(p.lang, 1), long: p.longListener, label: ctx.mood };
    }
    case 'my':
    default:
      return { genres: topN(p.genre, 5), artists: topN(p.artist, 6), lang: topN(p.lang, 1), long: p.longListener };
  }
}

// ------------------------------------------------------------------ scoring

export function isExcluded(t: Track, fb: Feedback, now: number): boolean {
  if (t.unavailable || t.provider === 'local' || t.isLive) return true;
  if (fb.blockedTracks.includes(t.id)) return true;
  if ((fb.dislikedSongs ?? []).includes(info(t).key)) return true;
  const a = artistOf(t);
  if (a && (fb.blockedChannels.includes(a) || fb.blockedChannels.includes(normalize(t.channel)))) return true;
  const ni = fb.notInterested[t.id];
  return ni !== undefined && now - ni < 60 * DAY;
}

/** Candidate hygiene: only playable music of a sensible length for the context. */
function valid(t: Track, _seed: Seed): boolean {
  if (t.categoryId && t.categoryId !== '10') return false; // not in YouTube's Music category
  if (t.duration > 0 && t.duration < 60) return false; // shorts / snippets
  return true;
}

interface Components {
  genre: number | null;
  artist: number;
  related: boolean;
  listening: number;
  favorites: number;
  language: number | null;
  discovery: number;
  overlap: string[];
}

function components(t: Track, seed: Seed, p: Profile): Components {
  const a = artistOf(t);
  const i = info(t);
  // genre / style overlap with the seed (null = unknown → excluded from the score)
  const cg = genresOf(t).length ? genresOf(t) : [...trackGenres(t, p).keys()];
  let genre: number | null = null;
  const overlap: string[] = [];
  if (cg.length && seed.genres.size) {
    const top = [...seed.genres.values()].sort((x, y) => y - x).slice(0, Math.max(1, Math.min(cg.length, 3)));
    const denom = top.reduce((s, v) => s + v, 0) || 1;
    let sum = 0;
    for (const g of cg) {
      const v = seed.genres.get(g) ?? 0;
      if (v > 0) overlap.push(g);
      sum += v;
    }
    genre = Math.min(1, sum / denom);
  }
  // artist: same artist, featured artist, or related through featuring / co-listening
  let artist = seed.artists.get(a) ?? 0;
  for (const f of i.featuring) artist = Math.max(artist, (seed.artists.get(f) ?? 0) * 0.8);
  let related = false;
  if (artist === 0) {
    for (const s of seed.artists.keys()) {
      const r = p.related.get(s)?.get(a) ?? 0;
      if (r > 0) {
        artist = Math.max(artist, Math.min(0.7, 0.35 + r * 0.15));
        related = true;
      }
    }
  }
  // the user's own taste (can be negative after skips / "less like this")
  const art = (p.artist.get(a) ?? 0) / maxOf(p.artist);
  let gsum = 0;
  for (const g of cg) gsum += (p.genre.get(g) ?? 0) / maxOf(p.genre);
  const gen = cg.length ? gsum / cg.length : 0;
  const listening = Math.max(-0.6, Math.min(1, art * 0.55 + gen * 0.45));
  // favourites
  let favorites = 0;
  if (p.favSongs.some((f) => isSameSong(f, t))) favorites = 1;
  else if (p.favArtists.has(a)) favorites = 0.8;
  else if (cg.length && p.favGenres.size) favorites = 0.4 * Math.min(1, cg.filter((g) => p.favGenres.has(g)).length / cg.length);
  // language
  const l = languageOf(t);
  const language = l && seed.lang.size ? (seed.lang.get(l) ?? 0) : null;
  // discovery
  const played = (p.songs.get(i.key)?.plays ?? 0) > 0;
  const discovery = played ? 0 : p.knownArtists.has(a) ? 0.5 : 1;
  return { genre, artist, related, listening, favorites, language, discovery, overlap };
}

function weighted(c: Components, w: Weights): number {
  const parts: [number | null, number][] = [[c.genre, w.genre], [c.artist, w.artist], [c.listening, w.listening], [c.favorites, w.favorites], [c.language, w.language], [c.discovery, w.discovery]];
  let sum = 0;
  let wsum = 0;
  for (const [v, wt] of parts) {
    if (v === null) continue;
    sum += v * wt;
    wsum += wt;
  }
  return wsum ? sum / wsum : 0;
}

/** Only state a reason that a real signal supports. */
function reasonFor(c: Components, seed: Seed, ctx: RecoContext, t: Track): string {
  const name = info(t).artistDisplay;
  if (ctx.type === 'artist' && c.artist >= 1 && name) return `Từ ${name}`;
  if (c.artist >= 0.99 && name && (ctx.type === 'song' || ctx.type === 'autoplay')) return `Cùng nghệ sĩ ${name}`;
  if (c.related && name) return 'Nghệ sĩ liên quan (thường nghe cùng / hợp tác)';
  if (c.genre !== null && c.genre >= 0.5 && c.overlap.length) {
    const labels = c.overlap.slice(0, 2).map((g) => GENRE_LABEL[g] ?? g).join(', ');
    return ctx.type === 'song' || ctx.type === 'autoplay' ? `Tương tự bài đang phát · ${labels}` : `Cùng phong cách nhạc · ${labels}`;
  }
  if (c.favorites >= 0.8 && name) return 'Từ nghệ sĩ bạn thích';
  if (c.listening >= 0.45) return 'Dựa trên lịch sử nghe của bạn';
  if (c.discovery === 1 && (c.genre ?? 0) > 0.2) return 'Khám phá nghệ sĩ mới';
  if (c.language === 1 && seed.lang.size) return 'Cùng ngôn ngữ';
  return '';
}

export interface PickOptions {
  mode?: RadioMode;
  weights?: Weights;
  /** tracks that must not be suggested again (queue, history window…) — compared by song identity */
  excludeTracks?: Track[];
  /** ids to exclude */
  exclude?: ReadonlySet<string>;
  random?: () => number;
  /** per-artist cap (default 2) */
  maxPerArtist?: number;
}

/**
 * Recommendations for a context, ranked and diversified.
 * Never returns two versions of one song, songs already excluded, or disliked/blocked music.
 */
export function contextPicks(ctx: RecoContext, inp: Inputs, n: number, opts: PickOptions = {}): RadioPick[] {
  const mode = opts.mode ?? 'balanced';
  const w = opts.weights ?? MODE_WEIGHTS[mode];
  const rnd = opts.random ?? Math.random;
  const p = buildProfile(inp);
  const seedTrack = ctx.type === 'song' || ctx.type === 'autoplay' ? ctx.track : undefined;

  const excluded = [...(opts.excludeTracks ?? []), ...(seedTrack ? [seedTrack] : [])];
  // just played (last 30 min) is never repeated; played in the last 3 h only fills in when nothing else fits
  const recentPlays = inp.events.filter((e) => inp.now - e.at < 30 * 60_000).map((e) => e.track);
  const lastHours = inp.events.filter((e) => inp.now - e.at < 3 * 3600_000).map((e) => e.track);
  let pool = opts.exclude ? cleanPool(inp).filter((t) => !opts.exclude!.has(t.id)) : cleanPool(inp);
  const seed = seedFor(ctx, inp, p, pool);
  pool = pool.filter((t) => valid(t, seed) && !excluded.some((x) => isSameSong(x, t)) && !recentPlays.some((x) => isSameSong(x, t)));

  const scored = pool.map((t) => {
    const c = components(t, seed, p);
    let score = weighted(c, w);
    // relevance gate: something must actually connect the candidate to the context
    // (when either side has no style info, a shared language is the only real link we have)
    const noStyleInfo = c.genre === null;
    const connected = (c.genre ?? 0) > 0 || c.artist > 0 || c.listening > 0.15 || c.favorites > 0 || (noStyleInfo && (c.language ?? 0) >= 0.5);
    if (!connected) score -= 0.25;
    const st = p.songs.get(info(t).key);
    if (st && inp.now - st.lastAt < DAY) score -= 0.15; // played earlier today
    const veryRecent = lastHours.some((x) => isSameSong(x, t));
    if (veryRecent) score -= 0.3; // played within the last few hours
    if (st) score -= Math.min(0.6, st.skips * 0.15); // skipped often
    score -= Math.min(0.3, (inp.recentlyRecommended?.[info(t).key] ?? 0) * 0.08); // shown recently, not played
    if (mode === 'discovery' && st && st.plays > 0) score -= 0.4;
    // hour-long mixes / streams after a normal-length song: allowed, but only when nothing closer fits
    if (!seed.long && t.duration > 15 * 60) score -= 0.15;
    score += rnd() * 0.04; // tiny jitter so refreshes don't return an identical list
    return { track: t, c, score, familiar: (st?.plays ?? 0) > 0 && !veryRecent, artist: artistOf(t) };
  }).filter((x) => x.score > 0.05).sort((a, b) => b.score - a.score);

  // ---- diversity-aware selection ----
  const cap = opts.maxPerArtist ?? 2;
  const out: RadioPick[] = [];
  const perArtist = new Map<string, number>();
  let last = seedTrack ? artistOf(seedTrack) : '';
  const remaining = [...scored];
  const familiarEvery = mode === 'balanced' ? 3 : mode === 'similar' ? 0 : -1;
  while (out.length < n && remaining.length) {
    const wantFamiliar = familiarEvery > 0 && out.length % familiarEvery === familiarEvery - 1;
    const allowedCap = (a: string) => (seed.focusArtist && a === seed.focusArtist ? Math.max(cap, 4) : cap);
    const ok = (x: (typeof remaining)[number], strictArtist: boolean) =>
      (perArtist.get(x.artist) ?? 0) < allowedCap(x.artist) && (!strictArtist || !x.artist || x.artist !== last) && !out.some((o) => isSameSong(o.track, x.track));
    let idx = -1;
    if (wantFamiliar) idx = remaining.findIndex((x) => x.familiar && ok(x, true));
    if (idx < 0) idx = remaining.findIndex((x) => (familiarEvery < 0 ? !x.familiar : true) && ok(x, true));
    if (idx < 0) idx = remaining.findIndex((x) => ok(x, false)); // relax "no same artist in a row"
    if (idx < 0) break; // only over-represented artists / duplicates remain
    const [x] = remaining.splice(idx, 1);
    out.push({ track: x.track, reason: reasonFor(x.c, seed, ctx, x.track), score: Math.round(x.score * 1000) / 1000 });
    perArtist.set(x.artist, (perArtist.get(x.artist) ?? 0) + 1);
    last = x.artist;
  }
  return out;
}

// ------------------------------------------------------------------ public helpers used by the app

export interface RadioOptions {
  mode?: RadioMode;
  exclude?: ReadonlySet<string>;
  excludeTracks?: Track[];
  random?: () => number;
}

/** Song Radio / Autoplay convenience wrapper. */
export function radioPicks(seed: Track, inp: Inputs, length = 20, opts: RadioOptions = {}, type: 'song' | 'autoplay' = 'song'): RadioPick[] {
  return contextPicks({ type, track: seed }, inp, length, opts);
}

export function radio(seed: Track, inp: Inputs, length = 20, random: () => number = Math.random): Track[] {
  return radioPicks(seed, inp, length, { random }).map((x) => x.track);
}

/** Style similarity between two tracks (0..1) — genres, artist relation and language; never title words. */
export function similarity(a: Track, b: Track, p?: Profile): number {
  if (isSameSong(a, b)) return 1;
  const prof = p ?? buildProfile({ events: [], favorites: [], playlistTracks: [], searches: [], feedback: EMPTY_FEEDBACK, pool: [a, b], now: 0 });
  const c = components(b, songSeed(a, prof), prof);
  return Math.max(0, Math.min(1, (c.genre ?? 0) * 0.6 + c.artist * 0.3 + (c.language ?? 0) * 0.1));
}

export interface Recommendations {
  coldStart: boolean;
  madeForYou: Track[];
  because: { seed: Track; items: Track[] } | null;
  dailyMix: Track[];
  discoverWeekly: Track[];
  similarArtists: { name: string; sample: Track; score: number }[];
  continueListening: Track[];
}

/** Placeholder while the first pass is computed (after the app shell has painted). */
export const EMPTY_RECS: Recommendations = { coldStart: false, madeForYou: [], because: null, dailyMix: [], discoverWeekly: [], similarArtists: [], continueListening: [] };

function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function recommend(inp: Inputs): Recommendations {
  const p = buildProfile(inp);
  const coldStart = p.evidence < 1.5;
  const fb = inp.feedback;

  // Continue listening: recently heard songs (one entry per song, newest first)
  const continueListening = [...p.songs.values()].filter((s) => s.plays > 0 && !isExcluded(s.track, fb, inp.now)).sort((a, b) => b.lastAt - a.lastAt).slice(0, 10).map((s) => s.track);

  if (coldStart) return { coldStart, madeForYou: [], because: null, dailyMix: [], discoverWeekly: [], similarArtists: [], continueListening };

  const day = new Date(inp.now).toDateString();
  const madeForYou = contextPicks({ type: 'my' }, inp, 10, { mode: 'balanced', random: seeded(`mfy${day}`) }).map((x) => x.track);

  const heardWell = (e: ListenEvent) => (e.durationSec > 1200 || e.durationSec === 0 ? e.listenedSec >= 60 : e.completion >= 0.4);
  const seedEvent = [...inp.events].reverse().find((e) => isRealListen(e) && heardWell(e) && !isExcluded(e.track, fb, inp.now));
  let because: Recommendations['because'] = null;
  if (seedEvent) {
    const items = contextPicks({ type: 'song', track: seedEvent.track }, inp, 8, { mode: 'similar', random: seeded(`b${day}`) }).map((x) => x.track);
    if (items.length) because = { seed: seedEvent.track, items };
  }

  // Daily mix: favourites/most played (one version each) + similar new songs, stable for the day
  const rnd = seeded(day);
  const familiar = dedupeSongs([
    ...[...p.songs.values()].filter((s) => s.plays > 0 && s.skips <= s.plays).sort((a, b) => b.plays * 2 + b.listenSec / 600 - (a.plays * 2 + a.listenSec / 600)).slice(0, 8).map((s) => s.track),
    ...inp.favorites.slice(0, 4),
  ].filter((t) => !isExcluded(t, fb, inp.now))).slice(0, 8);
  const fresh = contextPicks({ type: 'my' }, { ...inp, events: inp.events }, 6, { mode: 'discovery', excludeTracks: familiar, random: rnd }).map((x) => x.track);
  const a = [...familiar].sort(() => rnd() - 0.5);
  const b = [...fresh];
  const dailyMix: Track[] = [];
  while ((a.length || b.length) && dailyMix.length < 14) {
    if (a.length) dailyMix.push(a.shift()!);
    if (a.length && dailyMix.length < 14) dailyMix.push(a.shift()!);
    if (b.length && dailyMix.length < 14) dailyMix.push(b.shift()!);
  }

  const week = Math.floor(inp.now / (7 * DAY));
  const discoverWeekly = contextPicks({ type: 'my' }, inp, 8, { mode: 'discovery', random: seeded(`w${week}`), maxPerArtist: 1 })
    .filter((x) => !p.knownArtists.has(artistOf(x.track))).map((x) => x.track);

  // Similar artists: not yet listened to, close in style/language or related to artists you play
  const mySeed = seedFor({ type: 'my' }, inp, p, inp.pool);
  const byArtist = new Map<string, { name: string; sample: Track; score: number; n: number }>();
  for (const t of cleanPool(inp)) {
    const art = artistOf(t);
    if (!art || p.knownArtists.has(art)) continue;
    const c = components(t, mySeed, p);
    const s = (c.genre ?? 0) * 0.6 + (c.related ? 0.3 : 0) + (c.language ?? 0) * 0.1;
    if (s <= 0.15) continue;
    const cur = byArtist.get(art);
    if (!cur) byArtist.set(art, { name: info(t).artistDisplay || t.channel, sample: t, score: s, n: 1 });
    else { cur.score += s; cur.n++; }
  }
  const similarArtists = [...byArtist.values()].sort((x, y) => y.score / Math.sqrt(y.n) - x.score / Math.sqrt(x.n)).slice(0, 8).map(({ name, sample, score }) => ({ name, sample, score }));

  return { coldStart, madeForYou, because, dailyMix, discoverWeekly, similarArtists, continueListening };
}

export { isRealListen, isSkip, aggregate };
