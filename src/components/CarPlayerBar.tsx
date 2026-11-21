import { SkipBack, SkipForward, Play, Pause, Loader2, MoreHorizontal, Shuffle, Repeat, Repeat1, ListMusic, MicVocal, Timer, Infinity as InfinityIcon, ChevronUp, Mic, MonitorPlay } from 'lucide-react';
import { openCarVoice } from '../voice/CarVoiceSearch';
import Artwork from './Artwork';
import ProgressBar from './ProgressBar';
import Popover from './Popover';
import SpeedMenu from './SpeedMenu';
import SleepTimerMenu from './SleepTimerMenu';
import { AutoplayBlocked } from './PlayerBar';
import { usePlayer } from '../context/PlayerContext';
import { useUI } from '../context/UIContext';
import { useRecommendations } from '../recommend/RecommendationProvider';
import { useOpenFocus } from '../hooks/useFocusNavigation';
import { useVideoAvailable } from '../hooks/useVideoAvailable';
import { REPEAT_LABEL } from './PlayerBar';

/** Compact, touch-first player for Car View and phones. Same engine, same queue as the desktop bar. */
export default function CarPlayerBar() {
  const p = usePlayer();
  const ui = useUI();
  const openFocus = useOpenFocus();
  const videoOk = useVideoAvailable();
  const { autoplay, setAutoplay } = useRecommendations();
  const next = p.index >= 0 ? p.queue[p.index + 1] : undefined;
  const nextIsAuto = next ? p.autoReasons.has(next.id) : false;

  return (
    <footer className={`player player--car${p.track ? '' : ' is-empty'}`} aria-label="Trình phát">
      <ProgressBar />
      {p.autoplayBlocked && <AutoplayBlocked />}
      <button className="cplayer__now" onClick={() => p.track && ui.setNowPlaying(true)} disabled={!p.track} aria-label="Mở màn hình Đang phát">
        <span className="cplayer__art">{p.track ? <Artwork track={p.track} /> : null}</span>
        <span className="cplayer__info">
          <span className="cplayer__title">{p.track?.title ?? 'Chưa phát bài nào'}</span>
          <span className="cplayer__artist">{p.track ? p.track.channel : 'Chọn một bài để bắt đầu'}</span>
          {next && <span className="cplayer__next">Tiếp theo{nextIsAuto ? ' (gợi ý)' : ''}: {next.title}</span>}
        </span>
        {p.track && <ChevronUp size={20} className="cplayer__up" />}
      </button>

      <div className="cplayer__controls">
        <button className="cbtn" onClick={p.prev} disabled={!p.track} aria-label="Bài trước"><SkipBack size={28} fill="currentColor" /></button>
        <button className="cbtn cbtn--play" onClick={p.togglePlay} disabled={!p.track} aria-label={p.isPlaying ? 'Tạm dừng' : 'Phát'}>
          {p.buffering && p.isPlaying ? <Loader2 size={30} className="spin" /> : p.isPlaying ? <Pause size={30} fill="currentColor" strokeWidth={0} /> : <Play size={30} fill="currentColor" strokeWidth={0} className="play-btn__play" />}
        </button>
        <button className="cbtn" onClick={p.next} disabled={!p.track} aria-label="Bài tiếp theo"><SkipForward size={28} fill="currentColor" /></button>
      </div>

      <div className="cplayer__side">
        <button className="cbtn cbtn--mic" onClick={openCarVoice} aria-label="Tìm bằng giọng nói" title="Tìm bằng giọng nói">
          <Mic size={26} />
        </button>
        <button className={`cbtn cbtn--toggle${autoplay.enabled ? ' is-on' : ''}`} onClick={() => setAutoplay(!autoplay.enabled)} aria-pressed={autoplay.enabled}
          aria-label={autoplay.enabled ? 'Tự động phát: bật' : 'Tự động phát: tắt (hết bài là dừng)'} title="Tự động phát">
          <InfinityIcon size={24} /><span className="cbtn__label">Tự phát</span>
        </button>
        <Popover className="cplayer__more" label="Tùy chọn phát" align="right" trigger={<MoreHorizontal size={26} />}>
          {(close) => (
            <div className="cmenu">
              <button className={`cmenu__item${p.shuffle ? ' is-on' : ''}`} onClick={p.toggleShuffle} aria-pressed={p.shuffle}><Shuffle size={22} /> Trộn bài: {p.shuffle ? 'bật' : 'tắt'}</button>
              <button className={`cmenu__item${p.repeat !== 'off' ? ' is-on' : ''}`} onClick={p.cycleRepeat}>{p.repeat === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />} Lặp lại: {REPEAT_LABEL[p.repeat]}</button>
              <button className="cmenu__item" onClick={() => { ui.togglePanel('queue'); close(); }}><ListMusic size={22} /> Hàng đợi</button>
              <button className={`cmenu__item${videoOk && ui.videoOpen ? ' is-on' : ''}`} disabled={!videoOk} onClick={() => { ui.toggleVideo(); close(); }}><MonitorPlay size={22} /> {!videoOk ? 'Video: bài này không có' : ui.videoOpen ? 'Ẩn video' : 'Xem video'}</button>
              <button className="cmenu__item" onClick={() => { ui.togglePanel('lyrics'); close(); }}><MicVocal size={22} /> Lời bài hát</button>
              <button className="cmenu__item" onClick={() => { close(); openFocus(); }}><Timer size={22} /> Chế độ Tập trung</button>
              <div className="cmenu__row"><span>Tốc độ</span><SpeedMenu align="right" /></div>
              <div className="cmenu__row"><span>Hẹn giờ tắt</span><SleepTimerMenu align="right" /></div>
            </div>
          )}
        </Popover>
      </div>
    </footer>
  );
}
