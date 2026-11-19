import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, CloudUpload, LogIn, RefreshCw, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { UserAvatar, syncLabel } from '../auth/AccountButton';
import { useSync } from '../sync/SyncProvider';
import { useToast } from '../context/ToastContext';
import { ACCOUNT_LIMITS } from '../sync/limits';

const fmtN = (n: number) => n.toLocaleString('vi-VN');
const USAGE_ROWS: { key: string; label: string; max: number; rolling?: boolean }[] = [
  { key: 'favorites', label: 'Yêu thích', max: ACCOUNT_LIMITS.favorites },
  { key: 'playlists', label: 'Playlist', max: ACCOUNT_LIMITS.playlists },
  { key: 'playlist_tracks', label: 'Bài trong playlist', max: ACCOUNT_LIMITS.playlistTotal },
  { key: 'recent', label: 'Nghe gần đây', max: ACCOUNT_LIMITS.recent, rolling: true },
  { key: 'listens', label: 'Thống kê nghe', max: ACCOUNT_LIMITS.listens, rolling: true },
  { key: 'searches', label: 'Lịch sử tìm kiếm', max: ACCOUNT_LIMITS.searches, rolling: true },
];

/** Account & sync: profile, sync status, merge this device's guest data, password, delete synced data. */
export default function AccountPage() {
  const auth = useAuth();
  const sync = useSync();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(auth.user?.name ?? '');
  const [pw, setPw] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [usage, setUsage] = useState<Record<string, number> | null>(null);
  const canUse = auth.status === 'signed-in' && sync.status === 'synced';
  useEffect(() => {
    if (!canUse) return;
    let alive = true;
    void sync.usage().then((u) => alive && setUsage(u)).catch(() => undefined);
    return () => { alive = false; };
  }, [canUse, sync.lastSync]); // eslint-disable-line react-hooks/exhaustive-deps

  if (auth.status === 'disabled') {
    return <section className="page page--narrow"><EmptyState icon={UserRound} title="Tài khoản chưa được bật">Thêm <code>VITE_SUPABASE_URL</code> và <code>VITE_SUPABASE_ANON_KEY</code> vào <code>.env</code> để dùng đăng nhập và đồng bộ.</EmptyState></section>;
  }
  if (auth.status !== 'signed-in' && auth.status !== 'expired') {
    return (
      <section className="page page--narrow">
        <h1 className="page-title">Tài khoản</h1>
        <EmptyState icon={UserRound} title="Bạn đang dùng chế độ khách"
          action={<button className="btn btn--primary" onClick={() => auth.openDialog('signin')}><LogIn size={16} /> Đăng nhập / Đăng ký</button>}>
          Yêu thích, playlist, lịch sử và cài đặt đang lưu trên máy này. Đăng nhập để có chúng trên máy tính, điện thoại và màn hình xe.
        </EmptyState>
      </section>
    );
  }

  const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast(ok, { type: 'success' });
    } catch (e) {
      toast((e as Error).message, { type: 'warning', duration: 5200 });
    } finally {
      setBusy(null);
    }
  };
  const status = auth.status === 'expired' ? 'expired' : sync.status;
  const expired = status === 'expired';
  const signOut = (force: boolean) => run('out', async () => {
    if (!force && auth.status === 'signed-in' && !(await sync.flush(4000))) {
      setConfirmOut(true);
      return;
    }
    await auth.signOut();
    toast('Đã đăng xuất. Bạn đang dùng chế độ khách.', { type: 'success' });
    navigate('/');
  });

  return (
    <section className="page page--narrow account-page">
      <h1 className="page-title">Tài khoản & đồng bộ</h1>

      <div className="panel account-card">
        <UserAvatar name={auth.user?.name ?? '?'} avatar={auth.user?.avatar ?? null} size={56} />
        <div className="account-card__id">
          <strong>{auth.user?.name ?? 'Phiên đã hết hạn'}</strong>
          <span>{auth.user?.email}</span>
          {auth.user && <span className="account-card__via">Đăng nhập bằng {auth.user.provider === 'google' ? 'Google' : 'email'}</span>}
        </div>
      </div>

      {expired && (
        <div className="notice notice--warn" role="status">
          <AlertTriangle size={16} /> Phiên đăng nhập đã hết hạn. Thay đổi vẫn được lưu trên máy này và sẽ đồng bộ khi bạn đăng nhập lại.
          <button className="btn btn--sm btn--primary" onClick={() => auth.openDialog('signin')}>Đăng nhập lại</button>
        </div>
      )}

      <h2 className="section-title">Đồng bộ</h2>
      <div className="panel account-sync">
        <div className={`account__sync account__sync--${status}`} role="status"><span className={`sync-dot sync-dot--${status}`} /> {syncLabel(status, sync.lastSync, sync.pending)}</div>
        {sync.error && status !== 'synced' && <p className="account-sync__err">{sync.error}</p>}
        <p className="account-sync__what">Đồng bộ: yêu thích, playlist, nghe gần đây, thống kê nghe, lịch sử tìm kiếm và cài đặt. Hàng đợi, âm lượng và chế độ hiển thị (Car View) là riêng từng máy.</p>
        <button className="btn btn--ghost btn--sm" disabled={auth.status !== 'signed-in' || busy !== null} onClick={() => void run('sync', sync.syncNow)}>
          <RefreshCw size={15} className={sync.status === 'syncing' ? 'spin' : ''} /> Đồng bộ ngay
        </button>
      </div>

      {usage && (
        <>
          <h2 className="section-title">Dung lượng tài khoản</h2>
          <div className="panel account-usage">
            {USAGE_ROWS.map((r) => {
              const n = Number(usage[r.key] ?? 0);
              const pct = Math.min(100, (n / r.max) * 100);
              return (
                <div key={r.key} className={`usage-row${!r.rolling && pct >= 90 ? ' is-full' : ''}`}>
                  <span className="usage-row__label">{r.label}</span>
                  <span className="usage-row__bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                  <span className="usage-row__num">{fmtN(n)} / {fmtN(r.max)}{r.rolling ? ' · tự cuộn' : ''}</span>
                </div>
              );
            })}
            <p className="usage-note">
              Đang dùng khoảng <b>{(Number(usage.bytes ?? 0) / 1048576).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB</b> (tối đa ~{ACCOUNT_LIMITS.approxMB} MB).
              Mục có "tự cuộn" giữ phần mới nhất và tự bỏ phần cũ, không bao giờ bị chặn.
              {sync.rejected > 0 && <> <b className="usage-warn">{sync.rejected} mục chưa đồng bộ vì đã đạt giới hạn.</b></>}
            </p>
          </div>
        </>
      )}

      {sync.guestAvailable && (
        <div className="panel account-merge">
          <CloudUpload size={20} />
          <div>
            <strong>Dữ liệu từ khi chưa đăng nhập</strong>
            <p>Máy này có {sync.guestAvailable.favorites} bài yêu thích, {sync.guestAvailable.playlists} playlist, {sync.guestAvailable.history} bài đã nghe và {sync.guestAvailable.searches} lượt tìm ở chế độ khách.</p>
          </div>
          <button className="btn btn--outline btn--sm" onClick={sync.offerGuest}>Gộp vào tài khoản…</button>
        </div>
      )}

      {auth.status === 'signed-in' && (
        <>
          <h2 className="section-title">Hồ sơ</h2>
          <form className="panel account-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void run('name', () => auth.updateName(name), 'Đã lưu tên hiển thị'); }}>
            <label>Tên hiển thị<input className="field" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
            <button className="btn btn--ghost btn--sm" disabled={busy !== null || !name.trim()}>Lưu</button>
          </form>
          {auth.user?.provider !== 'google' && (
            <form className="panel account-form" onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (pw.length < 8) return toast('Mật khẩu cần ít nhất 8 ký tự.', { type: 'warning' });
              void run('pw', async () => { await auth.updatePassword(pw); setPw(''); }, 'Đã đổi mật khẩu');
            }}>
              <label>Mật khẩu mới<input className="field" type="password" value={pw} autoComplete="new-password" onChange={(e) => setPw(e.target.value)} placeholder="Ít nhất 8 ký tự" /></label>
              <button className="btn btn--ghost btn--sm" disabled={busy !== null}>Đổi mật khẩu</button>
            </form>
          )}

          <h2 className="section-title">Dữ liệu</h2>
          <div className="panel account-danger">
            <p><ShieldCheck size={15} /> Dữ liệu của bạn chỉ bạn đọc và sửa được. AmberTube chỉ lưu danh sách bài (mã video YouTube và thông tin bài), không lưu file nhạc.</p>
            {!confirmDelete ? (
              <button className="btn btn--danger btn--sm" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Xóa dữ liệu đã đồng bộ…</button>
            ) : (
              <div className="account-danger__confirm">
                <p>Xóa yêu thích, playlist, lịch sử, tìm kiếm và cài đặt của tài khoản trên <b>mọi thiết bị</b>. Không thể hoàn tác.</p>
                <button className="btn btn--ghost btn--sm" onClick={() => setConfirmDelete(false)}>Hủy</button>
                <button className="btn btn--danger btn--sm" disabled={busy !== null} onClick={() => void run('del', async () => { await sync.deleteCloudData(); setConfirmDelete(false); }, 'Đã xóa dữ liệu đồng bộ của tài khoản')}>Xóa vĩnh viễn</button>
              </div>
            )}
          </div>
        </>
      )}

      {confirmOut ? (
        <div className="notice notice--warn account-signout" role="alert">
          <AlertTriangle size={16} /> Còn {sync.pending} thay đổi chưa gửi lên tài khoản. Đăng xuất bây giờ sẽ bỏ chúng trên máy này.
          <button className="btn btn--sm btn--ghost" onClick={() => setConfirmOut(false)}>Ở lại</button>
          <button className="btn btn--sm btn--danger" onClick={() => void signOut(true)}>Vẫn đăng xuất</button>
        </div>
      ) : (
        <button className="btn btn--ghost account-signout" disabled={busy !== null} onClick={() => void signOut(false)}>Đăng xuất</button>
      )}
    </section>
  );
}
