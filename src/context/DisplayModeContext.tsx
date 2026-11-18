import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type DisplayMode = 'desktop' | 'car';

const KEY = 'ambertube:display-mode';
const DISMISS_KEY = 'ambertube:car-suggest-dismissed';
/** compact landscape screens such as in-car browsers (a hint only — never switches automatically) */
const COMPACT_LANDSCAPE = '(orientation: landscape) and (max-height: 640px) and (min-width: 700px) and (max-width: 1300px)';

/** phones (portrait) and short landscape screens (phones sideways, 7" displays) use the compact layout */
const NARROW = '(max-width: 700px), (max-height: 500px)';

interface DisplayModeApi {
  mode: DisplayMode;
  /** compact layout: Car View, or any narrow (phone) viewport in desktop mode */
  compact: boolean;
  setMode(m: DisplayMode): void;
  /** true when the screen looks like a compact landscape display and the user hasn't chosen yet */
  suggestCar: boolean;
  dismissSuggestion(): void;
}

const Ctx = createContext<DisplayModeApi | null>(null);

function readMode(): DisplayMode | null {
  const v = localStorage.getItem(KEY);
  return v === 'car' || v === 'desktop' ? v : null;
}

export function DisplayModeProvider({ children }: { children: ReactNode }) {
  const [chosen, setChosen] = useState<DisplayMode | null>(readMode);
  const [compactScreen, setCompactScreen] = useState(() => window.matchMedia?.(COMPACT_LANDSCAPE).matches ?? false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(NARROW).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const mode: DisplayMode = chosen ?? 'desktop';

  useEffect(() => {
    const mq = window.matchMedia?.(COMPACT_LANDSCAPE);
    if (!mq) return;
    const on = () => setCompactScreen(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // one class on <html> switches the layout — no reload, no URL change
  useEffect(() => {
    document.documentElement.classList.toggle('mode-car', mode === 'car');
    document.documentElement.dataset.displayMode = mode;
    document.documentElement.classList.toggle('layout-compact', mode === 'car' || narrow);
  }, [mode, narrow]);

  const setMode = useCallback((m: DisplayMode) => {
    setChosen(m);
    localStorage.setItem(KEY, m);
  }, []);

  const dismissSuggestion = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, '1');
  }, []);

  const value = useMemo(
    () => ({ mode, compact: mode === 'car' || narrow, setMode, suggestCar: compactScreen && chosen === null && !dismissed, dismissSuggestion }),
    [mode, narrow, setMode, compactScreen, chosen, dismissed, dismissSuggestion],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDisplayMode(): DisplayModeApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDisplayMode must be used inside DisplayModeProvider');
  return ctx;
}
