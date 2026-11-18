import BrandMark from './BrandMark';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, Library, ListMusic, Download, Settings, History, Timer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';

interface NavDef {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: boolean;
}

export const NAV_GROUPS: NavDef[][] = [
  [
    { to: '/', label: 'Trang chủ', icon: Home, end: true },
    { to: '/search', label: 'Tìm kiếm', icon: Search },
    { to: '/focus', label: 'Tập trung', icon: Timer },
  ],
  [
    { to: '/library', label: 'Thư viện', icon: Library },
    { to: '/playlists', label: 'Playlist', icon: ListMusic },
    { to: '/history', label: 'Lịch sử', icon: History },
    { to: '/downloads', label: 'Tải xuống', icon: Download, badge: true },
  ],
  [{ to: '/settings', label: 'Cài đặt', icon: Settings }],
];

/** The navigation list, shared by the desktop sidebar and the Car View drawer. */
export function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { unseenDownloads } = useLibrary();
  const location = useLocation();
  return (
    <nav className="nav" aria-label="Điều hướng chính">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="nav-divider" />}
          <div className="nav-group">
            {group.map(({ to, label, icon: Icon, end, badge }) => (
              <NavLink key={to} to={to} end={end} onClick={onNavigate} title={label}
                state={to === '/focus' ? { from: location.pathname + location.search } : undefined}
                className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}>
                <Icon size={20} strokeWidth={1.8} className="nav-item__icon" />
                <span className="nav-item__label">{label}</span>
                {badge && unseenDownloads > 0 && (
                  <span className="nav-badge" aria-label={`${unseenDownloads} lượt tải mới`}>{unseenDownloads > 99 ? '99+' : unseenDownloads}</span>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Brand() {
  return (
    <NavLink to="/" className="brand" aria-label="Trang chủ AmberTube">
      <BrandMark className="brand__mark" />
      <span className="brand__name">Amber<span className="brand__accent">Tube</span></span>
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <Brand />
      <NavItems />
    </aside>
  );
}
