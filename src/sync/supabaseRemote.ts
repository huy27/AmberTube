// The sync engine's server side, on Supabase (PostgREST). RLS on every table limits each request to the
// signed-in user's rows; the explicit user_id filters just let Postgres use the indexes.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Remote, RemoteRow } from './engine';
import { toSyncError } from './errors';

export { toSyncError };
import { LIMITS, type Table } from './model';

const CONFLICT: Record<Table, string> = {
  favorites: 'user_id,provider,track_id',
  listening_history: 'user_id,id',
  search_history: 'user_id,query_norm',
  playlists: 'user_id,id',
  playlist_tracks: 'user_id,playlist_id,provider,track_id',
  user_settings: 'user_id',
};

export function supabaseRemote(client: SupabaseClient, userId: string): Remote {
  return {
    async pull(table, since, { offset, limit }) {
      let q = client.from(table).select('*').eq('user_id', userId);
      if (since) q = q.gt('updated_at', since);
      else if (table !== 'user_settings') q = q.eq('deleted', false);
      if (table === 'listening_history') q = q.gte('played_at', new Date(Date.now() - LIMITS.listenDays * 86_400_000).toISOString());
      const { data, error, status } = await q.order('updated_at', { ascending: true }).range(offset, offset + limit - 1);
      if (error) throw toSyncError(error, status);
      return (data ?? []) as RemoteRow[];
    },
    async upsert(table, rows) {
      const { error, status } = await client.from(table).upsert(rows, { onConflict: CONFLICT[table] });
      if (error) throw toSyncError(error, status);
    },
    async markDeleted(table, eq, col, values, changedAt) {
      let q = client.from(table).update({ deleted: true, changed_at: changedAt }).eq('user_id', userId);
      for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
      const { error, status } = await q.in(col, values);
      if (error) throw toSyncError(error, status);
    },
  };
}
