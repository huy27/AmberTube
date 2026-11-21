import { useSyncExternalStore } from 'react';
import { Check, RotateCcw, RotateCw, Settings2 } from 'lucide-react';
import Popover from './Popover';
import { useProgress } from './ProgressBar';
import { usePlayer } from '../context/PlayerContext';
import { QUALITIES, getQuality, setQuality, subscribeQuality } from '../playback/videoQuality';

/** Extra video controls: seek ±10 s and a quality hint. Used in the video window and in full screen. */
export default function VideoExtras({ align = 'right' }: { align?: 'left' | 'right' | 'center' }) {
  const p = usePlayer();
  const { time, dur } = useProgress();
  const q = useSyncExternalStore(subscribeQuality, getQuality);
  const live = Boolean(p.track?.isLive);
  const by = (d: number) => p.seek(Math.min(dur || Infinity, Math.max(0, time + d)));
  return (
    <>
      <button className="icon-btn icon-btn--sm video-x" onClick={() => by(-10)} disabled={live} aria-label="Tua lại 10 giây" title="Tua lại 10 giây"><RotateCcw size={16} /></button>
      <button className="icon-btn icon-btn--sm video-x" onClick={() => by(10)} disabled={live} aria-label="Tua tới 10 giây" title="Tua tới 10 giây"><RotateCw size={16} /></button>
      <Popover className="video-q" label="Chất lượng video" title="Chất lượng video" align={align} active={q !== 'auto'} trigger={<Settings2 size={16} />}>
        {(close) => (
          <>
            <div className="popover__title">Chất lượng video</div>
            {QUALITIES.map((o) => (
              <button key={o.id} role="menuitemradio" aria-checked={o.id === q} className={`popover__item${o.id === q ? ' is-selected' : ''}`} onClick={() => { setQuality(o.id); close(); }}>
                <span>{o.label}</span>{o.id === q && <Check size={16} />}
              </button>
            ))}
            <p className="popover__note">Chỉ là gợi ý cho YouTube, có thể không được áp dụng.</p>
          </>
        )}
      </Popover>
    </>
  );
}
