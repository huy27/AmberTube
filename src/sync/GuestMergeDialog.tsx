import { CloudUpload } from 'lucide-react';
import { useSync } from './SyncProvider';

/** After signing in on a device with guest data: merge it into the account, keep them apart, or decide later. */
export default function GuestMergeDialog() {
  const sync = useSync();
  const c = sync.guestOffer;
  if (!c) return null;
  const parts = [
    c.favorites && `${c.favorites} bài yêu thích`,
    c.playlists && `${c.playlists} playlist`,
    c.history && `${c.history} bài đã nghe`,
    c.searches && `${c.searches} lượt tìm kiếm`,
  ].filter(Boolean).join(', ');
  return (
    <div className="auth-scrim">
      <div className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="merge-title">
        <div className="merge-icon"><CloudUpload size={26} /></div>
        <h2 id="merge-title" className="auth-dialog__title">Gộp dữ liệu trên máy này?</h2>
        <p className="auth-dialog__sub">
          Trước khi đăng nhập, máy này có {parts}. Gộp vào tài khoản để dùng trên mọi thiết bị.
          Dữ liệu đã có trong tài khoản được giữ nguyên, bài trùng chỉ giữ một bản, và bản trên máy này không bị xóa.
        </p>
        <div className="merge-actions">
          <button className="btn btn--primary" onClick={() => void sync.mergeGuest()}>Gộp vào tài khoản</button>
          <button className="btn btn--ghost" onClick={sync.declineGuest}>Không, giữ riêng</button>
          <button className="link-btn" onClick={sync.laterGuest}>Để sau</button>
        </div>
      </div>
    </div>
  );
}
