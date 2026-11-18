import { useEffect, useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { useUI } from '../context/UIContext';
import { useToast } from '../context/ToastContext';
import { useOpenFocus } from './useFocusNavigation';

export interface ShortcutDef {
  keys: string[];
  label: string;
}

/** Shown in Settings › Keyboard shortcuts. Keep in sync with the handler below. */
export const SHORTCUTS: ShortcutDef[] = [
  { keys: ['Space'], label: 'Phát / tạm dừng' },
  { keys: ['Ctrl', '→'], label: 'Bài tiếp theo' },
  { keys: ['Ctrl', '←'], label: 'Bài trước' },
  { keys: ['↑'], label: 'Tăng âm lượng' },
  { keys: ['↓'], label: 'Giảm âm lượng' },
  { keys: ['M'], label: 'Tắt / bật tiếng' },
  { keys: ['S'], label: 'Bật / tắt trộn bài' },
  { keys: ['R'], label: 'Lặp lại: tắt → tất cả → một bài' },
  { keys: ['L'], label: 'Lời bài hát' },
  { keys: ['Q'], label: 'Hàng đợi' },
  { keys: ['F'], label: 'Chế độ Tập trung' },
  { keys: ['/'], label: 'Tìm kiếm (hoặc Ctrl + K)' },
  { keys: ['Esc'], label: 'Đóng bảng bên' },
];

/** True when the key press belongs to a text field (or a control that uses the key itself). */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable) return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(type);
  }
  return false;
}

const VOLUME_STEP = 5;

export function useKeyboardShortcuts(): void {
  const player = usePlayer();
  const ui = useUI();
  const toast = useToast();
  const openFocus = useOpenFocus();
  const ref = useRef({ player, ui, toast, openFocus });
  ref.current = { player, ui, toast, openFocus };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.isComposing) return;
      const target = document.activeElement;
      if (isTypingTarget(target)) return;
      const { player: p, ui: u, toast: t, openFocus } = ref.current;
      const key = e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      // Space/Enter on a focused button or menu item must keep activating that control.
      const onControl = !!target && (target.tagName === 'BUTTON' || target.tagName === 'A' || target.getAttribute('role') === 'button' || target.getAttribute('role') === 'menuitem' || target.getAttribute('role') === 'menuitemradio' || target.getAttribute('role') === 'switch');

      if (key === ' ' && !ctrl) {
        if (onControl || !p.track) return;
        e.preventDefault();
        p.togglePlay();
      } else if (e.ctrlKey && key === 'ArrowRight') {
        e.preventDefault();
        p.next();
      } else if (e.ctrlKey && key === 'ArrowLeft') {
        e.preventDefault();
        p.prev();
      } else if (ctrl) {
        return;
      } else if (key === 'ArrowUp' || key === 'ArrowDown') {
        if (target?.getAttribute('role') === 'menu' || target?.closest('[role="menu"],[role="listbox"],.queue__list')) return;
        e.preventDefault();
        p.changeVolume(key === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP);
      } else if (key === 'm' || key === 'M') {
        p.toggleMute();
        t(p.muted ? 'Đã bật tiếng' : 'Đã tắt tiếng', { duration: 1200 });
      } else if (key === 's' || key === 'S') {
        p.toggleShuffle();
        t(p.shuffle ? 'Đã tắt trộn bài' : 'Đã bật trộn bài', { duration: 1200 });
      } else if (key === 'r' || key === 'R') {
        p.cycleRepeat();
        t(`Lặp lại: ${p.repeat === 'off' ? 'tất cả' : p.repeat === 'all' ? 'một bài' : 'tắt'}`, { duration: 1200 });
      } else if (key === 'l' || key === 'L') {
        u.togglePanel('lyrics');
      } else if (key === 'q' || key === 'Q') {
        u.togglePanel('queue');
      } else if (key === 'f' || key === 'F') {
        openFocus();
      } else if (key === 'Escape') {
        if (u.panel) u.setPanel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
