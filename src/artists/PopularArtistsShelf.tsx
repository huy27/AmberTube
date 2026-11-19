import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import Shelf from '../components/Shelf';
import ArtistCard, { ArtistCardSkeleton } from './ArtistCard';
import { useTopArtists } from './useTopArtists';

/** Home: "Nghệ sĩ nổi bật tại Việt Nam" (Last.fm geo.getTopArtists). Hidden when no Last.fm key is configured. */
export default function PopularArtistsShelf() {
  const top = useTopArtists(20);
  if (!top.enabled) return null;
  const action = <Link to="/artists" className="mood-shelf__all">Xem tất cả</Link>;
  if (top.status === 'error') {
    return (
      <Shelf id="sh-artists" title="Nghệ sĩ nổi bật tại Việt Nam" action={action}>
        <div className="artists-error" role="status">
          <AlertTriangle size={18} /> <span>{top.error}</span>
          <button className="btn btn--ghost btn--sm" onClick={top.retry}>Thử lại</button>
        </div>
      </Shelf>
    );
  }
  if (top.status === 'ready' && top.artists.length === 0) return null; // nothing to show — no empty shelf on Home
  return (
    <Shelf id="sh-artists" title="Nghệ sĩ nổi bật tại Việt Nam" subtitle="Theo số người nghe trên Last.fm" action={action}>
      {top.status === 'loading'
        ? Array.from({ length: 6 }).map((_, i) => <ArtistCardSkeleton key={i} />)
        : top.artists.map((a) => <ArtistCard key={a.name} artist={a} />)}
    </Shelf>
  );
}
