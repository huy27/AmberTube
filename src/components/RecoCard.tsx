import { Play, Pause } from 'lucide-react';
import type { Track } from '../types';
import Artwork from './Artwork';
import Equalizer from './Equalizer';
import MoreMenu from './MoreMenu';
import { usePlayer } from '../context/PlayerContext';
import { formatTime } from '../services/format';

/** Compact card for recommendation shelves: tap to play, menu for queue/radio/feedback. */
export default function RecoCard({ track, list, note }: { track: Track; list?: Track[]; note?: string }) {
  const { track: current, isPlaying, playTrack } = usePlayer();
  const isCurrent = current?.id === track.id;
  return (
    <div className={`reco-card${isCurrent ? ' is-current' : ''}`}>
      <button className="reco-card__main" onClick={() => playTrack(track, list)} aria-label={`${isCurrent && isPlaying ? 'Tạm dừng' : 'Phát'} ${track.title}`}>
        <span className="reco-card__thumb">
          <Artwork track={track} />
          {track.duration > 0 && <span className="duration">{formatTime(track.duration)}</span>}
          {isCurrent && isPlaying && <span className="card__eq"><Equalizer /></span>}
          <span className="card__play">{isCurrent && isPlaying ? <Pause size={18} fill="currentColor" strokeWidth={0} /> : <Play size={18} fill="currentColor" strokeWidth={0} />}</span>
        </span>
        <span className="reco-card__title" title={track.title}>{track.title}</span>
        <span className="reco-card__sub">{note ?? track.channel}</span>
      </button>
      <div className="reco-card__menu"><MoreMenu track={track} showLabel={false} /></div>
    </div>
  );
}
