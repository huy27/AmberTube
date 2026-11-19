import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type SidePanel = 'queue' | 'lyrics' | null;

interface UIApi {
  panel: SidePanel;
  setPanel(p: SidePanel): void;
  togglePanel(p: Exclude<SidePanel, null>): void;
  isFullscreen: boolean;
  toggleFullscreen(): void;
  /** Car View "Now Playing" screen */
  nowPlaying: boolean;
  setNowPlaying(on: boolean): void;
  /** desktop: show the YouTube video above the player bar (remembered on this device) */
  videoOpen: boolean;
  toggleVideo(on?: boolean): void;
}

const VIDEO_KEY = 'ambertube:video';
function readVideo(): { open: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(VIDEO_KEY) || '{}');
    return { open: v.open === true };
  } catch {
    return { open: false };
  }
}

const UICtx = createContext<UIApi | null>(null);

/** Pure view state (side panels, fullscreen) — kept apart from playback logic. */
export function UIProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<SidePanel>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(false);
  const [video, setVideo] = useState(readVideo);
  useEffect(() => {
    try {
      localStorage.setItem(VIDEO_KEY, JSON.stringify(video));
    } catch {
      /* ignore */
    }
  }, [video]);
  const toggleVideo = useCallback((on?: boolean) => setVideo((v) => ({ ...v, open: on ?? !v.open })), []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const togglePanel = useCallback((p: Exclude<SidePanel, null>) => setPanel((cur) => (cur === p ? null : p)), []);

  const value = useMemo(() => ({
    panel, setPanel, togglePanel, isFullscreen, toggleFullscreen, nowPlaying, setNowPlaying,
    videoOpen: video.open, toggleVideo,
  }), [panel, togglePanel, isFullscreen, toggleFullscreen, nowPlaying, video, toggleVideo]);
  return <UICtx.Provider value={value}>{children}</UICtx.Provider>;
}

export function useUI(): UIApi {
  const ctx = useContext(UICtx);
  if (!ctx) throw new Error('useUI must be used inside UIProvider');
  return ctx;
}
