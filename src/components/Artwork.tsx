import { useState } from 'react';
import type { Track } from '../types';
import SceneArt from './SceneArt';

/** Renders a track's thumbnail: real image for YouTube, illustrated scene for demo/local tracks or failed images. */
export default function Artwork({ track, className = '' }: { track: Track | null | undefined; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (track?.thumbnail && failed !== track.thumbnail) {
    return (
      <img className={`artwork ${className}`} src={track.thumbnail} alt="" loading="lazy" draggable={false}
        onError={() => setFailed(track.thumbnail!)} />
    );
  }
  return <SceneArt className={`artwork ${className}`} seed={track?.id || 'none'} {...(track?.art || { variant: 'city', hue: 250 })} />;
}
