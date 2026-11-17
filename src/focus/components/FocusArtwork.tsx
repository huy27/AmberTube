import { useState } from 'react';
import { Heart, Music2, Headphones, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Artwork from '../../components/Artwork';
import { usePlayer } from '../../context/PlayerContext';
import { useLibrary } from '../../context/LibraryContext';
import { useToast } from '../../context/ToastContext';
import { searchVideos } from '../../services/youtube';

export default function FocusArtwork() {
  const { track, isPlaying, playTrack } = usePlayer();
  const { isSaved, toggleSaved } = useLibrary();
  const toast = useToast();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  const quickStart = async () => {
    setStarting(true);
    try {
      const r = await searchVideos('lofi hip hop');
      if (r.items.length) playTrack(r.items[0], r.items);
    } catch (e) {
      toast((e as Error).message, { type: 'warning' });
    } finally {
      setStarting(false);
    }
  };

  if (!track) {
    return (
      <div className="fm-art-block">
        <div className="fm-art fm-art--empty"><Music2 size={56} strokeWidth={1.4} /></div>
        <div className="fm-track">
          <div className="fm-track__title">Chưa phát nhạc</div>
          <div className="fm-track__artist">Chọn nhạc để tập trung tốt hơn</div>
          <div className="fm-track__actions">
            <button className="btn btn--primary btn--sm" onClick={quickStart} disabled={starting}><Headphones size={15} /> {starting ? 'Đang tải…' : 'Phát nhạc Lo-fi'}</button>
            <button className="btn btn--ghost btn--sm" onClick={() => navigate('/search')}><Search size={15} /> Chọn nhạc</button>
          </div>
        </div>
      </div>
    );
  }

  const saved = isSaved(track.id);
  return (
    <div className="fm-art-block">
      <div className={`fm-art${isPlaying ? ' is-playing' : ''}`}>
        <div className="fm-art__glow" aria-hidden="true"><Artwork track={track} /></div>
        <div className="fm-art__img" key={track.id}><Artwork track={track} /></div>
      </div>
      <div className="fm-track" key={`info-${track.id}`}>
        <div className="fm-track__row">
          <div className="fm-track__text">
            <div className="fm-track__title" title={track.title}>{track.title}</div>
            <div className="fm-track__artist">{track.channel}</div>
          </div>
          <button className={`icon-btn fm-fav${saved ? ' is-active' : ''}`} onClick={() => toggleSaved(track)} aria-pressed={saved}
            aria-label={saved ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'} title={saved ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}>
            <Heart size={20} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </div>
  );
}
