import ProgressBar, { useProgress } from '../../components/ProgressBar';
import Visualizer from '../../components/Visualizer';
import { TransportControls, VolumeControl } from '../../components/PlayerBar';
import { usePlayer } from '../../context/PlayerContext';
import { useLibrary } from '../../context/LibraryContext';
import { formatTime } from '../../services/format';

/** Compact controls for the global AmberTube player (same engine, same queue). */
export default function FocusMusicPlayer() {
  const p = usePlayer();
  const { settings } = useLibrary();
  const { time, dur, progress } = useProgress();
  return (
    <footer className="fm-player" aria-label="Điều khiển nhạc">
      <div className="fm-player__progress">
        <span>{formatTime(time)}</span>
        <ProgressBar variant="inline" />
        <span>{p.track?.isLive ? 'LIVE' : formatTime(dur)}</span>
      </div>
      <div className="fm-player__row">
        <div className="fm-player__side">
          <Visualizer variant="compact" mode={settings.visualizer} playing={p.isPlaying} getAnalyser={p.getAnalyser} progress={progress} seed={p.track?.id || 'idle'} />
        </div>
        <TransportControls />
        <div className="fm-player__side fm-player__side--right"><VolumeControl /></div>
      </div>
    </footer>
  );
}
