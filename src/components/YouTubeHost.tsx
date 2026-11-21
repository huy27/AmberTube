import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Minimize, X } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { useUI } from '../context/UIContext';
import { useVideoAvailable } from '../hooks/useVideoAvailable';
import ProgressBar, { useProgress } from './ProgressBar';
import { TransportControls } from './PlayerBar';
import VideoExtras from './VideoExtras';
import { formatTime } from '../services/format';

function FullTime() {
  const { time, dur } = useProgress();
  return <span className="video-full__time">{formatTime(time)} / {formatTime(dur)}</span>;
}

/**
 * Host for the YouTube IFrame player. Always mounted (playback continues across pages). Hidden off-screen
 * by default; on desktop the user can show it as a small window above the player bar, or full screen.
 * Showing, hiding and going full screen only change CSS on these same elements (the "stage" is the one
 * that goes full screen) — the iframe is never moved, so the music never stops or restarts.
 */
export default function YouTubeHost() {
  const p = usePlayer();
  const ui = useUI();
  const available = useVideoAvailable();
  const visible = available && ui.videoOpen;
  const stage = useRef<HTMLDivElement>(null);
  const [nativeFs, setNativeFs] = useState(false);
  const [fillWindow, setFillWindow] = useState(false); // fallback when the Fullscreen API is unavailable
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const full = visible && (nativeFs || fillWindow);

  useEffect(() => {
    const on = () => setNativeFs(Boolean(stage.current) && document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const exitFull = useCallback(() => {
    if (document.fullscreenElement === stage.current) void document.exitFullscreen().catch(() => undefined);
    setFillWindow(false);
  }, []);
  const enterFull = useCallback(async () => {
    const el = stage.current;
    try {
      if (el?.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' });
        return;
      }
    } catch {
      /* refused (e.g. inside a frame without permission): fill the window instead */
    }
    setFillWindow(true);
  }, []);

  // the video can't be shown any more (Car View, a demo/local song, Focus mode, closed) → leave full screen
  useEffect(() => {
    if (!visible && (nativeFs || fillWindow)) exitFull();
  }, [visible, nativeFs, fillWindow, exitFull]);

  // full screen: controls fade out after 2.5 s without mouse movement while playing
  const wake = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2500);
  }, []);
  useEffect(() => {
    if (!full) return;
    wake();
    const onKey = (e: KeyboardEvent) => {
      wake();
      if (e.key === 'Escape') exitFull(); // browsers usually do this themselves; covers the fill-window fallback
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [full, wake, exitFull]);

  const hostCls = ['yt-host', visible && 'yt-host--visible', visible && ui.panel && !full && 'yt-host--shift', full && 'yt-host--full'].filter(Boolean).join(' ');
  const hideControls = full && idle && p.isPlaying;
  return (
    <div ref={stage} className={`video-stage${full ? ' video-stage--full' : ''}${fillWindow && full ? ' video-stage--fill' : ''}${hideControls ? ' is-idle' : ''}`}
      onMouseMove={full ? wake : undefined}>
      {visible && !full && (
        <div className={`video-dock${ui.panel ? ' video-dock--shift' : ''}`} role="region" aria-label="Video đang phát">
          <div className="video-dock__bar">
            <span className="video-dock__title" title={p.track?.title}>{p.track?.title}</span>
            <VideoExtras />
            <button className="icon-btn icon-btn--sm" onClick={() => void enterFull()} aria-label="Toàn màn hình" title="Toàn màn hình (bấm đúp vào video)"><Maximize size={15} /></button>
            <button className="icon-btn icon-btn--sm" onClick={() => ui.toggleVideo(false)} aria-label="Ẩn video" title="Ẩn video (V)"><X size={16} /></button>
          </div>
          {/* clicks on the picture go to AmberTube's own player (the iframe has no controls) */}
          <button className="video-dock__screen" onClick={p.togglePlay} onDoubleClick={() => void enterFull()}
            aria-label={p.isPlaying ? 'Tạm dừng' : 'Phát'} title="Bấm: phát / tạm dừng · Bấm đúp: toàn màn hình" />
        </div>
      )}
      <div className={hostCls} ref={p.ytHostRef} aria-hidden={!visible} />
      {full && (
        <>
          <button className="video-full__screen" onClick={p.togglePlay} onDoubleClick={exitFull} aria-label={p.isPlaying ? 'Tạm dừng' : 'Phát'} tabIndex={-1} />
          <div className="video-full__top">
            <div className="video-full__id">
              <strong title={p.track?.title}>{p.track?.title}</strong>
              <span>{p.track?.channel}</span>
            </div>
          </div>
          <div className="video-full__bottom" role="group" aria-label="Điều khiển video">
            <div className="video-full__progress"><ProgressBar variant="inline" /><FullTime /></div>
            <div className="video-full__row">
              <TransportControls size="large" />
              <div className="video-full__extras"><VideoExtras /></div>
              <button className="icon-btn video-full__exit" onClick={exitFull} aria-label="Thoát toàn màn hình" title="Thoát toàn màn hình (Esc)"><Minimize size={22} /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
