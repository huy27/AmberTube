import { useEffect, useRef, type ReactNode } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import { useFocus } from '../PomodoroController';
import { useToast } from '../../context/ToastContext';
import type { BackgroundPreset, FocusSettings as Settings } from '../settings';
import AmbientSoundMixer from './AmbientSoundMixer';
import { FOCUS_SHORTCUTS } from '../useFocusShortcuts';

function Stepper({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange(v: number): void }) {
  return (
    <div className="fs-row">
      <span className="fs-row__label">{label}</span>
      <div className="fs-stepper">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Giảm ${label}`}><Minus size={14} /></button>
        <input type="number" min={min} max={max} value={value} aria-label={label}
          onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n)))); }} />
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Tăng ${label}`}><Plus size={14} /></button>
        <span className="fs-stepper__unit">{unit}</span>
      </div>
    </div>
  );
}

function Switch({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <div className="fs-row">
      <span className="fs-row__label">{label}{desc && <small>{desc}</small>}</span>
      <button role="switch" aria-checked={checked} aria-label={label} className={`toggle${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}>
        <span className="toggle__knob" />
      </button>
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="fs-section"><h3>{title}</h3>{children}</section>
);

const PRESETS: { id: BackgroundPreset; name: string; desc: string }[] = [
  { id: 'amber', name: 'Amber Glow', desc: 'Cam ấm & than chì' },
  { id: 'midnight', name: 'Midnight', desc: 'Đen sâu & xanh đêm' },
  { id: 'forest', name: 'Forest', desc: 'Xanh rừng & tông đất' },
];

export default function FocusSettings({ open, onClose }: { open: boolean; onClose(): void }) {
  const f = useFocus();
  const toast = useToast();
  const s = f.settings;
  const panel = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<Settings>) => f.updateSettings(patch);
  const running = f.timer.status !== 'idle';

  useEffect(() => {
    // keep the closed drawer out of the tab order / accessibility tree
    panel.current?.toggleAttribute('inert', !open);
    if (open) panel.current?.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true });
  }, [open]);

  const toggleDesktop = async (v: boolean) => {
    if (!v) return set({ desktopNotification: false });
    if (f.notificationPermission === 'unsupported') return toast('Trình duyệt này không hỗ trợ thông báo trên màn hình.', { type: 'warning' });
    const ok = f.notificationPermission === 'granted' || (await f.requestNotificationPermission());
    if (ok) set({ desktopNotification: true });
    else toast('Trình duyệt đã chặn thông báo. Hãy cho phép trong cài đặt trang web.', { type: 'warning', duration: 5000 });
  };

  return (
    <>
      <div className={`fs-scrim${open ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside ref={panel} className={`fs-drawer${open ? ' is-open' : ''}`} aria-hidden={!open} aria-label="Cài đặt Tập trung" role="dialog" aria-modal="true">
        <header className="fs-drawer__head">
          <h2>Cài đặt Tập trung</h2>
          <button className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Đóng cài đặt"><X size={18} /></button>
        </header>
        <div className="fs-drawer__body">
          <Section title="Thời lượng">
            <Stepper label="Tập trung" value={s.focusMin} min={1} max={180} unit="phút" onChange={(v) => set({ focusMin: v })} />
            <Stepper label="Nghỉ ngắn" value={s.shortMin} min={1} max={60} unit="phút" onChange={(v) => set({ shortMin: v })} />
            <Stepper label="Nghỉ dài" value={s.longMin} min={1} max={90} unit="phút" onChange={(v) => set({ longMin: v })} />
            <Stepper label="Nghỉ dài sau" value={s.longInterval} min={2} max={12} unit="phiên" onChange={(v) => set({ longInterval: v })} />
            {running && <p className="fs-note">Thời lượng mới sẽ áp dụng từ phiên tiếp theo.</p>}
          </Section>

          <Section title="Tự động">
            <Switch label="Tự bắt đầu giờ nghỉ" checked={s.autoStartBreaks} onChange={(v) => set({ autoStartBreaks: v })} />
            <Switch label="Tự bắt đầu phiên tập trung" checked={s.autoStartFocus} onChange={(v) => set({ autoStartFocus: v })} />
            <Switch label="Tạm dừng nhạc khi nghỉ" desc="Phát lại khi vào phiên tập trung" checked={s.pauseMusicOnBreak} onChange={(v) => set({ pauseMusicOnBreak: v })} />
          </Section>

          <Section title="Thông báo">
            <Switch label="Âm báo khi hết phiên" checked={s.soundNotification} onChange={(v) => set({ soundNotification: v })} />
            <Switch label="Thông báo trên màn hình" desc={f.notificationPermission === 'denied' ? 'Trình duyệt đang chặn thông báo' : undefined}
              checked={s.desktopNotification && f.notificationPermission === 'granted'} onChange={(v) => void toggleDesktop(v)} />
          </Section>

          <Section title="Mục tiêu mỗi ngày">
            <Stepper label="Số phiên" value={s.dailyGoal} min={1} max={24} unit="phiên" onChange={(v) => set({ dailyGoal: v })} />
          </Section>

          <Section title="Hình nền">
            <div className="fs-presets" role="radiogroup" aria-label="Kiểu hình nền">
              {PRESETS.map((p) => (
                <button key={p.id} role="radio" aria-checked={s.background === p.id} className={`fs-preset fs-preset--${p.id}${s.background === p.id ? ' is-active' : ''}`} onClick={() => set({ background: p.id })}>
                  <span className="fs-preset__swatch" />
                  <span className="fs-preset__name">{p.name}</span>
                  <span className="fs-preset__desc">{p.desc}</span>
                </button>
              ))}
            </div>
            <Switch label="Làm mờ theo ảnh bìa" checked={s.artworkBlur} onChange={(v) => set({ artworkBlur: v })} />
            <Switch label="Hạt sáng chuyển động" checked={s.particles} onChange={(v) => set({ particles: v })} />
          </Section>

          <Section title="Âm thanh nền">
            <AmbientSoundMixer compact />
          </Section>

          <Section title="Phím tắt">
            <table className="shortcuts">
              <tbody>
                {FOCUS_SHORTCUTS.map((k) => (
                  <tr key={k.label}><td>{k.label}</td><td><kbd>{k.key}</kbd></td></tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      </aside>
    </>
  );
}
