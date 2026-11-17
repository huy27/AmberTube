import { useEffect, useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { useUI } from '../context/UIContext';
import { isTypingTarget } from '../hooks/useKeyboardShortcuts';
import { useFocus } from './PomodoroController';

export const FOCUS_SHORTCUTS = [
  { key: 'Space', label: 'Phát / tạm dừng nhạc' },
  { key: 'P', label: 'Bắt đầu / tạm dừng đồng hồ' },
  { key: 'R', label: 'Đặt lại đồng hồ' },
  { key: 'N', label: 'Bài tiếp theo' },
  { key: 'M', label: 'Tắt / bật tiếng nhạc' },
  { key: 'F', label: 'Toàn màn hình' },
  { key: 'Esc', label: 'Thoát chế độ Tập trung' },
];

/** Keyboard shortcuts that only exist inside Focus mode. */
export function useFocusShortcuts(onEscape: () => void): void {
  const player = usePlayer();
  const focus = useFocus();
  const ui = useUI();
  const toast = useToast();
  const ref = useRef({ player, focus, ui, toast, onEscape });
  ref.current = { player, focus, ui, toast, onEscape };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const target = document.activeElement;
      if (isTypingTarget(target)) return;
      const { player: p, focus: f, ui: u, toast: t, onEscape: esc } = ref.current;
      const onControl = !!target && (target.tagName === 'BUTTON' || target.getAttribute('role') === 'switch' || target.getAttribute('role') === 'radio');
      switch (e.key) {
        case ' ':
          if (onControl) return;
          e.preventDefault();
          if (p.track) p.togglePlay();
          break;
        case 'p': case 'P':
          f.toggle();
          break;
        case 'r': case 'R':
          f.reset();
          t('Đã đặt lại đồng hồ', { duration: 1200 });
          break;
        case 'n': case 'N':
          p.next();
          break;
        case 'm': case 'M':
          p.toggleMute();
          t(p.muted ? 'Đã bật tiếng' : 'Đã tắt tiếng', { duration: 1200 });
          break;
        case 'f': case 'F':
          u.toggleFullscreen();
          break;
        case 'Escape':
          e.preventDefault();
          esc();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
