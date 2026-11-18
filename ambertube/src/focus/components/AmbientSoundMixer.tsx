import type { CSSProperties } from 'react';
import { CloudRain, Waves, Trees, Flame, Wind, Coffee, AudioLines, Volume2, VolumeX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useFocus } from '../PomodoroController';
import { AMBIENT_IDS, type AmbientId } from '../settings';

export const AMBIENT_META: Record<AmbientId, { label: string; icon: LucideIcon }> = {
  rain: { label: 'Mưa', icon: CloudRain },
  ocean: { label: 'Sóng biển', icon: Waves },
  forest: { label: 'Rừng', icon: Trees },
  fire: { label: 'Lửa bập bùng', icon: Flame },
  wind: { label: 'Gió', icon: Wind },
  cafe: { label: 'Quán cà phê', icon: Coffee },
  white: { label: 'Tiếng ồn trắng', icon: AudioLines },
};

export default function AmbientSoundMixer({ compact = false }: { compact?: boolean }) {
  const { ambient, updateAmbient } = useFocus();
  const activeCount = AMBIENT_IDS.filter((id) => ambient.channels[id].on).length;

  const setChannel = (id: AmbientId, patch: Partial<{ on: boolean; volume: number }>) =>
    updateAmbient((a) => ({ ...a, channels: { ...a.channels, [id]: { ...a.channels[id], ...patch } } }));

  return (
    <section className={`fm-card fm-mixer${compact ? ' fm-mixer--compact' : ''}`} aria-label="Âm thanh nền">
      <header className="fm-card__head">
        <div>
          <h2>Âm thanh nền</h2>
          <p>{activeCount ? `${activeCount} âm thanh đang bật` : 'Trộn nhiều âm thanh cùng lúc'}</p>
        </div>
        <button className={`icon-btn icon-btn--sm${ambient.muted ? ' is-active' : ''}`} onClick={() => updateAmbient((a) => ({ ...a, muted: !a.muted }))}
          aria-pressed={ambient.muted} aria-label={ambient.muted ? 'Bật tiếng âm thanh nền' : 'Tắt tiếng âm thanh nền'} title={ambient.muted ? 'Bật tiếng' : 'Tắt tiếng'}>
          {ambient.muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
      </header>

      <label className="fm-mixer__master">
        <span>Tổng</span>
        <input type="range" className="slider" min={0} max={100} value={ambient.master} disabled={ambient.muted}
          onChange={(e) => updateAmbient((a) => ({ ...a, master: Number(e.target.value) }))}
          style={{ '--p': `${ambient.master}%` } as CSSProperties} aria-label="Âm lượng tổng của âm thanh nền" />
      </label>

      <ul className="fm-mixer__list">
        {AMBIENT_IDS.map((id) => {
          const { label, icon: Icon } = AMBIENT_META[id];
          const ch = ambient.channels[id];
          return (
            <li key={id} className={`fm-sound${ch.on ? ' is-on' : ''}`}>
              <button className="fm-sound__toggle" onClick={() => setChannel(id, { on: !ch.on, volume: ch.volume || 50 })} aria-pressed={ch.on}
                aria-label={`${ch.on ? 'Tắt' : 'Bật'} ${label}`} title={label}>
                <Icon size={18} />
              </button>
              <span className="fm-sound__label">{label}</span>
              <input type="range" className="slider" min={0} max={100} value={ch.volume}
                onChange={(e) => setChannel(id, { volume: Number(e.target.value), on: Number(e.target.value) > 0 })}
                style={{ '--p': `${ch.volume}%` } as CSSProperties} aria-label={`Âm lượng ${label}`} aria-valuetext={`${ch.volume}%`} />
            </li>
          );
        })}
      </ul>
      {!compact && <p className="fm-card__note">Âm thanh được tổng hợp trực tiếp trên máy, không cần tải file.</p>}
    </section>
  );
}
