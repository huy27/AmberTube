import { useState, type FormEvent } from 'react';
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react';
import { useFocus, useFocusClock, formatClock, PHASE_LABEL } from '../PomodoroController';

const PRESETS = [15, 25, 45, 50, 60];
const R = 136;
const C = 2 * Math.PI * R;

export default function FocusTimer() {
  const f = useFocus();
  const { remainingMs, progress } = useFocusClock();
  const [custom, setCustom] = useState(false);
  const [customMin, setCustomMin] = useState(String(f.settings.focusMin));
  const { timer, settings } = f;
  const canPickDuration = timer.phase === 'focus' && timer.status === 'idle';
  const isCustom = !PRESETS.includes(settings.focusMin);

  const submitCustom = (e: FormEvent) => {
    e.preventDefault();
    const n = Math.round(Number(customMin));
    if (n >= 1 && n <= 180) {
      f.setFocusMinutes(n);
      setCustom(false);
    }
  };

  const primary =
    timer.status === 'running' ? { label: 'Tạm dừng', icon: <Pause size={20} fill="currentColor" strokeWidth={0} /> }
      : timer.status === 'paused' ? { label: 'Tiếp tục', icon: <Play size={20} fill="currentColor" strokeWidth={0} /> }
        : { label: 'Bắt đầu', icon: <Play size={20} fill="currentColor" strokeWidth={0} /> };

  return (
    <section className={`fm-timer fm-timer--${timer.phase} fm-timer--${timer.status}`} aria-label="Đồng hồ tập trung">
      <div className="fm-ring">
        <svg viewBox="0 0 300 300" aria-hidden="true">
          <defs>
            <linearGradient id="fm-ring-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffd27a" />
              <stop offset="1" stopColor="#ff9f1c" />
            </linearGradient>
          </defs>
          <circle className="fm-ring__track" cx="150" cy="150" r={R} />
          <circle
            className="fm-ring__progress"
            cx="150"
            cy="150"
            r={R}
            strokeDasharray={C}
            strokeDashoffset={C * progress}
            transform="rotate(-90 150 150)"
          />
        </svg>
        <div className="fm-ring__center">
          <div className="fm-ring__time" role="timer" aria-live="off" aria-label={`Còn lại ${formatClock(remainingMs)}`}>{formatClock(remainingMs)}</div>
          <div className="fm-ring__label">{PHASE_LABEL[timer.phase]}</div>
          <div className="fm-ring__cycle" aria-label={`${timer.cycleCount} trên ${settings.longInterval} phiên tới nghỉ dài`}>
            {Array.from({ length: settings.longInterval }, (_, i) => (
              <i key={i} className={i < timer.cycleCount || timer.phase === 'long' ? 'is-done' : i === timer.cycleCount && timer.phase === 'focus' ? 'is-now' : ''} />
            ))}
          </div>
        </div>
      </div>

      <div className="fm-durations" role="radiogroup" aria-label="Thời lượng tập trung">
        {PRESETS.map((m) => (
          <button key={m} role="radio" aria-checked={settings.focusMin === m} disabled={!canPickDuration}
            className={`fm-chip${settings.focusMin === m ? ' is-active' : ''}`} onClick={() => { f.setFocusMinutes(m); setCustom(false); }}>
            {m}′
          </button>
        ))}
        {custom ? (
          <form className="fm-custom" onSubmit={submitCustom}>
            <input type="number" min={1} max={180} value={customMin} onChange={(e) => setCustomMin(e.target.value)} autoFocus aria-label="Số phút tùy chỉnh"
              onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setCustom(false))} />
            <button className="fm-chip is-active" type="submit">Đặt</button>
          </form>
        ) : (
          <button role="radio" aria-checked={isCustom} disabled={!canPickDuration} className={`fm-chip${isCustom ? ' is-active' : ''}`}
            onClick={() => { setCustomMin(String(settings.focusMin)); setCustom(true); }}>
            {isCustom ? `${settings.focusMin}′` : 'Tùy chỉnh'}
          </button>
        )}
      </div>

      <div className="fm-timer__actions">
        <button className="fm-btn fm-btn--secondary" onClick={f.reset} disabled={timer.status === 'idle' && timer.remainingMs === timer.durationMs}
          aria-label="Đặt lại đồng hồ (R)" title="Đặt lại (R)">
          <RotateCcw size={18} />
        </button>
        <button className="fm-btn fm-btn--primary" onClick={f.toggle} aria-label={`${primary.label} đồng hồ (P)`} title={`${primary.label} (P)`}>
          {primary.icon}<span>{primary.label}</span>
        </button>
        <button className="fm-btn fm-btn--secondary" onClick={f.skip} aria-label={`Bỏ qua ${PHASE_LABEL[timer.phase].toLowerCase()}`} title="Bỏ qua phiên này">
          <SkipForward size={18} />
        </button>
      </div>
    </section>
  );
}
