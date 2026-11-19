import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CloudOff, LogIn, LogOut, RefreshCw, Settings2, User, AlertTriangle } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useSync, type SyncStatus } from '../sync/SyncProvider';
import { useDismiss } from '../hooks/useDismiss';
import { useToast } from '../context/ToastContext';
import { formatClock } from '../services/format';

export function syncLabel(status: SyncStatus, lastSync: number | null, pending: number): string {
  switch (status) {
    case 'syncing': return 'Đang đồng bộ…';
    case 'synced': return pending ? `Còn ${pending} thay đổi chờ gửi` : `Đã đồng bộ${lastSync ? ` lúc ${formatClock(lastSync)}` : ''}`;
    case 'offline': return pending ? `Ngoại tuyến · ${pending} thay đổi sẽ gửi khi có mạng` : 'Ngoại tuyến · sẽ đồng bộ khi có mạng';
    case 'error': return 'Lỗi đồng bộ · sẽ thử lại';
    case 'expired': return 'Phiên đăng nhập đã hết hạn';
    default: return 'Chưa đồng bộ';
  }
}

export function UserAvatar({ name, avatar, size = 32 }: { name: string; avatar: string | null; size?: number }) {
  const [bad, setBad] = useState(false);
  if (avatar && !bad) return <img className="user-avatar" src={avatar} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBad(true)} />;
  return <span className="user-avatar user-avatar--mono" style={{ width: size, height: size }} aria-hidden="true">{(name.trim()[0] || '?').toUpperCase()}</span>;
}

/** Top bar: "Khách · Đăng nhập" for guests; the account avatar with a sync dot + menu when signed in. */
export default function AccountButton({ compact = false }: { compact?: boolean }) {
  const auth = useAuth();
  const sync = useSync();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(open, root, () => { setOpen(false); setConfirmOut(null); });

  if (auth.status === 'disabled') {
    // accounts not configured: the original (inactive) avatar
    return compact ? null : <button className="avatar" aria-label="Tài khoản" title="Tài khoản"><User size={20} fill="currentColor" strokeWidth={0} /></button>;
  }
  if (auth.status === 'loading') return <span className="avatar sk" aria-label="Đang tải tài khoản" />;
  if (auth.status === 'guest') {
    return (
      <div className="account account--guest">
        {!compact && <span className="guest-chip" title="Dữ liệu chỉ lưu trên máy này">Khách</span>}
        <button className={compact ? 'icon-btn account__login-icon' : 'btn btn--sm btn--outline account__login'} onClick={() => auth.openDialog('signin')} aria-label="Đăng nhập">
          <LogIn size={compact ? 22 : 16} />{!compact && 'Đăng nhập'}
        </button>
      </div>
    );
  }

  // the session can also be found expired by the sync (server said 401 and the refresh failed)
  const expired = auth.status === 'expired' || sync.status === 'expired';
  const status: SyncStatus = expired ? 'expired' : sync.status;
  const name = auth.user?.name ?? 'Tài khoản';

  const doSignOut = async (force: boolean) => {
    setBusy(true);
    try {
      if (!force && !expired) {
        const clean = await sync.flush(4000);
        if (!clean) {
          setConfirmOut(sync.pending || 1);
          return;
        }
      }
      await auth.signOut();
      setOpen(false);
      setConfirmOut(null);
      toast('Đã đăng xuất. Bạn đang dùng AmberTube ở chế độ khách.', { type: 'success' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account" ref={root}>
      <button className={`account__btn account__btn--${status}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        aria-label={`Tài khoản: ${name}. ${syncLabel(status, sync.lastSync, sync.pending)}`} title={syncLabel(status, sync.lastSync, sync.pending)}>
        <UserAvatar name={name} avatar={auth.user?.avatar ?? null} size={compact ? 36 : 32} />
        <span className={`sync-dot sync-dot--${status}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu account__menu" role="menu">
          <div className="account__head">
            <UserAvatar name={name} avatar={auth.user?.avatar ?? null} size={40} />
            <div className="account__id">
              <strong>{expired ? 'Phiên đã hết hạn' : name}</strong>
              {auth.user?.email && <span>{auth.user.email}</span>}
            </div>
          </div>
          <div className={`account__sync account__sync--${status}`} role="status">
            {status === 'offline' ? <CloudOff size={14} /> : status === 'error' || status === 'expired' ? <AlertTriangle size={14} /> : <RefreshCw size={14} className={status === 'syncing' ? 'spin' : ''} />}
            <span>{syncLabel(status, sync.lastSync, sync.pending)}</span>
          </div>
          <div className="menu__sep" />
          {confirmOut !== null ? (
            <div className="account__confirm">
              <p>Còn {confirmOut} thay đổi chưa gửi lên tài khoản (đang ngoại tuyến?). Đăng xuất bây giờ sẽ bỏ chúng trên máy này.</p>
              <div className="account__confirm-actions">
                <button className="btn btn--sm btn--ghost" onClick={() => setConfirmOut(null)}>Ở lại</button>
                <button className="btn btn--sm btn--danger" disabled={busy} onClick={() => void doSignOut(true)}>Vẫn đăng xuất</button>
              </div>
            </div>
          ) : (
            <>
              {expired && <button className="menu__item menu__item--accent" role="menuitem" onClick={() => { setOpen(false); auth.openDialog('signin'); }}><LogIn size={18} /> Đăng nhập lại</button>}
              <Link className="menu__item" role="menuitem" to="/account" onClick={() => setOpen(false)}><Settings2 size={18} /> Tài khoản & đồng bộ</Link>
              {!expired && <button className="menu__item" role="menuitem" onClick={() => void sync.syncNow()}><RefreshCw size={18} /> Đồng bộ ngay</button>}
              <button className="menu__item menu__item--danger" role="menuitem" disabled={busy} onClick={() => void doSignOut(false)}><LogOut size={18} /> {busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
