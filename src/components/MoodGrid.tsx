import { useRef, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Languages, Headphones, Waves, Target, Laptop, CloudRain, Moon, Dumbbell, Smile, CloudDrizzle, Guitar, ChevronLeft, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MOODS } from '../data/demoCatalog';
import { useRecommendations } from '../recommend/RecommendationProvider';

const ICONS: Record<string, LucideIcon> = {
  lofi: Headphones,
  relaxing: Waves,
  focus: Target,
  'deep-work': Laptop,
  rain: CloudRain,
  sleep: Moon,
  workout: Dumbbell,
  happy: Smile,
  sad: CloudDrizzle,
  acoustic: Guitar,
  english: Languages,
};

/** Mood & Discovery tiles — each runs a YouTube search for its mood; the round button starts its radio. */
export default function MoodGrid({ layout = 'grid' }: { layout?: 'grid' | 'row' }) {
  const navigate = useNavigate();
  const { startMoodRadio } = useRecommendations();
  return (
    <div className={`mood-grid${layout === 'row' ? ' mood-grid--row' : ''}`}>
      {MOODS.map((m) => {
        const Icon = ICONS[m.id] ?? Headphones;
        return (
          <div key={m.id} className="mood-wrap" style={{ '--h': m.hue } as CSSProperties}>
            <button className="mood" onClick={() => navigate(`/search?q=${encodeURIComponent(m.query)}`)} aria-label={`${m.label}: tìm “${m.query}” trên YouTube`}>
              <span className="mood__icon"><Icon size={22} strokeWidth={1.8} /></span>
              <span className="mood__label">{m.label}</span>
            </button>
            <button className="mood__radio" onClick={() => void startMoodRadio(m.id)} aria-label={`Radio ${m.label}`} title={`Radio ${m.label}`}>
              <Radio size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Home: one scrolling row with "Xem tất cả" (all moods on the Search page) and arrow buttons. */
export function MoodShelf({ first = false }: { first?: boolean }) {
  const navigate = useNavigate();
  const wrap = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const row = wrap.current?.querySelector<HTMLElement>('.mood-grid');
    row?.scrollBy({ left: dir * row.clientWidth * 0.8, behavior: 'smooth' });
  };
  return (
    <section className={`mood-shelf${first ? ' mood-shelf--first' : ''}`} aria-labelledby="sh-moods" ref={wrap}>
      <div className="mood-shelf__head">
        <h2 className="section-title mood-shelf__title" id="sh-moods">Tâm trạng &amp; Khám phá</h2>
        <div className="mood-shelf__nav">
          <button className="mood-shelf__all" onClick={() => navigate('/search')}>Xem tất cả</button>
          <button className="round-btn" onClick={() => scroll(-1)} aria-label="Cuộn trái"><ChevronLeft size={20} /></button>
          <button className="round-btn" onClick={() => scroll(1)} aria-label="Cuộn phải"><ChevronRight size={20} /></button>
        </div>
      </div>
      <MoodGrid layout="row" />
    </section>
  );
}
