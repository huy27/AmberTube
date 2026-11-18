import { Play, Pause } from 'lucide-react';
import type { Track } from '../types';
import Artwork from './Artwork';
import Equalizer from './Equalizer';
import { usePlayer } from '../context/PlayerContext';
import { formatTime } from '../services/format';

export default function TrackCard({ track, list }: { track: Track; list?: Track[] }) {
  const { track: current, isPlaying, playTrack } = usePlayer();
  const isCurrent = current?.id === track.id;
  return (
    <button className={`card${isCurrent ? ' is-current' : ''}`} onClick={() => playTrack(track, list)}>
      <span className="card__thumb">
        <Artwork track={track} />
        <span className="duration">{track.isLive ? 'LIVE' : formatTime(track.duration)}</span>
        {isCurrent && isPlaying && <span className="card__eq"><Equalizer /></span>}
        <span className="card__play">
          {isCurrent && isPlaying ? <Pause size={20} fill="currentColor" strokeWidth={0} /> : <Play size={20} fill="currentColor" strokeWidth={0} />}
        </span>
      </span>
      <span className="card__title">{track.title}</span>
      <span className="card__sub">{track.channel}</span>
    </button>
  );
}
