// Per-account storage limits (plan B). The database enforces them (supabase/migrations/0002_limits.sql);
// the app checks the same numbers first so people get a clear message instead of a sync error.
export const ACCOUNT_LIMITS = {
  favorites: 5000,
  playlists: 200,
  playlistTracks: 1000,
  playlistTotal: 5000,
  recent: 500,
  listens: 2000,
  searches: 100,
  approxMB: 10,
} as const;

const fmt = (n: number) => n.toLocaleString('vi-VN');

export const LIMIT_MESSAGES = {
  favorites: `Đã đạt tối đa ${fmt(ACCOUNT_LIMITS.favorites)} bài yêu thích. Bỏ bớt bài cũ để thêm bài mới.`,
  playlists: `Đã đạt tối đa ${fmt(ACCOUNT_LIMITS.playlists)} playlist. Xóa bớt playlist để tạo mới.`,
  playlistTracks: `Playlist này đã có tối đa ${fmt(ACCOUNT_LIMITS.playlistTracks)} bài.`,
  playlistTotal: `Các playlist đã có tổng cộng tối đa ${fmt(ACCOUNT_LIMITS.playlistTotal)} bài. Bỏ bớt bài để thêm bài mới.`,
};

/** Which limit a database error refers to ("AMBERTUBE_LIMIT:favorites:5000"), if any. */
export function limitKind(message: string | undefined): keyof typeof LIMIT_MESSAGES | null {
  const m = /AMBERTUBE_LIMIT:(\w+)/.exec(message ?? '');
  if (!m) return null;
  return ({ favorites: 'favorites', playlists: 'playlists', playlist_tracks: 'playlistTracks', playlist_total: 'playlistTotal' } as const)[m[1] as 'favorites'] ?? null;
}
