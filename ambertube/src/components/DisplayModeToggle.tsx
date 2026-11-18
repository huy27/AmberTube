import { Monitor, Car } from 'lucide-react';
import { useDisplayMode, type DisplayMode } from '../context/DisplayModeContext';

const OPTIONS: { mode: DisplayMode; label: string; icon: typeof Monitor }[] = [
  { mode: 'desktop', label: 'Chế độ máy tính', icon: Monitor },
  { mode: 'car', label: 'Chế độ Car View', icon: Car },
];

/** Compact segmented switch between Desktop and Car View (no reload, URL unchanged). */
export default function DisplayModeToggle({ showLabels = false }: { showLabels?: boolean }) {
  const { mode, setMode } = useDisplayMode();
  return (
    <div className={`mode-toggle${showLabels ? ' mode-toggle--labels' : ''}`} role="radiogroup" aria-label="Chế độ hiển thị">
      {OPTIONS.map(({ mode: m, label, icon: Icon }) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} className={`mode-toggle__btn${mode === m ? ' is-active' : ''}`}
          onClick={() => setMode(m)} aria-label={label} title={label}>
          <Icon size={18} />
          {showLabels && <span>{m === 'car' ? 'Car View' : 'Máy tính'}</span>}
        </button>
      ))}
    </div>
  );
}
