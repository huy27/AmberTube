import { useEffect, useRef } from 'react';
import { AmbientMixer } from './ambient';
import type { AmbientPrefs } from './settings';

/** Owns the ambient mixer for as long as Focus mode is open; fades out and releases audio on exit. */
export function useAmbientEngine(prefs: AmbientPrefs): void {
  const mixer = useRef<AmbientMixer | null>(null);
  useEffect(() => {
    const m = new AmbientMixer();
    mixer.current = m;
    return () => {
      m.dispose();
      mixer.current = null;
    };
  }, []);
  useEffect(() => {
    mixer.current?.apply(prefs);
  }, [prefs]);
}
