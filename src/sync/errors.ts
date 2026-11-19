export type SyncErrorKind = 'auth' | 'network' | 'server' | 'limit';
export class SyncError extends Error {
  readonly kind: SyncErrorKind;
  constructor(message: string, kind: SyncErrorKind) {
    super(message);
    this.kind = kind;
  }
}

type PgError = { message?: string; code?: string; status?: number } | null;

/** Supabase / PostgREST error → what the sync status should say. */
export function toSyncError(error: PgError, status?: number): SyncError {
  const msg = error?.message ?? '';
  const code = error?.code ?? '';
  const st = status ?? error?.status ?? 0;
  if (st === 401 || st === 403 || code === 'PGRST301' || code === 'PGRST303' || /jwt|token is expired|not authenticated/i.test(msg)) {
    return new SyncError('Phiên đăng nhập đã hết hạn.', 'auth');
  }
  if (/AMBERTUBE_LIMIT/.test(msg)) return new SyncError(msg, 'limit');
  if (code === 'PGRST205' || code === '42P01') return new SyncError('Chưa tạo bảng dữ liệu trên Supabase (chạy supabase/migrations/0001_init.sql).', 'server');
  if (!st || /failed to fetch|network|load failed|fetch failed/i.test(msg)) return new SyncError('Không kết nối được máy chủ.', 'network');
  return new SyncError(`Lỗi máy chủ (${code || st}): ${msg}`.slice(0, 200), 'server');
}
