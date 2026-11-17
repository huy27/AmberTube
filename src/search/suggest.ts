// Autocomplete engine (pure). Builds suggestions only from real data the app already has:
// search history, cached search results, the user's library/history and trending results
// from the official API (or the demo catalogue). Nothing is invented.
import type { Track } from '../types.ts';
import { matchQuery, normalize } from './normalize.ts';
import type { HistoryItem } from './history.ts';

export type SuggestionKind = 'recent' | 'query' | 'song' | 'artist' | 'video' | 'channel' | 'trending';

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  /** text shown (and searched for query-like suggestions) */
  text: string;
  /** secondary line, e.g. channel name */
  sub?: string;
  track?: Track;
  score: number;
}

export interface SuggestSources {
  history: HistoryItem[];
  /** previously executed queries that have cached results */
  cachedQueries: string[];
  /** every track the app knows about (cached results, library, history, demo catalogue) */
  tracks: Track[];
  trending: Track[];
}

export interface SuggestOptions {
  limit: number;
  /** car view: fewer rows, recent + exact matches first */
  compact?: boolean;
}

const TOPIC = / - Topic$/i;
const DASH = /\s[-–—]\s/;

/** Classify a track from its real metadata: auto-generated "Artist - Topic" channels and short "Artist - Title" uploads are songs. */
export function describeTrack(t: Track): { kind: 'song' | 'video'; artist: string | null } {
  if (TOPIC.test(t.channel)) return { kind: 'song', artist: t.channel.replace(TOPIC, '') };
  const short = t.duration > 0 && t.duration <= 600;
  if (short && DASH.test(t.title)) return { kind: 'song', artist: t.title.split(DASH)[0].trim() };
  if (t.provider === 'demo' && short) return { kind: 'song', artist: t.channel };
  return { kind: 'video', artist: null };
}

const KIND_WEIGHT: Record<SuggestionKind, number> = { recent: 0.35, query: 0.25, song: 0.2, artist: 0.18, video: 0.1, channel: 0.12, trending: 0 };

export function suggest(input: string, src: SuggestSources, opts: SuggestOptions): Suggestion[] {
  const q = normalize(input);
  const limit = opts.compact ? Math.min(opts.limit, 5) : opts.limit;

  // ---- empty input: recent searches + trending ----
  if (!q) {
    const recent: Suggestion[] = src.history.slice(0, opts.compact ? 4 : 6).map((h, i) => ({ id: `r:${h.q}`, kind: 'recent', text: h.q, score: 1 - i * 0.01 }));
    const trend: Suggestion[] = src.trending.slice(0, opts.compact ? 2 : 4).map((t, i) => ({ id: `t:${t.id}`, kind: 'trending', text: t.title, sub: t.channel, track: t, score: 0.5 - i * 0.01 }));
    return [...recent, ...trend].slice(0, limit);
  }

  const out = new Map<string, Suggestion>();
  const add = (s: Suggestion) => {
    const key = `${s.kind === 'recent' || s.kind === 'query' ? 'q' : s.kind}:${normalize(s.text)}`;
    const prev = out.get(key);
    if (!prev || prev.score < s.score) out.set(key, s);
  };

  // ---- queries: recent searches first, then other cached queries ----
  src.history.forEach((h, i) => {
    const m = matchQuery(input, h.q);
    if (m.kind && normalize(h.q) !== q) add({ id: `r:${h.q}`, kind: 'recent', text: h.q, score: m.score + KIND_WEIGHT.recent - i * 0.005 });
  });
  for (const cq of src.cachedQueries) {
    const m = matchQuery(input, cq);
    if (m.kind && normalize(cq) !== q) add({ id: `q:${cq}`, kind: 'query', text: cq, score: m.score + KIND_WEIGHT.query });
  }

  // ---- songs / videos / artists / channels from real track metadata ----
  const seenTrack = new Set<string>();
  for (const t of [...src.tracks, ...src.trending]) {
    if (seenTrack.has(t.id) || t.unavailable) continue;
    seenTrack.add(t.id);
    const d = describeTrack(t);
    const mt = matchQuery(input, t.title);
    if (mt.kind) {
      const pop = t.views && Number.isFinite(t.views) ? Math.min(0.08, Math.log10(t.views + 1) / 100) : 0;
      add({ id: `${d.kind}:${t.id}`, kind: d.kind, text: t.title, sub: t.channel, track: t, score: mt.score + KIND_WEIGHT[d.kind] + pop });
    }
    if (d.artist) {
      const ma = matchQuery(input, d.artist);
      if (ma.kind) add({ id: `artist:${normalize(d.artist)}`, kind: 'artist', text: d.artist, score: ma.score + KIND_WEIGHT.artist });
    }
    if (!TOPIC.test(t.channel) && t.channel && t.provider !== 'local') {
      const mc = matchQuery(input, t.channel);
      if (mc.kind) add({ id: `channel:${normalize(t.channel)}`, kind: 'channel', text: t.channel, score: mc.score + KIND_WEIGHT.channel });
    }
  }

  let list = [...out.values()].sort((a, b) => b.score - a.score);
  // an artist and a channel with the same name are the same thing to the user
  const names = new Set(list.filter((s) => s.kind === 'artist').map((s) => normalize(s.text)));
  list = list.filter((s) => !(s.kind === 'channel' && names.has(normalize(s.text))));
  if (opts.compact) {
    // car view: recent + strong matches only, no fuzzy noise
    list = list.filter((s) => s.kind === 'recent' || s.score >= 0.8);
  }
  // keep variety: at most 3 of a kind among the top results
  const perKind = new Map<SuggestionKind, number>();
  const picked: Suggestion[] = [];
  for (const s of list) {
    const n = perKind.get(s.kind) ?? 0;
    if (n >= (s.kind === 'recent' ? 4 : 3)) continue;
    perKind.set(s.kind, n + 1);
    picked.push(s);
    if (picked.length >= limit) break;
  }
  return picked;
}
