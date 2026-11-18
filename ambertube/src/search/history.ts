// Recent search queries, stored locally.
import { normalize } from './normalize.ts';

export interface HistoryItem {
  q: string;
  at: number;
}

export const SEARCH_HISTORY_KEY = 'ambertube:search-history';
export const SEARCH_HISTORY_LIMIT = 25;

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function loadHistory(storage: Storage): HistoryItem[] {
  try {
    const raw = JSON.parse(storage.getItem(SEARCH_HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((h) => h && typeof h.q === 'string' && h.q.trim()).slice(0, SEARCH_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Newest first; re-searching moves the query to the top instead of duplicating it. */
export function addToHistory(list: HistoryItem[], q: string, at: number): HistoryItem[] {
  const text = q.trim().replace(/\s+/g, ' ');
  if (!text) return list;
  const key = normalize(text);
  return [{ q: text, at }, ...list.filter((h) => normalize(h.q) !== key)].slice(0, SEARCH_HISTORY_LIMIT);
}

export function removeFromHistory(list: HistoryItem[], q: string): HistoryItem[] {
  const key = normalize(q);
  return list.filter((h) => normalize(h.q) !== key);
}

export function saveHistory(storage: Storage, list: HistoryItem[]): void {
  try {
    if (list.length) storage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list));
    else storage.removeItem(SEARCH_HISTORY_KEY);
  } catch {
    /* storage unavailable */
  }
}
