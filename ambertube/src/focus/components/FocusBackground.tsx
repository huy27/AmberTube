import { useMemo } from 'react';
import Artwork from '../../components/Artwork';
import { usePlayer } from '../../context/PlayerContext';
import type { BackgroundPreset } from '../settings';

/** Gradient + soft light blobs + a few CSS particles. Pure CSS animations (compositor-only, cheap). */
export default function FocusBackground({ preset, artworkBlur, particles }: { preset: BackgroundPreset; artworkBlur: boolean; particles: boolean }) {
  const { track } = usePlayer();
  const dots = useMemo(
    () => Array.from({ length: 18 }, (_, i) => ({
      left: `${(i * 53) % 100}%`,
      size: 2 + ((i * 7) % 4),
      delay: `${-((i * 3.7) % 24)}s`,
      dur: `${18 + ((i * 5) % 14)}s`,
      drift: `${((i % 5) - 2) * 18}px`,
    })),
    [],
  );
  return (
    <div className={`fm-bg fm-bg--${preset}`} aria-hidden="true">
      {artworkBlur && track && <div className="fm-bg__art" key={track.id}><Artwork track={track} /></div>}
      <div className="fm-bg__blob fm-bg__blob--1" />
      <div className="fm-bg__blob fm-bg__blob--2" />
      <div className="fm-bg__blob fm-bg__blob--3" />
      {particles && (
        <div className="fm-bg__particles">
          {dots.map((d, i) => (
            <i key={i} style={{ left: d.left, width: d.size, height: d.size, animationDelay: d.delay, animationDuration: d.dur, ['--drift' as string]: d.drift }} />
          ))}
        </div>
      )}
      <div className="fm-bg__vignette" />
    </div>
  );
}
