import type { LyricLine } from '../types';

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG = /^\[(ar|ti|al|by|length|re|ve|au|#):.*\]$/i;
const OFFSET_TAG = /^\[offset:\s*([+-]?\d+)\s*\]$/i;

/** Parses LRC text into time-sorted lines. Text without any time tags becomes unsynced lines (time = null). */
export function parseLrc(text: string): LyricLine[] {
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  let offset = 0;
  const timed: LyricLine[] = [];
  const plain: LyricLine[] = [];

  for (const raw of rows) {
    const row = raw.trim();
    const off = row.match(OFFSET_TAG);
    if (off) {
      offset = Number(off[1]) / 1000;
      continue;
    }
    if (META_TAG.test(row)) continue;

    const stamps: number[] = [];
    TIME_TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    let lastEnd = 0;
    while ((m = TIME_TAG.exec(row)) && m.index === lastEnd) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) / 1000 : 0;
      stamps.push(Number(m[1]) * 60 + Number(m[2]) + frac);
      lastEnd = TIME_TAG.lastIndex;
    }
    const lyric = row.slice(lastEnd).trim();
    if (stamps.length) for (const s of stamps) timed.push({ time: Math.max(0, s - offset), text: lyric });
    else plain.push({ time: null, text: lyric });
  }

  if (!timed.length) return trimBlank(plain);
  return timed.sort((a, b) => (a.time as number) - (b.time as number));
}

function trimBlank(lines: LyricLine[]): LyricLine[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].text) start++;
  while (end > start && !lines[end - 1].text) end--;
  return lines.slice(start, end);
}

export const isSynced = (lines: LyricLine[]): boolean => lines.length > 0 && lines.every((l) => l.time !== null);

/** Index of the line that should be highlighted at time t (seconds), or -1 before the first line. */
export function activeLineIndex(lines: LyricLine[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const time = lines[mid].time;
    if (time !== null && time <= t + 0.05) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
