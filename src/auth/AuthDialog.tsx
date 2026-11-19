import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X, Mail, Lock, User as UserIcon, Loader2 } from 'lucide-react';
import { useAuth, type AuthDialogMode } from './AuthContext';
import { authSettings } from '../services/supabase';

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

const TITLES: Record<AuthDialogMode, string> = { signin: 'Đăng nhập', signup: 'Tạo tài khoản', forgot: 'Quên mật khẩu' };

/** Sign in / register / password reset. Music keeps playing underneath; closing it keeps guest mode. */
export default function AuthDialog() {
  const auth = useAuth();
  const mode = auth.dialog;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [google, setGoogle] = useState<boolean | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!mode) return;
    setError(null);
    setNotice(null);
    setTimeout(() => first.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && auth.closeDialog();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode && google === null) void authSettings().then((s) => setGoogle(s?.google ?? false));
  }, [mode, google]);

  if (!mode) return null;
  const go = (m: AuthDialogMode) => {
    setError(null);
    setNotice(null);
    auth.openDialog(m);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Email không hợp lệ.');
    if (mode !== 'forgot' && password.length < (mode === 'signup' ? 8 : 1)) return setError(mode === 'signup' ? 'Mật khẩu cần ít nhất 8 ký tự.' : 'Nhập mật khẩu.');
    setBusy(true);
    try {
      if (mode === 'signin') await auth.signIn(email, password);
      else if (mode === 'signup') {
        const r = await auth.signUp(email, password, name);
        if (r.needsConfirm) {
          setNotice(`Đã gửi thư xác nhận tới ${email.trim()}. Mở thư và bấm liên kết, rồi quay lại đăng nhập.`);
          setPassword('');
        }
      } else {
        await auth.sendPasswordReset(email);
        setNotice('Nếu email này có tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu trong vài phút.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const withGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await auth.signInWithGoogle(); // navigates to Google
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="auth-scrim" onMouseDown={(e) => e.target === e.currentTarget && auth.closeDialog()}>
      <div className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="icon-btn auth-dialog__close" onClick={auth.closeDialog} aria-label="Đóng"><X size={20} /></button>
        <h2 id="auth-title" className="auth-dialog__title">{TITLES[mode]}</h2>
        <p className="auth-dialog__sub">
          {mode === 'forgot' ? 'Nhập email tài khoản, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.' : 'Đồng bộ yêu thích, playlist, lịch sử và cài đặt giữa máy tính, điện thoại và màn hình xe. Không đăng nhập vẫn nghe nhạc bình thường.'}
        </p>

        {mode !== 'forgot' && google && (
          <>
            <button className="btn auth-google" onClick={() => void withGoogle()} disabled={busy}><GoogleMark /> Tiếp tục với Google</button>
            <div className="auth-or"><span>hoặc</span></div>
          </>
        )}

        <form className="auth-form" onSubmit={(e) => void submit(e)} noValidate>
          {mode === 'signup' && (
            <label className="auth-field"><UserIcon size={16} /><input ref={first} className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên hiển thị (không bắt buộc)" autoComplete="name" maxLength={80} /></label>
          )}
          <label className="auth-field"><Mail size={16} /><input ref={mode === 'signup' ? undefined : first} className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" inputMode="email" required /></label>
          {mode !== 'forgot' && (
            <label className="auth-field"><Lock size={16} /><input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Mật khẩu (ít nhất 8 ký tự)' : 'Mật khẩu'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required /></label>
          )}
          {error && <p className="auth-msg auth-msg--error" role="alert">{error}</p>}
          {notice && <p className="auth-msg auth-msg--ok" role="status">{notice}</p>}
          <button className="btn btn--primary auth-submit" type="submit" disabled={busy}>
            {busy && <Loader2 size={16} className="spin" />}
            {mode === 'signin' ? 'Đăng nhập' : mode === 'signup' ? 'Tạo tài khoản' : 'Gửi liên kết'}
          </button>
        </form>

        <div className="auth-links">
          {mode === 'signin' && <><button className="link-btn" onClick={() => go('forgot')}>Quên mật khẩu?</button><button className="link-btn" onClick={() => go('signup')}>Chưa có tài khoản? <b>Đăng ký</b></button></>}
          {mode === 'signup' && <button className="link-btn" onClick={() => go('signin')}>Đã có tài khoản? <b>Đăng nhập</b></button>}
          {mode === 'forgot' && <button className="link-btn" onClick={() => go('signin')}>Quay lại đăng nhập</button>}
        </div>
        <button className="link-btn auth-guest" onClick={auth.closeDialog}>Tiếp tục ở chế độ khách</button>
      </div>
    </div>
  );
}
