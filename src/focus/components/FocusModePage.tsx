import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import FocusHeader from './FocusHeader';
import FocusArtwork from './FocusArtwork';
import FocusTimer from './FocusTimer';
import FocusMusicPlayer from './FocusMusicPlayer';
import AmbientSoundMixer from './AmbientSoundMixer';
import FocusStatistics from './FocusStatistics';
import FocusSettings from './FocusSettings';
import SessionCompletionDialog from './SessionCompletionDialog';
import FocusBackground from './FocusBackground';
import { useFocus } from '../PomodoroController';
import { useFocusShortcuts } from '../useFocusShortcuts';
import { useAmbientEngine } from '../useAmbientEngine';
import { useUI } from '../../context/UIContext';

type Drawer = 'mixer' | 'stats' | null;

/** Full-screen, distraction-free workspace. Reuses the global player, queue and Pomodoro controller. */
export default function FocusModePage() {
  const f = useFocus();
  const ui = useUI();
  const navigate = useNavigate();
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawer, setDrawer] = useState<Drawer>(null);
  useAmbientEngine(f.ambient);

  const exit = useCallback(() => {
    if (ui.isFullscreen) ui.toggleFullscreen();
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from !== '/focus' ? from : '/', { replace: false });
  }, [navigate, location.state, ui]);

  const onEscape = useCallback(() => {
    if (f.completion) f.dismissCompletion();
    else if (settingsOpen) setSettingsOpen(false);
    else if (drawer) setDrawer(null);
    else exit();
  }, [f, settingsOpen, drawer, exit]);

  useFocusShortcuts(onEscape);

  return (
    <div className={`fm fm--${f.timer.phase}`}>
      <FocusBackground preset={f.settings.background} artworkBlur={f.settings.artworkBlur} particles={f.settings.particles} />
      <FocusHeader
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleMixer={() => setDrawer((d) => (d === 'mixer' ? null : 'mixer'))}
        onToggleStats={() => setDrawer((d) => (d === 'stats' ? null : 'stats'))}
        mixerOpen={drawer === 'mixer'}
        statsOpen={drawer === 'stats'}
        onExit={exit}
      />

      <main className="fm-main">
        <aside className={`fm-side fm-side--left${drawer === 'mixer' ? ' is-open' : ''}`}>
          <button className="icon-btn icon-btn--sm fm-side__close" onClick={() => setDrawer(null)} aria-label="Đóng"><X size={16} /></button>
          <AmbientSoundMixer />
        </aside>
        <div className="fm-stage">
          <FocusArtwork />
          <FocusTimer />
        </div>
        <aside className={`fm-side fm-side--right${drawer === 'stats' ? ' is-open' : ''}`}>
          <button className="icon-btn icon-btn--sm fm-side__close" onClick={() => setDrawer(null)} aria-label="Đóng"><X size={16} /></button>
          <FocusStatistics />
        </aside>
      </main>

      <FocusMusicPlayer />
      <SessionCompletionDialog />
      <FocusSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
