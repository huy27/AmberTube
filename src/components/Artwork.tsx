import { useState } from 'react';
import type { Track } from '../types';
import SceneArt from './SceneArt';

/** Renders a track's thumbnail: real image for YouTube, illustrated scene for demo/local tracks or failed images. */
/**
 * `small`: list thumbnails (72×40 / 96×54). On standard-density screens YouTube's 120×90 `default.jpg`
 * is enough (~4 KB instead of ~15 KB for the 320×180 one); hi-DPI screens keep the larger image.
 */
function sized(url: string, small: boolean): string {
  if (!small || (typeof window !== 'undefined' && window.devicePixelRatio > 1.5)) return url;
  return url.replace(/^(https:\/\/i\.ytimg\.com\/vi\/[^/]+\/)(?:mq|hq|sd)default\.jpg$/, '$1default.jpg');
}

export default function Artwork({ track, className = '', small = false }: { track: Track | null | undefined; className?: string; small?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (track?.thumbnail && failed !== track.thumbnail) {
    return (
      <img className={`artwork ${className}`} src={sized(track.thumbnail, small)} alt="" loading="lazy" decoding="async" draggable={false}
        onError={() => setFailed(track.thumbnail!)} />
    );
  }
  return <SceneArt className={`artwork ${className}`} seed={track?.id || 'none'} {...(track?.art || { variant: 'city', hue: 250 })} />;
}
