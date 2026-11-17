// Text normalisation shared by autocomplete and recommendations.
// Vietnamese-aware: "nhạc" matches "nhac", "Đen Vâu" matches "den vau".

const MARKS = /[̀-ͯ]/g;

export function foldChar(c: string): string {
  if (c === 'đ' || c === 'Đ') return 'd';
  return c.normalize('NFD').replace(MARKS, '').toLowerCase();
}

/** lower-case, no diacritics, punctuation → space, collapsed whitespace */
export function normalize(s: string): string {
  let out = '';
  for (const c of s) out += foldChar(c);
  return out.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'ft', 'feat', 'official', 'video', 'audio', 'lyric', 'lyrics', 'mv', 'hd', '4k', 'music', 'nhac', 'bai', 'hat', 'cua', 'va', 'la', 'voi', 'mix', 'version', 'remix', 'live', 'full']);

export function tokens(s: string, dropStop = false): string[] {
  const t = normalize(s).split(' ').filter(Boolean);
  return dropStop ? t.filter((w) => w.length > 1 && !STOP.has(w)) : t;
}

/** Optimal-string-alignment distance (transpositions count as 1), with an early exit above `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

export type MatchKind = 'prefix' | 'word-prefix' | 'contains' | 'fuzzy' | null;

/**
 * How well `query` matches `text`. Every query token must match some text token
 * (prefix, substring, or within a small edit distance for longer words).
 */
export function matchQuery(query: string, text: string): { kind: MatchKind; score: number } {
  const q = normalize(query);
  const t = normalize(text);
  if (!q || !t) return { kind: null, score: 0 };
  if (t.startsWith(q)) return { kind: 'prefix', score: 1 - Math.min(0.3, (t.length - q.length) / 200) };
  const qt = q.split(' ');
  const tt = t.split(' ');
  let fuzzy = false;
  let wordPrefix = true;
  for (const w of qt) {
    if (tt.some((x) => x.startsWith(w))) continue;
    wordPrefix = false;
    if (t.includes(w)) continue;
    const tol = w.length >= 7 ? 2 : w.length >= 4 ? 1 : 0;
    if (tol && tt.some((x) => editDistance(w, x.slice(0, w.length + tol), tol) <= tol || editDistance(w, x, tol) <= tol)) {
      fuzzy = true;
      continue;
    }
    return { kind: null, score: 0 };
  }
  if (wordPrefix && !fuzzy) return { kind: 'word-prefix', score: 0.8 };
  if (!fuzzy) return { kind: 'contains', score: 0.6 };
  return { kind: 'fuzzy', score: 0.4 };
}

/**
 * Ranges in the ORIGINAL text that match the query tokens (diacritic/case-insensitive),
 * used to bold the matching part of a suggestion.
 */
export function highlightRanges(text: string, query: string): [number, number][] {
  const qt = normalize(query).split(' ').filter(Boolean);
  if (!qt.length) return [];
  // build a folded copy of the text with an index map back to the original
  let folded = '';
  const map: number[] = [];
  let i = 0;
  for (const c of text) {
    const f = foldChar(c);
    for (let k = 0; k < f.length; k++) {
      folded += f[k];
      map.push(i);
    }
    i += c.length;
  }
  const ranges: [number, number][] = [];
  for (const w of qt.sort((a, b) => b.length - a.length)) {
    // prefer matches at word starts
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gu');
    let m: RegExpExecArray | null;
    let found = false;
    while ((m = re.exec(folded))) {
      const s = m.index + m[1].length;
      ranges.push([map[s], map[s + w.length - 1] + 1]);
      found = true;
    }
    if (!found) {
      const s = folded.indexOf(w);
      if (s >= 0) ranges.push([map[s], map[s + w.length - 1] + 1]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
