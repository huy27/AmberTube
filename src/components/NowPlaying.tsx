import { useEffect, useRef } from 'react';
import { ChevronDown, SkipBack, SkipForward, Play, Pause, Loader2, Heart, ListMusic, Infinity as InfinityIcon, ThumbsUp, ThumbsDown, Shuffle, Repeat, Repeat1, Music, Search } from 'lucide-react';
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
  const remaining = Math.max(0, (dur || 0) - time);
  return (
    <div className="np" ref={root} role="dialog" aria-modal="true" aria-label="Đang phát">
      <header className="np__top">
        <button className="cbtn cbtn--ghost" onClick={() => ui.setNowPlaying(false)} aria-label="Quay lại"><ChevronDown size={26} /></button>
        <span className="np__label">Đang phát</span>
        <div className="np__topright">
          <button className="np__find" onClick={() => { ui.setNowPlaying(false); window.dispatchEvent(new CustomEvent('ambertube:find', { detail: { voice: false } })); }} aria-label="Tìm bài (gõ bằng bàn phím, nhạc vẫn phát)">
            <Search size={20} /><span>Tìm bài</span>
          </button>
          <button className="cbtn cbtn--ghost" onClick={() => { ui.setNowPlaying(false); ui.setPanel('queue'); }} aria-label="Hàng đợi"><ListMusic size={22} /></button>
        </div>
      </header>
      <div className="np__body">
        <div className="np__main">
          <div className="np__head">
            {t.thumbnail || t.art ? <div className="np__art"><Artwork track={t} /></div> : <div className="np__art np__art--empty" aria-hidden="true"><Music size={48} strokeWidth={1.5} /></div>}
            <div className="np__titlebar">
              <div className="np__text">
                <h2 className="np__title" title={t.title}>{t.title}</h2>
                <p className="np__artist">{t.channel}</p>
              </div>
              <button className={`np__like${saved ? ' is-on' : ''}`} onClick={() => toggleSaved(t)} aria-pressed={saved} aria-label={saved ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}>
                <Heart size={24} fill={saved ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>
          <div className="np__progress">
            <ProgressBar variant="inline" />
            <div className="np__times"><span>{formatTime(time)}</span><span>{t.isLive ? 'LIVE' : `-${formatTime(remaining)}`}</span></div>
          </div>
          <div className="np__controls">
            <button className="cbtn np__mode np__fb" onClick={() => lessLikeThis(t)} aria-label="Bớt bài như này" title="Bớt bài như này"><ThumbsDown size={20} /></button>
            <button className={`cbtn np__mode${p.shuffle ? ' is-on' : ''}`} onClick={p.toggleShuffle} aria-pressed={p.shuffle} aria-label={p.shuffle ? 'Trộn bài: bật' : 'Trộn bài: tắt'} title="Trộn bài">
              <Shuffle size={20} />
            </button>
            <button className="cbtn np__skip" onClick={p.prev} aria-label="Bài trước"><SkipBack size={28} fill="currentColor" /></button>
            <button className="cbtn cbtn--play np__play" onClick={p.togglePlay} aria-label={p.isPlaying ? 'Tạm dừng' : 'Phát'}>
              {p.buffering && p.isPlaying ? <Loader2 size={30} className="spin" /> : p.isPlaying ? <Pause size={30} fill="currentColor" strokeWidth={0} /> : <Play size={30} fill="currentColor" strokeWidth={0} className="play-btn__play" />}
            </button>
            <button className="cbtn np__skip" onClick={p.next} aria-label="Bài tiếp theo"><SkipForward size={28} fill="currentColor" /></button>
            <button className={`cbtn np__mode${p.repeat !== 'off' ? ' is-on' : ''}`} onClick={p.cycleRepeat}
              aria-label={p.repeat === 'one' ? 'Lặp lại: một bài' : p.repeat === 'all' ? 'Lặp lại: tất cả' : 'Lặp lại: tắt'} title="Lặp lại">
              {p.repeat === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
            </button>
            <button className="cbtn np__mode np__fb" onClick={() => moreLikeThis(t)} aria-label="Thêm bài như này" title="Thêm bài như này"><ThumbsUp size={20} /></button>
          </div>
          <div className="np__extras np__nextcard">
            <span className="np__nextart" aria-hidden="true">{next ? <Artwork track={next} /> : null}</span>
            <div className="np__nexttext">
              <span className="np__eyebrow">Tiếp theo</span>
              {next ? (
                <>
                  <strong className="np__nexttitle" title={next.title}>{next.title}</strong>
                  <span className="np__nextsub" title={p.autoReasons.get(next.id) || undefined}>· {next.channel}</span>
                </>
              ) : (
                <span className="np__nextsub">{autoplay.enabled ? 'Tự phát sẽ chọn bài phù hợp' : 'Hết hàng đợi'}</span>
              )}
            </div>
            <button className={`np__auto${autoplay.enabled ? ' is-on' : ''}`} onClick={() => setAutoplay(!autoplay.enabled)} aria-pressed={autoplay.enabled} aria-label="Tự phát bài gợi ý">
              <InfinityIcon size={18} /><span>Tự phát</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
