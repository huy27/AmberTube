// Sign-in state (Supabase Auth). Signing in switches the app to that account's data; signing out goes back
// to the guest library and removes the account's copy from this device. Music works the same either way.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, hasStoredSession, hasSupabase, urlHasAuthParams } from '../services/supabase';
import { GUEST, clearScopeData, getScope, scopeUserId, setScope, userScope } from '../sync/scope';

export type AuthStatus = 'disabled' | 'loading' | 'guest' | 'signed-in' | 'expired';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  provider: string;
}

export type AuthDialogMode = 'signin' | 'signup' | 'forgot';

export interface AuthApi {
  status: AuthStatus;
  /** the sign-in dialog, when open */
  dialog: AuthDialogMode | null;
  openDialog(mode?: AuthDialogMode): void;
  closeDialog(): void;
  user: AuthUser | null;
  /** came back from a password-reset link: show the "new password" form */
  recovery: boolean;
  signIn(email: string, password: string): Promise<void>;
  /** resolves `needsConfirm` when the project requires e-mail confirmation first */
  signUp(email: string, password: string, name: string): Promise<{ needsConfirm: boolean }>;
  signInWithGoogle(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  updateName(name: string): Promise<void>;
  /** sign out on this device only; the account's local copy is removed */
  signOut(): Promise<void>;
  client(): Promise<SupabaseClient>;
}

const Ctx = createContext<AuthApi | null>(null);

/** Supabase's English errors → short Vietnamese messages. */
export function authMessage(e: unknown): string {
  const err = e as { message?: string; status?: number; code?: string };
  const m = err?.message ?? String(e);
  if (/invalid login credentials/i.test(m)) return 'Email hoặc mật khẩu không đúng.';
  if (/email not confirmed/i.test(m)) return 'Email chưa được xác nhận. Mở thư xác nhận (xem cả mục Spam) rồi đăng nhập lại.';
  if (/already registered|already been registered|user_already_exists/i.test(m)) return 'Email này đã có tài khoản. Hãy đăng nhập.';
  if (/password should be|weak_password|at least \d+ characters/i.test(m)) return 'Mật khẩu chưa đủ mạnh (ít nhất 8 ký tự).';
  if (/email signups are disabled|email logins are disabled|email_provider_disabled/i.test(m)) return 'Đăng ký/đăng nhập bằng email đang tắt cho AmberTube (bật Email provider trong Supabase).';
  if (/signups not allowed|signup_disabled/i.test(m)) return 'AmberTube hiện không nhận đăng ký mới.';
  if (/provider is not enabled|unsupported provider/i.test(m)) return 'Đăng nhập Google chưa được bật cho AmberTube.';
  if (err?.status === 429 || /rate limit|too many/i.test(m)) return 'Bạn thử quá nhiều lần. Đợi vài phút rồi thử lại.';
  if (/invalid email|unable to validate email|email address .* is invalid/i.test(m)) return 'Email không hợp lệ.';
  if (/same_password|different from the old/i.test(m)) return 'Mật khẩu mới phải khác mật khẩu cũ.';
  if (/failed to fetch|network|load failed|fetch failed/i.test(m)) return 'Không kết nối được máy chủ đăng nhập. Kiểm tra mạng rồi thử lại.';
  return m || 'Có lỗi xảy ra. Thử lại sau.';
}

function toUser(s: Session): AuthUser {
  const u = s.user;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name = String(meta.full_name || meta.name || (u.email ?? '').split('@')[0] || 'Bạn').slice(0, 80);
  const avatar = typeof meta.avatar_url === 'string' && meta.avatar_url.startsWith('https://') ? meta.avatar_url : null;
  return { id: u.id, email: u.email ?? '', name, avatar, provider: String(u.app_metadata?.provider ?? 'email') };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  // restore right away when this device was signed in, or we're coming back from an auth link
  const eager = hasSupabase && (getScope() !== GUEST || hasStoredSession() || urlHasAuthParams());
  const [status, setStatus] = useState<AuthStatus>(!hasSupabase ? 'disabled' : eager ? 'loading' : 'guest');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [dialog, setDialog] = useState<AuthDialogMode | null>(null);
  const started = useRef<Promise<SupabaseClient> | null>(null);
  const signingOut = useRef(false);

  const apply = useCallback((session: Session | null) => {
    if (session) {
      const u = toUser(session);
      setUser(u);
      setScope(userScope(u.id)); // that account's library (empty until the first sync on a new device)
      setStatus('signed-in');
      setDialog(null);
      // make sure the profile row exists (projects that can't use the sign-up trigger)
      void started.current?.then((c) => c.from('profiles').upsert(
        { id: u.id, display_name: u.name, avatar_url: u.avatar },
        { onConflict: 'id', ignoreDuplicates: true },
      )).then(() => undefined, () => undefined);
      return;
    }
    setUser(null);
    if (!signingOut.current && scopeUserId()) {
      // the session ended without the user signing out (expired / revoked): keep their data visible and
      // queued, and ask them to sign in again
      setStatus('expired');
      return;
    }
    setStatus('guest');
  }, []);

  const start = useCallback(() => {
    started.current ??= getSupabase().then(async (c) => {
      c.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setRecovery(true);
          navigate('/auth/reset');
        }
        if (event === 'INITIAL_SESSION') return; // handled by getSession below
        // defer: Supabase must not be called back from inside its own listener
        setTimeout(() => apply(session), 0);
      });
      const { data } = await c.auth.getSession();
      apply(data.session);
      if (/type=recovery/.test(location.hash + location.search)) {
        setRecovery(true);
        navigate('/auth/reset');
      }
      return c;
    });
    return started.current;
  }, [apply, navigate]);

  useEffect(() => {
    if (!eager) return;
    start().catch(() => setStatus(scopeUserId() ? 'expired' : 'guest'));
  }, [eager, start]);

  const api = useMemo<AuthApi>(() => ({
    status,
    user,
    recovery,
    dialog,
    openDialog: (mode = 'signin') => {
      setDialog(mode);
      void start().catch(() => undefined); // warm up the client while the user types
    },
    closeDialog: () => setDialog(null),
    client: start,
    async signIn(email, password) {
      const c = await start();
      const { error } = await c.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(authMessage(error));
    },
    async signUp(email, password, name) {
      const c = await start();
      const { data, error } = await c.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: name.trim() || undefined }, emailRedirectTo: `${location.origin}/` },
      });
      if (error) throw new Error(authMessage(error));
      // an existing confirmed address comes back with no identities (Supabase hides that it exists)
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error(authMessage({ message: 'already registered' }));
      return { needsConfirm: !data.session };
    },
    async signInWithGoogle() {
      const c = await start();
      const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}${location.pathname}` } });
      if (error) throw new Error(authMessage(error));
    },
    async sendPasswordReset(email) {
      const c = await start();
      const { error } = await c.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/auth/reset` });
      if (error) throw new Error(authMessage(error));
    },
    async updatePassword(password) {
      const c = await start();
      const { error } = await c.auth.updateUser({ password });
      if (error) throw new Error(authMessage(error));
      setRecovery(false);
    },
    async updateName(name) {
      const c = await start();
      const clean = name.trim().slice(0, 80);
      const { data, error } = await c.auth.updateUser({ data: { full_name: clean } });
      if (error) throw new Error(authMessage(error));
      if (data.user) await c.from('profiles').update({ display_name: clean }).eq('id', data.user.id);
      setUser((u) => (u ? { ...u, name: clean || u.name } : u));
    },
    async signOut() {
      const old = getScope();
      signingOut.current = true;
      try {
        const c = await start().catch(() => null);
        await c?.auth.signOut({ scope: 'local' }).catch(() => undefined); // this device only
      } finally {
        setScope(GUEST);
        clearScopeData(old); // a shared screen (VF5) keeps nothing of the account…
        setTimeout(() => clearScopeData(old), 600); // …including what the switching providers flush on their way out
        setUser(null);
        setStatus('guest');
        signingOut.current = false;
      }
    },
  }), [status, user, recovery, dialog, start]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
