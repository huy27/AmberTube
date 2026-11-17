import { useEffect, useRef } from 'react';
import { ChevronDown, SkipBack, SkipForward, Play, Pause, Loader2, Heart, ListMusic, Infinity as InfinityIcon, ThumbsUp, ThumbsDown } from 'lucide-react';
import Artwork from './Artwork';
import ProgressBar, { useProgress } from './ProgressBar';
import { usePlayer } from '../context/PlayerContext';
import { useUI } from '../context/UIContext';
import { useLibrary } from '../context/LibraryContext';
import { useRecommendations } from '../recommend/RecommendationProvider';
import { formatTime } from '../services/format';

/** Car View "Now Playing": artwork, track, progress and large controls — no scrolling needed. */
export default function NowPlaying() {
  const ui = useUI();
  const p = usePlayer();
  const { isSaved, toggleSaved } = useLibrary();
  const { autoplay, setAutoplay, moreLikeThis, lessLikeThis } = useRecommendations();
  const { time, dur } = useProgress();
  const root = useRef<HTMLDivElement>(null);
  const open = ui.nowPlaying && Boolean(p.track);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('.np__play')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.setNowPlaying(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !p.track) return null;
  const t = p.track;
  const next = p.queue[p.index + 1];
  const saved = isSaved(t.id);
  return (
    <div className="np" ref={root} role="dialog" aria-modal="true" aria-label="Đang phát">
      <header className="np__top">
        <button className="cbtn cbtn--ghost" onClick={() => ui.setNowPlaying(false)} aria-label="Quay lại"><ChevronDown size={28} /></button>
        <span className="np__label">Đang phát</span>
        <button className="cbtn cbtn--ghost" onClick={() => { ui.setNowPlaying(false); ui.setPanel('queue'); }} aria-label="Hàng đợi"><ListMusic size={24} /></button>
      </header>
      <div className="np__body">
        <div className="np__art"><Artwork track={t} /></div>
        <div className="np__main">
          <div className="np__titlebar">
            <div className="np__text">
              <h2 className="np__title">{t.title}</h2>
              <p className="np__artist">{t.channel}</p>
            </div>
            <button className={`cbtn${saved ? ' is-on' : ''}`} onClick={() => toggleSaved(t)} aria-pressed={saved} aria-label={saved ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}>
              <Heart size={26} fill={saved ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div className="np__progress">
            <ProgressBar variant="inline" />
            <div className="np__times"><span>{formatTime(time)}</span><span>{t.isLive ? 'LIVE' : formatTime(dur)}</span></div>
          </div>
          <div className="np__controls">
            <button className="cbtn cbtn--xl" onClick={p.prev} aria-label="Bài trước"><SkipBack size={34} fill="currentColor" /></button>
            <button className="cbtn cbtn--play cbtn--xxl np__play" onClick={p.togglePlay} aria-label={p.isPlaying ? 'Tạm dừng' : 'Phát'}>
              {p.buffering && p.isPlaying ? <Loader2 size={36} className="spin" /> : p.isPlaying ? <Pause size={36} fill="currentColor" strokeWidth={0} /> : <Play size={36} fill="currentColor" strokeWidth={0} className="play-btn__play" />}
            </button>
            <button className="cbtn cbtn--xl" onClick={p.next} aria-label="Bài tiếp theo"><SkipForward size={34} fill="currentColor" /></button>
          </div>
          <div className="np__extras">
            <button className={`cbtn cbtn--toggle${autoplay.enabled ? ' is-on' : ''}`} onClick={() => setAutoplay(!autoplay.enabled)} aria-pressed={autoplay.enabled} aria-label="Tự phát bài gợi ý">
              <InfinityIcon size={22} /><span className="cbtn__label">Tự phát</span>
            </button>
            <button className="cbtn" onClick={() => moreLikeThis(t)} aria-label="Thêm bài như này" title="Thêm bài như này"><ThumbsUp size={22} /></button>
            <button className="cbtn" onClick={() => lessLikeThis(t)} aria-label="Bớt bài như này" title="Bớt bài như này"><ThumbsDown size={22} /></button>
          </div>
          {next && <p className="np__next">Tiếp theo: <strong>{next.title}</strong>{p.autoReasons.get(next.id) ? <span> · {p.autoReasons.get(next.id)}</span> : null}</p>}
        </div>
      </div>
    </div>
  );
}
