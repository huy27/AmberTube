import { useLocation } from 'react-router-dom';
import { usePlayer } from '../context/PlayerContext';
import { useDisplayMode } from '../context/DisplayModeContext';

/** The video can be shown on the desktop layout only (never in Car View: no video while driving). */
export function useVideoAvailable() {
  const { track } = usePlayer();
  const { compact } = useDisplayMode();
  const { pathname } = useLocation();
  return !compact && pathname !== '/focus' && track?.provider === 'youtube';
}
