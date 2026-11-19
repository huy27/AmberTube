import { useCallback, useEffect, useRef, useState } from 'react';
import { hasLastfmApi, LastfmError } from '../services/lastfm';

export type PagedStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface PageResult<T> { items: T[]; totalPages: number }

/**
 * Shared Last.fm list paging (artists, charts): `pageSize` per page, "load more", one request at a time,
 * stale responses never overwrite newer ones, and a failed "load more" keeps what is already shown.
 * `fetchPage` must be stable (module function or useCallback) — changing it restarts from page 1.
 */
export function usePaged<T>(
  fetchPage: (page: number, limit: number) => Promise<PageResult<T>>,
  merge: (cur: T[], next: T[]) => T[],
  pageSize: number,
  fallbackError: string,
) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<PagedStatus>(hasLastfmApi ? 'loading' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const seq = useRef(0);
  const busy = useRef(false);
  const mergeRef = useRef(merge);
  mergeRef.current = merge;

  const load = useCallback(async (p: number) => {
    if (!hasLastfmApi || busy.current) return;
    busy.current = true;
    const my = ++seq.current;
    if (p === 1) setStatus('loading');
    else setLoadingMore(true);
    setError(null);
    try {
      const r = await fetchPage(p, pageSize);
      if (my !== seq.current) return; // a newer request owns the state
      setItems((cur) => (p === 1 ? r.items : mergeRef.current(cur, r.items)));
      setPage(p);
      setTotalPages(r.totalPages);
      setStatus('ready');
    } catch (e) {
      if (my !== seq.current) return;
      setError(e instanceof LastfmError ? e.message : fallbackError);
      if (p === 1) setStatus('error');
    } finally {
      if (my === seq.current) {
        busy.current = false;
        setLoadingMore(false);
      }
    }
  }, [fetchPage, pageSize, fallbackError]);

  useEffect(() => {
    void load(1);
    return () => {
      seq.current++; // unmounted / restarted: ignore whatever is still in flight
      busy.current = false;
    };
  }, [load]);

  const hasMore = page > 0 && page < totalPages;
  return {
    items, status, error, loadingMore, hasMore, enabled: hasLastfmApi,
    loadMore: useCallback(() => { if (hasMore) void load(page + 1); }, [hasMore, load, page]),
    retry: useCallback(() => void load(page > 0 ? page + 1 : 1), [load, page]),
  };
}

/**
 * Calls `cb` when the user scrolls `el` to within 300px of the viewport (infinite scroll; the button remains
 * for keyboards). The observer's first report is ignored: a short list that already shows the sentinel
 * must not chain-load every page by itself.
 */
export function useNearBottom(cb: () => void, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let first = true;
    const io = new IntersectionObserver((entries) => {
      if (first) { first = false; return; }
      if (entries[0]?.isIntersecting) cbRef.current();
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
