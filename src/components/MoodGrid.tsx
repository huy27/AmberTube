import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Languages, Headphones, Waves, Target, BrainCircuit, CloudRain, Moon, Dumbbell, Smile, CloudDrizzle, Guitar } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MOODS } from '../data/demoCatalog';
import { useRecommendations } from '../recommend/RecommendationProvider';

const ICONS: Record<string, LucideIcon> = {
  lofi: Headphones,
  relaxing: Waves,
  focus: Target,
  'deep-work': BrainCircuit,
  rain: CloudRain,
  sleep: Moon,
  workout: Dumbbell,
  happy: Smile,
  sad: CloudDrizzle,
  acoustic: Guitar,
  english: Languages,
};

/** Mood & Discovery tiles — each runs a YouTube search for its mood. */
export default function MoodGrid() {
  const navigate = useNavigate();
  const { startMoodRadio } = useRecommendations();
  return (
    <div className="mood-grid">
      {MOODS.map((m) => {
        const Icon = ICONS[m.id] ?? Headphones;
        return (
          <div key={m.id} className="mood-wrap">
          <button
            className="mood"
            style={{ '--h': m.hue } as CSSProperties}
            onClick={() => navigate(`/search?q=${encodeURIComponent(m.query)}`)}
            aria-label={`${m.label}: tìm “${m.query}” trên YouTube`}
          >
            <span className="mood__icon"><Icon size={22} strokeWidth={1.8} /></span>
            <span className="mood__label">{m.label}</span>
          </button>
          <button className="mood__radio" onClick={() => void startMoodRadio(m.id)} aria-label={`Radio ${m.label}`} title={`Radio ${m.label}`}>
            <Radio size={15} />
          </button>
          </div>
        );
      })}
    </div>
  );
}
