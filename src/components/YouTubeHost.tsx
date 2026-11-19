import { useLocation } from 'react-router-dom';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { useUI } from '../context/UIContext';
import { useDisplayMode } from '../context/DisplayModeContext';

/** The video can be shown on the desktop layout only (never in Car View: no video while driving). */
export function useVideoAvailable() {
  const { track } = usePlayer();
  const { compact } = useDisplayMode();
  const { pathname } = useLocation();
  return !compact && pathname !== '/focus' && track?.provider === 'youtube';
}

/**
 * Host for the YouTube IFrame player. Always mounted (playback continues across pages). Hidden off-screen
 * by default; on desktop the user can show it as a small video window above the player bar. Showing or
 * hiding only changes CSS on this same element — the iframe is never moved, so the music never stops.
 */
export default function YouTubeHost() {
  const p = usePlayer();
  const ui = useUI();
  const available = useVideoAvailable();
  const visible = available && ui.videoOpen;
  const cls = ['yt-host', visible && 'yt-host--visible', visible && ui.videoLarge && 'yt-host--large', visible && ui.panel && 'yt-host--shift'].filter(Boolean).join(' ');
  return (
    <>
      {visible && (
        <div className={`video-dock${ui.videoLarge ? ' video-dock--large' : ''}${ui.panel ? ' video-dock--shift' : ''}`} role="region" aria-label="Video đang phát">
          <div className="video-dock__bar">
            <span className="video-dock__title" title={p.track?.title}>{p.track?.title}</span>
            <button className="icon-btn icon-btn--sm" onClick={ui.toggleVideoLarge} aria-label={ui.videoLarge ? 'Thu nhỏ video' : 'Phóng to video'} title={ui.videoLarge ? 'Thu nhỏ' : 'Phóng to'}>
              {ui.videoLarge ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button className="icon-btn icon-btn--sm" onClick={() => ui.toggleVideo(false)} aria-label="Ẩn video" title="Ẩn video (V)"><X size={16} /></button>
          </div>
          {/* clicks on the picture play/pause through AmberTube's own player (the iframe has no controls) */}
          <button className="video-dock__screen" onClick={p.togglePlay} onDoubleClick={ui.toggleVideoLarge}
            aria-label={p.isPlaying ? 'Tạm dừng' : 'Phát'} title="Bấm: phát / tạm dừng · Bấm đúp: phóng to" />
        </div>
      )}
      <div className={cls} ref={p.ytHostRef} aria-hidden={!visible} />
    </>
  );
}
