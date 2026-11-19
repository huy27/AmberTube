import type { KeyboardEvent, ReactNode } from 'react';
import { Play, Pause, Ban, ListPlus } from 'lucide-react';
import type { Track } from '../types';
import Artwork from './Artwork';
import DownloadButton from './DownloadButton';
import MoreMenu from './MoreMenu';
import Equalizer from './Equalizer';
import { usePlayer } from '../context/PlayerContext';
import { formatTime, formatCount, formatViews } from '../services/format';

interface Props {
  track: Track;
  /** 1-based position shown in the # column */
  index?: number;
  list?: Track[];
  onRemove?: () => void;
  removeLabel?: string;
  extraMeta?: ReactNode;
}

/** One row of a TrackList. Clicking the row plays the song; actions appear on hover / focus. */
export default function VideoRow({ track, index, list, onRemove, removeLabel, extraMeta }: Props) {
  const { track: current, isPlaying, buffering, playTrack, togglePlay, failedIds, addToQueue } = usePlayer();
  const isCurrent = current?.id === track.id;
  const failed = failedIds.has(track.id);

  const play = () => (isCurrent ? togglePlay() : playTrack(track, list));
  const onKey = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      play();
    }
  };

  const views = formatViews(track.views);
  const playing = isCurrent && isPlaying;
  return (
    <div
      role="row"
      className={`video-row${isCurrent ? ' is-current' : ''}${failed ? ' is-failed' : ''}`}
      onClick={play}
      onKeyDown={onKey}
      tabIndex={0}
      aria-label={`${playing ? 'Tạm dừng' : 'Phát'} ${track.title}`}
    >
      <span role="cell" className="tl-num">
        <span className="tl-num__n">{isCurrent ? <Equalizer paused={!playing || buffering} /> : index ?? ''}</span>
        <span className="tl-num__play" aria-hidden="true">{playing ? <Pause size={16} fill="currentColor" strokeWidth={0} /> : <Play size={16} fill="currentColor" strokeWidth={0} />}</span>
      </span>
      <div role="cell" className="tl-title">
        <span className="video-row__thumb">
          <Artwork track={track} small />
          {(track.isLive || track.duration > 0) && (
            <span className={`thumb-time${track.isLive ? ' thumb-time--live' : ''}`} aria-label={track.isLive ? 'Đang phát trực tiếp' : `Thời lượng ${formatTime(track.duration)}`}>
              {track.isLive ? 'LIVE' : formatTime(track.duration)}
            </span>
          )}
        </span>
        <span className="tl-title__text">
          <span className="video-row__title" title={track.title}>{track.title}</span>
          {(failed || extraMeta) && (
            <span className="video-row__sub">
              {failed ? <span className="unavailable"><Ban size={12} /> Không phát được — đã bỏ qua</span> : extraMeta}
            </span>
          )}
          <span className="video-row__sub tl-channel-inline">{track.channel}</span>
        </span>
      </div>
      <span role="cell" className="tl-channel" title={track.channel}>{track.channel}</span>
      <span role="cell" className="tl-views" title={views || undefined}>{formatCount(track.views) || (track.provider === 'local' ? 'Trên máy' : '')}</span>
      <div role="cell" className="tl-actions video-row__btns" onClick={(e) => e.stopPropagation()}>
        {track.provider !== 'local' && <DownloadButton track={track} variant="mp3" />}
        <button className="tl-icon video-row__queue" onClick={() => addToQueue(track)} aria-label={`Thêm ${track.title} vào hàng đợi`} title="Thêm vào hàng đợi">
          <ListPlus size={17} strokeWidth={1.8} />
        </button>
        <MoreMenu track={track} onRemove={onRemove} removeLabel={removeLabel} showLabel={false} />
      </div>
    </div>
  );
}
