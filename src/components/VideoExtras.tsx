import { RotateCcw, RotateCw } from 'lucide-react';
import { useProgress } from './ProgressBar';
import { usePlayer } from '../context/PlayerContext';

/** Extra video controls: seek ±10 s. Used in the video window and in full screen. */
export default function VideoExtras() {
  const p = usePlayer();
  const { time, dur } = useProgress();
  const live = Boolean(p.track?.isLive);
  const by = (d: number) => p.seek(Math.min(dur || Infinity, Math.max(0, time + d)));
  return (
    <>
      <button className="icon-btn icon-btn--sm video-x" onClick={() => by(-10)} disabled={live} aria-label="Tua lại 10 giây" title="Tua lại 10 giây"><RotateCcw size={16} /></button>
      <button className="icon-btn icon-btn--sm video-x" onClick={() => by(10)} disabled={live} aria-label="Tua tới 10 giây" title="Tua tới 10 giây"><RotateCw size={16} /></button>
    </>
  );
}
