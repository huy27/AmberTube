import { usePlayer } from '../context/PlayerContext';

/**
 * Off-screen host for the YouTube IFrame player: audio only, nothing is shown in the UI.
 * Always mounted so playback continues across page changes.
 */
export default function YouTubeHost() {
  const { ytHostRef } = usePlayer();
  return <div className="yt-host" ref={ytHostRef} aria-hidden="true" />;
}
