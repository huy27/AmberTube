import { useEffect, useRef, useState } from 'react';
import type { Track } from '../types';
import { suggest, type Suggestion } from './suggest';
import { useSearchHistory } from './SearchHistoryContext';
import { useLibrary } from '../context/LibraryContext';
import { getCachedQueries, getCachedTracks, getTrending, hasYouTubeApi } from '../services/youtube';
import { DEMO_TRACKS } from '../data/demoCatalog';

export type SuggestStatus = 'idle' | 'loading' | 'ready' | 'error';

const DEBOUNCE_MS = 300;
let trendingCache: { items: Track[]; source: 'youtube' | 'demo' } | null = null;
let trendingPromise: Promise<{ items: Track[]; source: 'youtube' | 'demo' }> | null = null;

function loadTrending() {
  if (trendingCache) return Promise.resolve(trendingCache);
  trendingPromise ??= getTrending()
    .then((r) => (trendingCache = r))
    .finally(() => (trendingPromise = null));
  return trendingPromise;
}

/**
 * Debounced autocomplete. Only the latest input's result is applied (stale ones are ignored);
 * local sources mean no API request per keystroke.
 */
export function useSuggestions(input: string, open: boolean, compact: boolean) {
  const { history } = useSearchHistory();
  const { saved, history: listens, playlists } = useLibrary();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState<SuggestStatus>('idle');
  const [trendingSource, setTrendingSource] = useState<'youtube' | 'demo' | null>(trendingCache?.source ?? null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++seq.current;
    const empty = !input.trim();
    const run = async () => {
      let trending: Track[] = trendingCache?.items ?? [];
      let failed = false;
      if (!trendingCache) {
        setStatus('loading');
        try {
          const r = await loadTrending();
          trending = r.items;
          if (id === seq.current) setTrendingSource(r.source);
        } catch {
          failed = true;
        }
      }
      if (id !== seq.current) return; // outdated
      const known: Track[] = [
        ...getCachedTracks(),
        ...saved,
        ...listens.map((h) => h.track),
        ...playlists.flatMap((p) => p.tracks),
        ...(hasYouTubeApi ? [] : DEMO_TRACKS),
      ];
      setItems(suggest(input, { history, cachedQueries: getCachedQueries(), tracks: known, trending }, { limit: compact ? 5 : 8, compact }));
      setStatus(failed ? 'error' : 'ready');
    };
    if (empty) {
      void run();
      return;
    }
    setStatus('loading');
    const t = setTimeout(() => void run(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input, open, compact, history, saved, listens, playlists]); // eslint-disable-line react-hooks/exhaustive-deps

  return { items, status, trendingSource };
}
