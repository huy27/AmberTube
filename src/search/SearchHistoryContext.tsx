import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SEARCH_HISTORY_KEY, addToHistory, loadHistory, removeFromHistory, saveHistory, type HistoryItem } from './history';
import { scopedKey, useScope } from '../sync/scope';

interface SearchHistoryApi {
  history: HistoryItem[];
  addSearch(q: string): void;
  removeSearch(q: string): void;
  clearSearches(): void;
  /** Replace the list with the account's (sync engine only). */
  replaceSearches(list: HistoryItem[] | ((cur: HistoryItem[]) => HistoryItem[])): void;
}

const Ctx = createContext<SearchHistoryApi | null>(null);

export function SearchHistoryProvider({ children }: { children: ReactNode }) {
  const scope = useScope();
  const scopeRef = useRef(scope);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory(localStorage, scopedKey(SEARCH_HISTORY_KEY, scope)));
  // signed in / out: that scope's searches
  useEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    setHistory(loadHistory(localStorage, scopedKey(SEARCH_HISTORY_KEY, scope)));
  }, [scope]);
  const update = useCallback((fn: (h: HistoryItem[]) => HistoryItem[]) => {
    setHistory((h) => {
      const next = fn(h);
      saveHistory(localStorage, next, scopedKey(SEARCH_HISTORY_KEY, scopeRef.current));
      return next;
    });
  }, []);
  const value = useMemo<SearchHistoryApi>(() => ({
    history,
    addSearch: (q) => update((h) => addToHistory(h, q, Date.now())),
    removeSearch: (q) => update((h) => removeFromHistory(h, q)),
    clearSearches: () => update(() => []),
    replaceSearches: (list) => update(typeof list === 'function' ? list : () => list),
  }), [history, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSearchHistory(): SearchHistoryApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSearchHistory must be used inside SearchHistoryProvider');
  return ctx;
}
