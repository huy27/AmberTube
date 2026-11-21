import { useLocation } from 'react-router-dom';
import { usePlayer } from '../context/PlayerContext';

/** The video can be shown on desktop and (owner's request, 2026-11-21) in Car View, always opt-in via the toggle. */
export function useVideoAvailable() {
  const { track } = usePlayer();
  const { pathname } = useLocation();
  return pathname !== '/focus' && track?.provider === 'youtube';
}
