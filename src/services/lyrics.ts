// Lyrics come only from sources we're allowed to display:
//   1. lyrics the user imported for a track (.lrc / .txt files they own), stored locally
//   2. original lyrics bundled with the demo catalogue
//   3. a licensed lyrics provider you configure (VITE_LYRICS_ENDPOINT, e.g. your Musixmatch/LyricFind backend)
import type { Lyrics, Track } from '../types';
import { demoLyricsFor } from '../data/demoLyrics';
import { isSynced, parseLrc } from './lrc';

const ENDPOINT = (import.meta.env.VITE_LYRICS_ENDPOINT || '').replace(/\/$/, '');
const userKey = (id: string) => `ambertube:lyrics:${id}`;
export const USER_SOURCE = 'Bạn đã nhập';

export const hasLyricsProvider = Boolean(ENDPOINT);

function build(text: string, source: string): Lyrics | null {
  const lines = parseLrc(text);
  if (!lines.length) return null;
  return { synced: isSynced(lines), lines, source };
}

export function saveUserLyrics(trackId: string, text: string): Lyrics | null {
  const lyrics = build(text, USER_SOURCE);
  if (lyrics) localStorage.setItem(userKey(trackId), text);
  return lyrics;
}

export function removeUserLyrics(trackId: string): void {
  localStorage.removeItem(userKey(trackId));
}

export const hasUserLyrics = (trackId: string): boolean => localStorage.getItem(userKey(trackId)) !== null;

export async function getLyrics(track: Track, signal?: AbortSignal): Promise<Lyrics | null> {
  const own = localStorage.getItem(userKey(track.id));
  if (own) return build(own, USER_SOURCE);

  if (track.provider === 'demo') {
    const demo = demoLyricsFor(track.id, track.tags);
    if (!demo) return null;
    if (demo.instrumental) return { synced: false, instrumental: true, lines: [], source: 'AmberTube demo' };
    return build(demo.lrc ?? demo.plain ?? '', 'AmberTube demo (lời gốc)');
  }

  if (ENDPOINT && track.provider === 'youtube') {
    const params = new URLSearchParams({ title: track.title, artist: track.channel, duration: String(Math.round(track.duration)) });
    const res = await fetch(`${ENDPOINT}?${params}`, { signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Lỗi dịch vụ lời bài hát (${res.status})`);
    const data = (await res.json()) as { lrc?: string; plain?: string; instrumental?: boolean; source?: string };
    if (data.instrumental) return { synced: false, instrumental: true, lines: [], source: data.source || 'Dịch vụ lời bài hát' };
    return build(data.lrc || data.plain || '', data.source || 'Dịch vụ lời bài hát');
  }
  return null;
}
