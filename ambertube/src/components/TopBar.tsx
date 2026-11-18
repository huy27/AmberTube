import { useCallback, useState } from 'react';
import { Menu, User } from 'lucide-react';
import SearchBox from './SearchBox';
import FocusTimerPill from './FocusTimerPill';
import DisplayModeToggle from './DisplayModeToggle';
import CarNavDrawer from './CarNavDrawer';
import { Brand } from './Sidebar';
import { useDisplayMode } from '../context/DisplayModeContext';

export default function TopBar() {
  const { compact } = useDisplayMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const car = compact;
  return (
    <header className="topbar">
      {car && (
        <>
          <button className="icon-btn topbar__menu" onClick={() => setMenuOpen(true)} aria-label="Mở menu" aria-expanded={menuOpen}><Menu size={24} /></button>
          <div className="topbar__brand"><Brand /></div>
        </>
      )}
      <SearchBox />
      <FocusTimerPill />
      <DisplayModeToggle />
      {!car && (
        <button className="avatar" aria-label="Tài khoản" title="Tài khoản">
          <User size={20} fill="currentColor" strokeWidth={0} />
        </button>
      )}
      {car && <CarNavDrawer open={menuOpen} onClose={closeMenu} />}
    </header>
  );
}
