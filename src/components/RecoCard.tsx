import type { ReactNode, Ref } from 'react';
import { Play, Pause, Loader2 } from 'lucide-react';
import type { Track } from '../types';
import Artwork from './Artwork';
import Equalizer from './Equalizer';
import MoreMenu from './MoreMenu';
import { usePlayer } from '../context/PlayerContext';
import { formatTime } from '../services/format';

interface Props {
  track: Track;
  list?: Track[];
  note?: string;
  /** Custom play action (e.g. chart songs that are looked up on YouTube first). Default: play `track` with `list`. */
  onPlay?: () => void;
  /** Chart position, shown as a badge on the thumbnail. */
  rank?: number;
  /** Shows a spinner on the thumbnail while `onPlay` is working. */
  busy?: boolean;
  /** Replaces the default track menu; `false` hides it. */
  menu?: ReactNode | false;
  /** Accessible name; defaults to the track title. */
  label?: string;
  /** Square artwork (album covers) instead of 16:9 video thumbnails. */
  square?: boolean;
  cardRef?: Ref<HTMLDivElement>;
}

/** Compact card for recommendation and chart shelves: tap to play, menu for queue/radio/feedback. */
export default function RecoCard({ track, list, note, onPlay, rank, busy = false, menu, label, square = false, cardRef }: Props) {
  const { track: current, isPlaying, playTrack } = usePlayer();
  const isCurrent = current?.id === track.id;
  const name = label ?? track.title;
  return (
    <div ref={cardRef} className={`reco-card${square ? ' reco-card--square' : ''}${isCurrent ? ' is-current' : ''}`}>
      <button className="reco-card__main" onClick={onPlay ?? (() => playTrack(track, list))} aria-busy={busy || undefined}
        aria-label={`${busy ? 'Đang tìm' : isCurrent && isPlaying ? 'Tạm dừng' : 'Phát'} ${name}`}>
        <span className="reco-card__thumb">
          <Artwork track={track} />
          {rank != null && <span className="reco-card__rank" aria-hidden="true">#{rank}</span>}
          {busy && <span className="reco-card__busy" aria-hidden="true"><Loader2 size={22} className="spin" /></span>}
          {track.duration > 0 && <span className="duration">{formatTime(track.duration)}</span>}
          {isCurrent && isPlaying && <span className="card__eq"><Equalizer /></span>}
          <span className="card__play">{isCurrent && isPlaying ? <Pause size={18} fill="currentColor" strokeWidth={0} /> : <Play size={18} fill="currentColor" strokeWidth={0} />}</span>
        </span>
        <span className="reco-card__title" title={track.title}>{track.title}</span>
        <span className="reco-card__sub">{note ?? track.channel}</span>
      </button>
      {menu !== false && <div className="reco-card__menu">{menu ?? <MoreMenu track={track} showLabel={false} />}</div>}
    </div>
  );
}
