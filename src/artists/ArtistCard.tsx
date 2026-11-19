import { Link } from 'react-router-dom';
import type { Artist } from '../types';
import ArtistAvatar from './ArtistAvatar';
import { formatCount } from '../services/format';

export const artistPath = (a: Pick<Artist, 'name'>) => `/artist/${encodeURIComponent(a.name)}`;

/** Ranked artist: circular image, position, name and Last.fm listeners (when known). */
export default function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link to={artistPath(artist)} state={{ artist }} className="artist-card" aria-label={`Hạng ${artist.rank}: ${artist.name}`}>
      <span className="artist-card__art">
        <ArtistAvatar artist={artist} />
        <span className="artist-card__rank" aria-hidden="true">{artist.rank}</span>
      </span>
      <span className="artist-card__name" title={artist.name}>{artist.name}</span>
      {artist.listeners != null && <span className="artist-card__meta">{formatCount(artist.listeners)} người nghe</span>}
    </Link>
  );
}

export function ArtistCardSkeleton() {
  return (
    <div className="artist-card artist-card--sk" aria-hidden="true">
      <span className="artist-card__art sk" />
      <span className="sk sk--line" style={{ width: '70%', margin: '0 auto' }} />
    </div>
  );
}
