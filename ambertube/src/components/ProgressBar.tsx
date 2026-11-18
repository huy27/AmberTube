import { useState, type CSSProperties } from 'react';
import { usePlayer, usePlayerTime } from '../context/PlayerContext';
import { formatTime } from '../services/format';

/** Seek bar. `variant="top"` is the thin amber line across the top of the player bar. */
export default function ProgressBar({ variant = 'top' }: { variant?: 'top' | 'inline' }) {
  const { track, seek, buffering, isPlaying } = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  const [scrub, setScrub] = useState<number | null>(null);
  const live = Boolean(track?.isLive);
  const dur = duration || track?.duration || 0;
  const time = scrub ?? currentTime;
  const progress = dur > 0 && !live ? Math.min(1, time / dur) : live ? 1 : 0;
  const commit = () => {
    if (scrub != null) {
      seek(scrub);
      setScrub(null);
    }
  };

  return (
    <div className={`progress progress--${variant}${track ? '' : ' is-empty'}${buffering && isPlaying ? ' is-loading' : ''}`} style={{ '--p': `${progress * 100}%` } as CSSProperties}>
      <div className="progress__track"><div className="progress__fill" /><div className="progress__knob" /></div>
      <input
        type="range"
        className="progress__input"
        min={0}
        max={dur || 1}
        step={0.1}
        value={Math.min(time, dur || 1)}
        disabled={!track || live || !dur}
        aria-label="Tua"
        aria-valuetext={`${formatTime(time)} / ${formatTime(dur)}`}
        onChange={(e) => setScrub(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </div>
  );
}

export function useProgress() {
  const { track } = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  const dur = duration || track?.duration || 0;
  return { time: currentTime, dur, progress: dur > 0 && !track?.isLive ? Math.min(1, currentTime / dur) : 0 };
}
