// Mapping between AmberTube's local data and the synced database rows (pure; unit-tested).
//
// Every synced item becomes a record with a stable id ("<table>|<key>") and canonical content.
// Content uses plain numbers for times (ms), so a hash of it is identical whether it was built from
// local state or from a row the server sent back.
import type { HistoryEntry, Playlist, Track } from '../types.ts';
import type { ListenEvent } from '../recommend/listening.ts';
import type { HistoryItem } from '../search/history.ts';
import { normalize } from '../search/normalize.ts';
import { snapshot, stableJson } from './snapshot.ts';

export { snapshot, stableJson };

export type Table = 'favorites' | 'listening_history' | 'search_history' | 'playlists' | 'playlist_tracks' | 'user_settings';
/** Push order: a playlist must exist before its tracks. */
export const TABLES: Table[] = ['playlists', 'playlist_tracks', 'favorites', 'listening_history', 'search_history', 'user_settings'];

export interface LocalData {
  saved: Track[];
  history: HistoryEntry[];
  listens: ListenEvent[];
  searches: HistoryItem[];
  playlists: Playlist[];
  /** synced settings, flattened: "lib.autoplay", "reco.prefs", "reco.feedback", "focus.settings"… */
  settings: Record<string, unknown>;
}

export const LIMITS = { history: 200, searches: 25, listens: 1500, listenDays: 120 };

export type Content = Record<string, unknown>;
export interface Rec { table: Table; key: string; content: Content; /** sort time for capped lists */ sort?: number }
export const recId = (table: Table, key: string) => `${table}|${key}`;
export const splitId = (id: string): [Table, string] => {
  const i = id.indexOf('|');
  return [id.slice(0, i) as Table, id.slice(i + 1)];
};

// ---------- tracks ----------
export type ProviderRef = { provider: 'youtube' | 'demo'; track_id: string };

/** Where a song lives at its provider. Local files (object URLs) never leave the device → null. */
export function trackRef(t: Track): ProviderRef | null {
  if (t.provider === 'youtube') {
    const v = t.videoId ?? (t.id.startsWith('yt:') ? t.id.slice(3) : null);
    return v && /^[\w-]{6,20}$/.test(v) ? { provider: 'youtube', track_id: v } : null;
  }
  if (t.provider === 'demo') return { provider: 'demo', track_id: t.id };
  return null;
}
export const refKey = (r: ProviderRef) => `${r.provider}|${r.track_id}`;

const str = (v: unknown, max = 300) => (typeof v === 'string' && v.length <= max ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** A playable Track from a stored provider id + snapshot (the player resolves YouTube by videoId). */
export function restoreTrack(provider: unknown, trackId: unknown, snap: unknown): Track | null {
  const s = (snap && typeof snap === 'object' ? snap : {}) as Record<string, unknown>;
  if (typeof trackId !== 'string') return null;
  let t: Track;
  if (provider === 'youtube') {
    if (!/^[\w-]{6,20}$/.test(trackId)) return null;
    t = { id: `yt:${trackId}`, provider: 'youtube', videoId: trackId, title: 'Video YouTube', channel: '', channelId: null, views: null, duration: 0, isLive: false, license: 'standard', thumbnail: `https://i.ytimg.com/vi/${trackId}/mqdefault.jpg` };
  } else if (provider === 'demo') {
    t = { id: trackId, provider: 'demo', title: trackId, channel: '', channelId: null, views: null, duration: 0, isLive: false, license: 'standard' };
  } else {
    return null; // a provider this version doesn't play: keep it on the server, don't show it
  }
  const title = str(s.title);
  if (title) t.title = title;
  t.channel = str(s.channel) ?? t.channel;
  t.channelId = str(s.channelId, 64) ?? null;
  t.views = num(s.views) ?? null;
  t.duration = Math.max(0, num(s.duration) ?? 0);
  t.isLive = s.isLive === true;
  if (s.license === 'owned' || s.license === 'cc-by' || s.license === 'standard') t.license = s.license;
  const th = str(s.thumbnail, 600);
  if (th && /^https:\/\//.test(th)) t.thumbnail = th;
  if (s.art && typeof s.art === 'object') t.art = s.art as Track['art'];
  if (Array.isArray(s.genres)) t.genres = s.genres.filter((g) => typeof g === 'string').slice(0, 12) as string[];
  if (str(s.lang, 8)) t.lang = s.lang as string;
  if (str(s.categoryId, 8)) t.categoryId = s.categoryId as string;
  return t;
}

/** True when the stored snapshot lacks the title (fresh metadata is worth fetching). */
export const needsMetadata = (t: Track) => t.provider === 'youtube' && t.title === 'Video YouTube' && !t.channel;

// ---------- local data → records ----------
const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function recordsOf(d: LocalData): Map<string, Rec> {
  const out = new Map<string, Rec>();
  const put = (r: Rec) => out.set(recId(r.table, r.key), r);
  d.saved.forEach((t) => {
    const ref = trackRef(t);
    if (ref) put({ table: 'favorites', key: refKey(ref), content: { ...ref, track: snapshot(t), created_at: t.addedAt ?? 0 } });
  });
  for (const h of d.history) {
    const ref = trackRef(h.track);
    if (!ref) continue;
    const id = `r-${h.entryId}`;
    put({ table: 'listening_history', key: id, sort: h.playedAt, content: { id, kind: 'recent', ...ref, track: snapshot(h.track), played_at: h.playedAt } });
  }
  for (const e of d.listens) {
    const ref = trackRef(e.track);
    if (!ref) continue;
    const id = `l-${e.id}`;
    put({
      table: 'listening_history', key: id, sort: e.at,
      content: { id, kind: 'listen', ...ref, track: snapshot(e.track), played_at: e.at, listened_sec: round(e.listenedSec), duration_sec: round(e.durationSec), completion: round(Math.min(1, Math.max(0, e.completion))), reason: e.reason },
    });
  }
  for (const s of d.searches) {
    const k = normalize(s.q).slice(0, 200);
    if (k) put({ table: 'search_history', key: k, sort: s.at, content: { query_norm: k, query: s.q.slice(0, 200), searched_at: s.at } });
  }
  for (const p of d.playlists) {
    put({ table: 'playlists', key: p.id, content: { id: p.id, name: p.name, created_at: p.createdAt } });
    p.tracks.forEach((t, i) => {
      const ref = trackRef(t);
      if (ref) put({ table: 'playlist_tracks', key: `${p.id}|${refKey(ref)}`, content: { playlist_id: p.id, ...ref, track: snapshot(t), sort_order: t.addedAt ?? i, added_at: t.addedAt ?? 0 } });
    });
  }
  for (const [k, v] of Object.entries(d.settings)) if (v !== undefined) put({ table: 'user_settings', key: k, content: { v } });
  return out;
}

export function hashOf(content: Content | null): string {
  if (!content) return 'DEL';
  const s = stableJson(content);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Was a record that disappeared locally deleted by the user, or just trimmed by a local size limit
 * (recent list, 25 searches, 120 days of listening)? Trimmed records must not delete the cloud copy.
 */
export function wasTrimmed(table: Table, key: string, sort: number | undefined, d: LocalData, now: number): boolean {
  if (sort === undefined) return false;
  const oldest = (xs: number[]) => (xs.length ? Math.min(...xs) : Infinity);
  if (table === 'listening_history' && key.startsWith('r-')) return d.history.length >= LIMITS.history && sort <= oldest(d.history.map((h) => h.playedAt));
  if (table === 'listening_history') return sort < now - LIMITS.listenDays * 86_400_000 || (d.listens.length >= LIMITS.listens && sort <= oldest(d.listens.map((e) => e.at)));
  if (table === 'search_history') return d.searches.length >= LIMITS.searches && sort <= oldest(d.searches.map((s) => s.at));
  return false;
}

// ---------- database rows ↔ content ----------
const ms = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) || 0 : 0);
const iso = (v: unknown) => new Date(typeof v === 'number' ? v : 0).toISOString();
const TIME_COLS = ['created_at', 'played_at', 'searched_at', 'added_at'];

export function keyOfRow(table: Table, r: Content): string {
  switch (table) {
    case 'favorites': return `${r.provider}|${r.track_id}`;
    case 'listening_history': return String(r.id);
    case 'search_history': return String(r.query_norm);
    case 'playlists': return String(r.id);
    case 'playlist_tracks': return `${r.playlist_id}|${r.provider}|${r.track_id}`;
    default: return '';
  }
}

const CONTENT_COLS: Record<Exclude<Table, 'user_settings'>, string[]> = {
  favorites: ['provider', 'track_id', 'track', 'created_at'],
  listening_history: ['id', 'kind', 'provider', 'track_id', 'track', 'played_at', 'listened_sec', 'duration_sec', 'completion', 'reason'],
  search_history: ['query_norm', 'query', 'searched_at'],
  playlists: ['id', 'name', 'created_at'],
  playlist_tracks: ['playlist_id', 'provider', 'track_id', 'track', 'sort_order', 'added_at'],
};

/** Canonical content of a server row (same shape as recordsOf), times as ms. */
export function contentOfRow(table: Exclude<Table, 'user_settings'>, r: Content): Content {
  const c: Content = {};
  for (const col of CONTENT_COLS[table]) {
    let v = r[col];
    if (v === null || v === undefined) {
      if (table === 'listening_history' && r.kind === 'recent') continue; // recents have no stats
      v = undefined;
    }
    if (TIME_COLS.includes(col)) v = ms(v);
    if (v !== undefined) c[col] = v;
  }
  return c;
}

/** Content → row to upsert (times as ISO). */
export function rowOfContent(table: Exclude<Table, 'user_settings'>, c: Content): Content {
  const r: Content = {};
  for (const col of CONTENT_COLS[table]) if (c[col] !== undefined) r[col] = TIME_COLS.includes(col) ? iso(c[col]) : c[col];
  return r;
}

/** Key columns for a tombstone update: [equality columns, column for the IN list, its value]. */
export function keyColumns(table: Exclude<Table, 'user_settings'>, key: string): { eq: Record<string, string>; col: string; value: string } {
  const parts = key.split('|');
  switch (table) {
    case 'favorites': return { eq: { provider: parts[0] }, col: 'track_id', value: parts.slice(1).join('|') };
    case 'playlist_tracks': return { eq: { playlist_id: parts[0], provider: parts[1] }, col: 'track_id', value: parts.slice(2).join('|') };
    case 'listening_history': return { eq: {}, col: 'id', value: key };
    case 'search_history': return { eq: {}, col: 'query_norm', value: key };
    case 'playlists': return { eq: {}, col: 'id', value: key };
  }
}

// ---------- apply changes to local data ----------
export interface Change { table: Table; key: string; content: Content | null }

/** Local data with `changes` applied (null content = deleted). Pure. */
export function applyChanges(d: LocalData, changes: Change[], now: number): LocalData {
  if (!changes.length) return d;
  const saved = new Map<string, Track>(d.saved.map((t) => { const r = trackRef(t); return [r ? refKey(r) : `x:${t.id}`, t]; }));
  const history = new Map<string, HistoryEntry>(d.history.map((h) => [`r-${h.entryId}`, h]));
  const listens = new Map<string, ListenEvent>(d.listens.map((e) => [`l-${e.id}`, e]));
  const searches = new Map<string, HistoryItem>(d.searches.map((s) => [normalize(s.q).slice(0, 200), s]));
  const playlists = new Map<string, Playlist>(d.playlists.map((p) => [p.id, { ...p, tracks: [...p.tracks] }]));
  const settings = { ...d.settings };
  const plTracks: Change[] = [];

  for (const ch of changes) {
    const c = ch.content;
    switch (ch.table) {
      case 'favorites': {
        if (!c) { saved.delete(ch.key); break; }
        const t = restoreTrack(c.provider, c.track_id, c.track);
        if (t) saved.set(ch.key, { ...t, addedAt: ms(c.created_at) });
        break;
      }
      case 'listening_history': {
        if (ch.key.startsWith('r-')) {
          if (!c) { history.delete(ch.key); break; }
          const t = restoreTrack(c.provider, c.track_id, c.track);
          if (t) history.set(ch.key, { entryId: ch.key.slice(2), track: t, playedAt: ms(c.played_at) });
        } else {
          if (!c) { listens.delete(ch.key); break; }
          const t = restoreTrack(c.provider, c.track_id, c.track);
          const reason = c.reason as ListenEvent['reason'];
          if (t) listens.set(ch.key, { id: ch.key.slice(2), trackId: t.id, track: t, at: ms(c.played_at), listenedSec: Number(c.listened_sec) || 0, durationSec: Number(c.duration_sec) || 0, completion: Number(c.completion) || 0, reason: reason ?? 'ended' });
        }
        break;
      }
      case 'search_history':
        if (!c) searches.delete(ch.key);
        else searches.set(ch.key, { q: String(c.query), at: ms(c.searched_at) });
        break;
      case 'playlists': {
        if (!c) { playlists.delete(ch.key); break; }
        const cur = playlists.get(ch.key);
        playlists.set(ch.key, { id: ch.key, name: String(c.name), createdAt: ms(c.created_at), tracks: cur?.tracks ?? [] });
        break;
      }
      case 'playlist_tracks':
        plTracks.push(ch); // after playlists in this batch exist
        break;
      case 'user_settings':
        if (c) settings[ch.key] = c.v;
        break;
    }
  }
  for (const ch of plTracks) {
    const [plId, ...rest] = ch.key.split('|');
    const pl = playlists.get(plId);
    if (!pl) continue; // playlist deleted (or not synced yet)
    const refK = rest.join('|');
    pl.tracks = pl.tracks.filter((t) => { const r = trackRef(t); return !r || refKey(r) !== refK; });
    if (ch.content) {
      const t = restoreTrack(ch.content.provider, ch.content.track_id, ch.content.track);
      if (t) pl.tracks.push({ ...t, addedAt: ms(ch.content.added_at), position: Number(ch.content.sort_order) } as Track);
    }
  }
  const byPos = (a: Track, b: Track) => ((a as Track & { position?: number }).position ?? a.addedAt ?? 0) - ((b as Track & { position?: number }).position ?? b.addedAt ?? 0);
  const cleanPos = (t: Track) => { const { position: _p, ...rest } = t as Track & { position?: number }; return rest as Track; };
  const plOut = [...playlists.values()].map((p) => ({ ...p, tracks: p.tracks.sort(byPos).map(cleanPos) }));
  plOut.sort((a, b) => a.createdAt - b.createdAt);

  const cutoff = now - LIMITS.listenDays * 86_400_000;
  return {
    saved: [...saved.values()].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)),
    history: [...history.values()].sort((a, b) => b.playedAt - a.playedAt).slice(0, LIMITS.history),
    listens: [...listens.values()].filter((e) => e.at >= cutoff).sort((a, b) => a.at - b.at).slice(-LIMITS.listens),
    searches: [...searches.values()].sort((a, b) => b.at - a.at).slice(0, LIMITS.searches),
    playlists: plOut,
    settings,
  };
}

// ---------- guest → account migration ----------
export interface MigrationCounts { favorites: number; playlists: number; history: number; searches: number }

const isDefaultEmpty = (p: Playlist) => p.tracks.length === 0 && (p.id === 'pl-focus' || p.id === 'pl-chill');

/** What a guest has that is worth offering to move into the account. */
export function guestCounts(g: LocalData): MigrationCounts {
  return {
    favorites: g.saved.filter((t) => trackRef(t)).length,
    playlists: g.playlists.filter((p) => !isDefaultEmpty(p)).length,
    history: g.history.length,
    searches: g.searches.length,
  };
}
export const hasGuestData = (g: LocalData) => Object.values(guestCounts(g)).some((n) => n > 0);

/**
 * Account data + guest data, nothing overwritten: songs already in the account keep the account's
 * version; a guest playlist with the same name as an account playlist is merged into it (no "Chill (2)");
 * guest settings only fill settings the account never set.
 */
export interface MergeCaps { favorites: number; playlists: number; playlistTracks: number; playlistTotal: number }
const NO_CAPS: MergeCaps = { favorites: Infinity, playlists: Infinity, playlistTracks: Infinity, playlistTotal: Infinity };

export function mergeGuestInto(user: LocalData, guest: LocalData, accountSettingKeys: Set<string>, now: number, newId: () => string, caps: MergeCaps = NO_CAPS): { data: LocalData; skipped: number } {
  const keyOf = (t: Track) => { const r = trackRef(t); return r ? refKey(r) : null; };
  let skipped = 0;
  const userFav = new Set(user.saved.map(keyOf));
  const newFav = guest.saved.filter((t) => { const k = keyOf(t); return k && !userFav.has(k); });
  const favRoom = Math.max(0, caps.favorites - user.saved.length);
  skipped += Math.max(0, newFav.length - favRoom);
  const saved = [...user.saved, ...newFav.slice(0, favRoom)];

  const hIds = new Set(user.history.map((h) => h.entryId));
  const history = [...user.history, ...guest.history.filter((h) => !hIds.has(h.entryId) && keyOf(h.track))];
  const lIds = new Set(user.listens.map((e) => e.id));
  const listens = [...user.listens, ...guest.listens.filter((e) => !lIds.has(e.id) && keyOf(e.track))];

  const searches = new Map(user.searches.map((s) => [normalize(s.q), s] as const));
  for (const s of guest.searches) {
    const k = normalize(s.q);
    const cur = searches.get(k);
    if (!cur || cur.at < s.at) searches.set(k, s);
  }

  const playlists = user.playlists.map((p) => ({ ...p, tracks: [...p.tracks] }));
  let total = playlists.reduce((n, p) => n + p.tracks.length, 0);
  const take = (target: Playlist, tracks: Track[]) => {
    for (const t of tracks) {
      if (target.tracks.length >= caps.playlistTracks || total >= caps.playlistTotal) { skipped++; continue; }
      target.tracks.push(t);
      total++;
    }
  };
  for (const gp of guest.playlists) {
    if (isDefaultEmpty(gp)) continue;
    const same = playlists.find((p) => normalize(p.name) === normalize(gp.name)); // same name = same playlist
    const tracks = gp.tracks.filter(keyOf);
    if (same) {
      const have = new Set(same.tracks.map(keyOf));
      take(same, tracks.filter((t) => !have.has(keyOf(t))));
    } else if (playlists.length >= caps.playlists) {
      skipped += 1 + tracks.length;
    } else {
      const created: Playlist = { ...gp, id: playlists.some((p) => p.id === gp.id) ? newId() : gp.id, tracks: [] };
      playlists.push(created);
      take(created, tracks);
    }
  }

  const settings = { ...user.settings };
  for (const [k, v] of Object.entries(guest.settings)) if (!accountSettingKeys.has(k) && v !== undefined) settings[k] = v;

  const cutoff = now - LIMITS.listenDays * 86_400_000;
  return {
    skipped,
    data: {
      saved: saved.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)),
      history: history.sort((a, b) => b.playedAt - a.playedAt).slice(0, LIMITS.history),
      listens: listens.filter((e) => e.at >= cutoff).sort((a, b) => a.at - b.at).slice(-LIMITS.listens),
      searches: [...searches.values()].sort((a, b) => b.at - a.at).slice(0, LIMITS.searches),
      playlists,
      settings,
    },
  };
}
