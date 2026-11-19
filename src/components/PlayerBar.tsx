import type React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  SkipBack, SkipForward, Play, Pause, Shuffle, Repeat, Repeat1, Volume2, Volume1, VolumeX, ListMusic, Heart, Loader2, MicVocal, Maximize2, Infinity as InfinityIcon, MonitorPlay, AlertTriangle,
} from 'lucide-react';
import { useRecommendations } from '../recommend/RecommendationProvider';
import Artwork from './Artwork';
import Visualizer from './Visualizer';
import ProgressBar, { useProgress } from './ProgressBar';
import SpeedMenu from './SpeedMenu';
import SleepTimerMenu from './SleepTimerMenu';
import { usePlayer } from '../context/PlayerContext';
import { useLibrary } from '../context/LibraryContext';
import { useUI } from '../context/UIContext';
import { useOpenFocus } from '../hooks/useFocusNavigation';
import { useVideoAvailable } from '../hooks/useVideoAvailable';
import { formatTime } from '../services/format';

export const REPEAT_LABEL = { off: 'tắt', all: 'tất cả', one: 'một bài' } as const;

interface IconBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  children: ReactNode;
}

export function IconBtn({ label, active, className = '', children, ...props }: IconBtnProps) {
  return (
    <button type="button" className={`icon-btn${active ? ' is-active' : ''} ${className}`} aria-label={label} title={label} aria-pressed={active} {...props}>
      {children}
    </button>
  );
}

export function TransportControls({ size = 'normal' }: { size?: 'normal' | 'large' }) {
  const p = usePlayer();
  const big = size === 'large';
  return (
    <div className={`transport-wrap${big ? ' transport-wrap--large' : ''}`}>
      <div className="transport">
        <IconBtn label="Bài trước (Ctrl + ←)" onClick={p.prev} disabled={!p.track}><SkipBack size={big ? 28 : 22} fill="currentColor" /></IconBtn>
        <button
          type="button"
          className="play-btn"
          onClick={p.togglePlay}
          disabled={!p.track}
          aria-label={p.isPlaying ? 'Tạm dừng' : 'Phát'}
          title={p.isPlaying ? 'Tạm dừng (Space)' : 'Phát (Space)'}
        >
          {p.buffering && p.isPlaying ? (
            <Loader2 size={big ? 32 : 26} className="spin" />
          ) : p.isPlaying ? (
            <Pause size={big ? 32 : 26} fill="currentColor" strokeWidth={0} />
          ) : (
            <Play size={big ? 32 : 26} fill="currentColor" strokeWidth={0} className="play-btn__play" />
          )}
        </button>
        <IconBtn label="Bài tiếp theo (Ctrl + →)" onClick={p.next} disabled={!p.track}><SkipForward size={big ? 28 : 22} fill="currentColor" /></IconBtn>
      </div>
      <div className="transport transport--modes">
        <IconBtn label={p.shuffle ? 'Trộn bài: bật (S)' : 'Trộn bài: tắt (S)'} active={p.shuffle} onClick={p.toggleShuffle}><Shuffle size={big ? 22 : 20} /></IconBtn>
        <IconBtn label={`Lặp lại: ${REPEAT_LABEL[p.repeat]} (R)`} active={p.repeat !== 'off'} onClick={p.cycleRepeat}>
          {p.repeat === 'one' ? <Repeat1 size={big ? 22 : 20} /> : <Repeat size={big ? 22 : 20} />}
        </IconBtn>
      </div>
    </div>
  );
}

/** Browsers may block playback that wasn't started by a tap/click; offer a one-tap resume. */
export function AutoplayBlocked() {
  const p = usePlayer();
  return (
    <div className="autoplay-blocked" role="alert">
      <AlertTriangle size={16} />
      <span>Chưa phát được: trình duyệt chặn tự động phát hoặc mạng quá chậm. Bấm để thử lại.</span>
      <button className="btn btn--primary btn--sm" onClick={p.play}><Play size={14} fill="currentColor" strokeWidth={0} /> Tiếp tục phát</button>
    </div>
  );
}

export function VolumeControl() {
  const p = usePlayer();
  const vol = p.muted ? 0 : p.volume;
  const VolIcon = vol === 0 ? VolumeX : vol < 50 ? Volume1 : Volume2;
  return (
    <div className="volume">
      <IconBtn label={p.muted ? 'Bật tiếng (M)' : 'Tắt tiếng (M)'} onClick={p.toggleMute}><VolIcon size={20} /></IconBtn>
      <input
        type="range"
        className="slider"
        min={0}
        max={100}
        value={vol}
        onChange={(e) => p.setVolume(Number(e.target.value))}
        aria-label="Âm lượng"
        aria-valuetext={`${vol}%`}
        style={{ '--p': `${vol}%` } as CSSProperties}
      />
    </div>
  );
}

// The playback position changes 4×/s: only these two small components subscribe to it,
// so the rest of the player bar doesn't re-render while music plays.
function TimeText() {
  const { time, dur } = useProgress();
  return <>{formatTime(time)} / {formatTime(dur)}</>;
}

function ProgressVisualizer(props: Omit<Parameters<typeof Visualizer>[0], 'variant' | 'progress'>) {
  const { progress } = useProgress();
  return <Visualizer variant="compact" progress={progress} {...props} />;
}

export default function PlayerBar() {
  const p = usePlayer();
  const { isSaved, toggleSaved, settings, updateSettings } = useLibrary();
  const ui = useUI();
  const videoOk = useVideoAvailable();
  const openFocus = useOpenFocus();
  const { autoplay, setAutoplay } = useRecommendations();
  const { track } = p;

  return (
    <footer className={`player${track ? '' : ' is-empty'}`} aria-label="Trình phát">
      <ProgressBar />
      {p.autoplayBlocked && <AutoplayBlocked />}

      <div className="player__left">
        {track ? (
          <>
            <button className="player__art" onClick={openFocus} aria-label="Mở chế độ Tập trung" title="Chế độ Tập trung (F)">
              <Artwork track={track} />
            </button>
            <div className="player__info">
              <div className="player__title" title={track.title}>{track.title}</div>
              <div className="player__artist">{track.channel}</div>
              <div className="player__time">
                {p.buffering && p.isPlaying
                  ? <span className="player__loading"><Loader2 size={12} className="spin" /> Đang tải…</span>
                  : track.isLive ? <span className="live-pill">LIVE</span> : <TimeText />}
              </div>
            </div>
            <IconBtn label={isSaved(track.id) ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'} active={isSaved(track.id)} className="player__like" onClick={() => toggleSaved(track)}>
              <Heart size={18} fill={isSaved(track.id) ? 'currentColor' : 'none'} />
            </IconBtn>
          </>
        ) : (
          <div className="player__placeholder">
            <div className="player__art player__art--blank" />
            <div className="player__info">
              <div className="player__title">Chưa phát bài nào</div>
              <div className="player__artist">Chọn một video để bắt đầu nghe</div>
            </div>
          </div>
        )}
      </div>

      <div className="player__center">
        <ProgressVisualizer
          mode={settings.visualizer}
          playing={p.isPlaying && !p.buffering}
          getAnalyser={p.getAnalyser}
          seed={track?.id || 'idle'}
          onToggleMode={() => updateSettings({ visualizer: settings.visualizer === 'wave' ? 'spectrum' : 'wave' })}
        />
        <TransportControls />
      </div>

      <div className="player__right">
        <SpeedMenu />
        <SleepTimerMenu />
        <VolumeControl />
        <IconBtn label={!videoOk ? 'Bài này không có video' : ui.videoOpen ? 'Ẩn video (V)' : 'Xem video (V)'} active={videoOk && ui.videoOpen} disabled={!videoOk}
          onClick={() => ui.toggleVideo()} className="player__video"><MonitorPlay size={20} /></IconBtn>
        <IconBtn label="Lời bài hát (L)" active={ui.panel === 'lyrics'} onClick={() => ui.togglePanel('lyrics')}><MicVocal size={20} /></IconBtn>
        <IconBtn label={autoplay.enabled ? 'Tự động phát: bật — hết bài phát tiếp danh sách và bài gợi ý' : 'Tự động phát: tắt — hết bài là dừng'} active={autoplay.enabled} onClick={() => setAutoplay(!autoplay.enabled)} className="player__autoplay"><InfinityIcon size={20} /></IconBtn>
        <IconBtn label="Hàng đợi (Q)" active={ui.panel === 'queue'} onClick={() => ui.togglePanel('queue')}><ListMusic size={20} /></IconBtn>
        <IconBtn label="Chế độ Tập trung (F)" onClick={openFocus}><Maximize2 size={19} /></IconBtn>
      </div>
    </footer>
  );
}
