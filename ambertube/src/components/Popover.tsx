import type React from 'react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useDismiss } from '../hooks/useDismiss';

interface Props {
  /** button content */
  trigger: ReactNode;
  label: string;
  title?: string;
  active?: boolean;
  className?: string;
  align?: 'left' | 'right' | 'center';
  children: (close: () => void) => ReactNode;
}

/** A button that opens a small menu above it (used by the player bar). */
export default function Popover({ trigger, label, title, active, className = '', align = 'center', children }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, root, close);

  useEffect(() => {
    if (!open) return;
    const first = panel.current?.querySelector<HTMLElement>('[aria-checked="true"], button, [tabindex="0"]');
    first?.focus();
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    e.stopPropagation();
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div className={`popover ${className}`} ref={root}>
      <button
        type="button"
        className={`icon-btn popover__trigger${active ? ' is-active' : ''}${open ? ' is-open' : ''}`}
        aria-label={label}
        title={title ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div id={id} ref={panel} className={`popover__panel popover__panel--${align}`} role="menu" aria-label={label} onKeyDown={onKeyDown}>
          {children(close)}
        </div>
      )}
    </div>
  );
}
