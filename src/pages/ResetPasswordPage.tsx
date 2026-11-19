import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../context/ToastContext';

/** Landing page of the password-reset e-mail: choose a new password. */
export default function ResetPasswordPage() {
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.status === 'loading') return <section className="page page--narrow"><div className="sk sk--line" style={{ width: 240, height: 28 }} /></section>;
  if (!auth.recovery && auth.status !== 'signed-in') {
    return (
      <section className="page page--narrow">
        <EmptyState icon={KeyRound} title="Liên kết không hợp lệ hoặc đã hết hạn"
          action={<button className="btn btn--primary" onClick={() => auth.openDialog('forgot')}>Gửi lại liên kết</button>}>
          Liên kết đặt lại mật khẩu chỉ dùng được một lần và trong thời gian ngắn.
        </EmptyState>
      </section>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError('Mật khẩu cần ít nhất 8 ký tự.');
    if (pw !== pw2) return setError('Hai mật khẩu chưa khớp.');
    setBusy(true);
    try {
      await auth.updatePassword(pw);
      toast('Đã đặt mật khẩu mới', { type: 'success' });
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="page page--narrow">
      <h1 className="page-title">Đặt mật khẩu mới</h1>
      <form className="panel account-form account-form--col" onSubmit={(e) => void submit(e)}>
        <label>Mật khẩu mới<input className="field" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
        <label>Nhập lại<input className="field" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
        {error && <p className="auth-msg auth-msg--error" role="alert">{error}</p>}
        <button className="btn btn--primary" disabled={busy}>Lưu mật khẩu</button>
      </form>
    </section>
  );
}
