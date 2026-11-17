import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Brand, NavItems } from './Sidebar';
import DisplayModeToggle from './DisplayModeToggle';

/** Car View navigation: a drawer instead of the permanent 236px sidebar. */
export default function CarNavDrawer({ open, onClose }: { open: boolean; onClose(): void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.toggleAttribute('inert', !open);
    if (!open) return;
    ref.current?.querySelector<HTMLElement>('.nav-item')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <>
      <div className={`car-scrim${open ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside ref={ref} className={`car-drawer${open ? ' is-open' : ''}`} aria-label="Menu" aria-hidden={!open}>
        <div className="car-drawer__head">
          <Brand />
          <button className="icon-btn car-drawer__close" onClick={onClose} aria-label="Đóng menu"><X size={22} /></button>
        </div>
        <NavItems onNavigate={onClose} />
        <div className="car-drawer__foot">
          <span>Chế độ hiển thị</span>
          <DisplayModeToggle showLabels />
        </div>
      </aside>
    </>
  );
}
