import { useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Horizontally scrolling row (touch-swipe or arrow buttons). */
export default function Shelf({ title, subtitle, action, children, id }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  const row = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <section className="shelf" aria-labelledby={id}>
      <div className="shelf__head">
        <div>
          <h2 className="section-title shelf__title" id={id}>{title}</h2>
          {subtitle && <p className="shelf__sub">{subtitle}</p>}
        </div>
        <div className="shelf__nav">
          {action}
          <button className="icon-btn icon-btn--sm" onClick={() => scroll(-1)} aria-label="Cuộn trái"><ChevronLeft size={18} /></button>
          <button className="icon-btn icon-btn--sm" onClick={() => scroll(1)} aria-label="Cuộn phải"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="shelf__row" ref={row}>{children}</div>
    </section>
  );
}
