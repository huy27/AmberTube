import { useEffect, useState } from 'react';
import type { Lyrics, Track } from '../types';
import { getLyrics } from '../services/lyrics';

export type LyricsState = { status: 'idle' | 'loading' } | { status: 'ready'; lyrics: Lyrics } | { status: 'none' } | { status: 'error'; message: string };

/** Loads lyrics for the given track; `version` lets callers force a reload (e.g. after an import). */
export function useLyrics(track: Track | null, enabled: boolean, version = 0): LyricsState {
  const [state, setState] = useState<LyricsState>({ status: 'idle' });

  useEffect(() => {
    if (!track || !enabled) {
      setState({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    getLyrics(track, ctrl.signal)
      .then((lyrics) => !ctrl.signal.aborted && setState(lyrics ? { status: 'ready', lyrics } : { status: 'none' }))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setState({ status: 'error', message: err.message });
      });
    return () => ctrl.abort();
  }, [track?.id, enabled, version]);

  return state;
}
