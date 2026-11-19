import { useMemo, useRef, useState } from 'react';
import type { Artist } from '../types';
import { getCachedTracks } from '../services/youtube';
import { info } from '../recommend/identity';
import { normalize } from '../search/normalize';
import { useStoreImage } from '../lastfm/imageStore';
import { artistImages } from './artistImages';

/** A thumbnail of one of this artist's own YouTube uploads already in the local cache (no extra request). */
function cachedThumb(name: string): string | null {
  const key = normalize(name);
  for (const t of getCachedTracks()) {
    if (t.thumbnail && (info(t).artist === key || normalize(t.channel.replace(/\s*-\s*topic$/i, '')) === key)) return t.thumbnail;
  }
  return null;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const hueOf = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/**
 * Circular artist image, first that loads: the Last.fm photo when it's real › the artist's photo on
 * Wikimedia Commons (looked up when the avatar scrolls into view) or their YouTube channel picture
 * › a thumbnail of their own cached YouTube upload › a monogram. Never a broken or invented image.
 */
export default function ArtistAvatar({ artist, size }: { artist: Pick<Artist, 'name' | 'image'> & { mbid?: string | null }; size?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const req = useMemo(() => (artist.image ? null : { name: artist.name, mbid: artist.mbid ?? null }), [artist.image, artist.name, artist.mbid]);
  const photo = useStoreImage(artistImages, req, ref);
  const candidates = useMemo(
    () => [artist.image, photo?.url, photo === undefined ? null : cachedThumb(artist.name)].filter((u): u is string => Boolean(u)),
    [artist.image, artist.name, photo],
  );
  const src = candidates.find((u) => !failed.includes(u));
  const style = size ? { width: size, height: size } : undefined;
  if (src) {
    return (
      <span ref={ref} className="artist-avatar" style={style}>
        <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed((f) => [...f, src])}
          title={src === photo?.url && photo.credit ? `Ảnh: ${photo.credit.label}` : undefined} />
      </span>
    );
  }
  return (
    <span ref={ref} className="artist-avatar artist-avatar--mono" style={{ ...style, ['--h' as string]: hueOf(artist.name) }} aria-hidden="true">
      {initials(artist.name)}
    </span>
  );
}
