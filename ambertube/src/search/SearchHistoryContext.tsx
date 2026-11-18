import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { addToHistory, loadHistory, removeFromHistory, saveHistory, type HistoryItem } from './history';

interface SearchHistoryApi {
  history: HistoryItem[];
  addSearch(q: string): void;
  removeSearch(q: string): void;
  clearSearches(): void;
}

const Ctx = createContext<SearchHistoryApi | null>(null);

export function SearchHistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory(localStorage));
  const update = useCallback((fn: (h: HistoryItem[]) => HistoryItem[]) => {
    setHistory((h) => {
      const next = fn(h);
      saveHistory(localStorage, next);
      return next;
    });
  }, []);
  const value = useMemo<SearchHistoryApi>(() => ({
    history,
    addSearch: (q) => update((h) => addToHistory(h, q, Date.now())),
    removeSearch: (q) => update((h) => removeFromHistory(h, q)),
    clearSearches: () => update(() => []),
  }), [history, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSearchHistory(): SearchHistoryApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSearchHistory must be used inside SearchHistoryProvider');
  return ctx;
}
