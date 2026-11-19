// Two-way sync between the local library and the user's rows on the server (pure logic; the network
// is behind `Remote`, local state behind `LocalPort`). Local-first: the app always reads and writes its
// local copy; this engine reconciles it with the server in the background.
//
// Per record we remember the last content both sides agreed on (`base`: hash + when it was changed).
//  • scan(): local content differs from base → a pending local change (deleted locally → a tombstone,
//    unless a local size limit merely trimmed it).
//  • pull(): server rows changed since the cursor. A remote change newer than a pending local change
//    wins; otherwise the local change is kept and pushed.
//  • push(): pending changes go up with `changed_at`; the server ignores writes older than what it has.
import {
  TABLES, applyChanges, contentOfRow, hashOf, keyColumns, keyOfRow, recId, recordsOf, restoreTrack, rowOfContent, splitId, wasTrimmed,
  type Change, type Content, type LocalData, type Rec, type Table,
} from './model.ts';

export interface RemoteRow extends Content { changed_at: string; updated_at: string; deleted?: boolean }

export interface Remote {
  /** Rows changed after `since` (all live rows when null), oldest change first. */
  pull(table: Table, since: string | null, page: { offset: number; limit: number }): Promise<RemoteRow[]>;
  upsert(table: Table, rows: Content[]): Promise<void>;
  /** Tombstone rows: `eq` columns equal, `col` in `values`. */
  markDeleted(table: Table, eq: Record<string, string>, col: string, values: string[], changedAt: string): Promise<void>;
}

import { SyncError } from './errors.ts';

export { SyncError };
export type { SyncErrorKind } from './errors.ts';

export interface SyncMeta {
  cursor: Partial<Record<Table, string>>;
  base: Record<string, { h: string; t: number; s?: number }>;
  pending: Record<string, { t: number; h: string }>;
  /** local items the server refused (account limit): not retried until they change */
  rejected?: Record<string, string>;
  lastSync?: number;
}
export const emptyMeta = (): SyncMeta => ({ cursor: {}, base: {}, pending: {} });

export interface LocalPort {
  read(): LocalData;
  /**
   * Store new local data. When `changes` is given (server changes), apply those to the CURRENT state rather
   * than replacing it with `d`, so an edit the user made a moment ago is never overwritten.
   */
  write(d: LocalData, changes?: Change[]): void;
}

const PAGE = 500;
const CHUNK = 200;
const OVERLAP_MS = 60_000; // re-read the last minute: transactions can commit out of updated_at order
const iso = (t: number) => new Date(t).toISOString();
const TRACK_TABLES: Table[] = ['favorites', 'listening_history', 'playlist_tracks'];
const sortOf = (table: Table, c: Content | null) =>
  !c ? undefined : table === 'listening_history' ? Number(c.played_at) : table === 'search_history' ? Number(c.searched_at) : undefined;

export class SyncEngine {
  private readonly remote: Remote;
  private readonly userId: string;
  private readonly local: LocalPort;
  meta: SyncMeta;
  private readonly now: () => number;
  constructor(remote: Remote, userId: string, local: LocalPort, meta: SyncMeta, now: () => number = Date.now) {
    this.remote = remote;
    this.userId = userId;
    this.local = local;
    this.meta = meta;
    this.now = now;
  }

  get pendingCount() {
    return Object.keys(this.meta.pending).length;
  }

  /**
   * Detect local changes since the last sync. Returns the number of pending changes.
   * Before the first successful sync on a device nothing counts as a change (unless forced): a new
   * device's default settings must not override the account's.
   */
  scan(force = false): number {
    if (!force && this.meta.lastSync === undefined) return this.pendingCount;
    const d = this.local.read();
    const recs = recordsOf(d);
    const { base, pending } = this.meta;
    const now = this.now();
    const rejected = (this.meta.rejected ??= {});
    for (const [id, r] of recs) {
      const h = hashOf(r.content);
      if (base[id]?.h === h) {
        delete pending[id];
        continue;
      }
      if (rejected[id] === h) continue; // refused by an account limit; waits until it changes
      delete rejected[id];
      if (pending[id]?.h !== h) pending[id] = { t: now, h }; // newest edit time wins conflicts
    }
    for (const id of Object.keys(base)) {
      if (recs.has(id)) continue;
      if (base[id].h === 'DEL') {
        delete pending[id];
        continue;
      }
      const [table, key] = splitId(id);
      if (wasTrimmed(table, key, base[id].s, d, now)) {
        delete base[id]; // dropped by a local size limit: forget it, keep it in the cloud
        delete pending[id];
        continue;
      }
      if (pending[id]?.h !== 'DEL') pending[id] = { t: now, h: 'DEL' };
    }
    for (const id of Object.keys(pending)) if (!recs.has(id) && !base[id]) delete pending[id]; // added and removed offline
    for (const id of Object.keys(rejected)) if (!recs.has(id)) delete rejected[id];
    return this.pendingCount;
  }

  /** Fetch and apply server changes. Returns how many changed the local data. */
  async pull(): Promise<number> {
    const { base, pending, cursor } = this.meta;
    const changes: Change[] = [];
    for (const table of TABLES) {
      // first pull of a table: live rows only — unless we already pushed rows of it, then deletions matter too
      const known = Object.keys(base).some((id) => id.startsWith(`${table}|`));
      const since = cursor[table] ? iso(Date.parse(cursor[table]!) - OVERLAP_MS) : known ? iso(0) : null;
      let maxUpdated = cursor[table] ?? '';
      for (let offset = 0; ; offset += PAGE) {
        const rows = await this.remote.pull(table, since, { offset, limit: PAGE });
        for (const row of rows) {
          if (row.updated_at > maxUpdated) maxUpdated = row.updated_at;
          if (table === 'user_settings') {
            const data = (row.data ?? {}) as Record<string, { v?: unknown; t?: number }>;
            for (const [k, e] of Object.entries(data)) {
              const id = recId(table, k);
              const t = Number(e?.t) || 0;
              const content = { v: e?.v };
              const h = hashOf(content);
              if ((pending[id] && pending[id].t > t) || (base[id] && (base[id].h === h || base[id].t > t))) continue;
              changes.push({ table, key: k, content });
              base[id] = { h, t };
              delete pending[id];
            }
            continue;
          }
          const key = keyOfRow(table, row);
          const id = recId(table, key);
          const t = Date.parse(row.changed_at) || 0;
          const content = row.deleted ? null : contentOfRow(table, row);
          // a provider this version can't play: leave it on the server untouched
          if (content && TRACK_TABLES.includes(table) && !restoreTrack(content.provider, content.track_id, content.track)) continue;
          const h = hashOf(content);
          if (pending[id] && pending[id].t > t) continue; // our newer local edit will be pushed
          if (base[id]?.h === h) {
            base[id].t = Math.max(base[id].t, t);
            continue;
          }
          if (base[id] && base[id].t > t) continue;
          if (!content && !base[id]) continue; // deleted before we ever had it
          changes.push({ table, key, content });
          base[id] = { h, t, s: sortOf(table, content) };
          delete pending[id];
        }
        if (rows.length < PAGE) break;
      }
      if (maxUpdated) cursor[table] = maxUpdated;
    }
    if (changes.length) this.local.write(applyChanges(this.local.read(), changes, this.now()), changes);
    return changes.length;
  }

  /** Send pending local changes. Returns how many were sent. */
  async push(): Promise<number> {
    const { base, pending } = this.meta;
    const ids = Object.keys(pending);
    if (!ids.length) return 0;
    const recs = recordsOf(this.local.read());
    let sent = 0;
    for (const table of TABLES) {
      const mine = ids.filter((id) => id.startsWith(`${table}|`));
      if (!mine.length) continue;
      const snap = new Map(mine.map((id) => [id, { ...pending[id] }] as const));
      const done = (id: string, r: Rec | undefined) => {
        const p = snap.get(id)!;
        base[id] = { h: p.h, t: p.t, s: r ? sortOf(table, r.content) : base[id]?.s };
        if (pending[id]?.h === p.h) delete pending[id]; // unless it changed again meanwhile
        sent++;
      };
      if (table === 'user_settings') {
        const data: Record<string, { v: unknown; t: number }> = {};
        let latest = 0;
        for (const id of mine) {
          const r = recs.get(id);
          if (!r) {
            delete pending[id];
            continue;
          }
          data[splitId(id)[1]] = { v: r.content.v, t: snap.get(id)!.t };
          latest = Math.max(latest, snap.get(id)!.t);
        }
        if (Object.keys(data).length) {
          await this.remote.upsert(table, [{ user_id: this.userId, data, changed_at: iso(latest) }]);
          for (const id of mine) if (recs.has(id)) done(id, recs.get(id));
        }
        continue;
      }
      const ups = mine.filter((id) => recs.has(id));
      const rowOf = (id: string) => ({ ...rowOfContent(table, recs.get(id)!.content), user_id: this.userId, changed_at: iso(snap.get(id)!.t), deleted: false });
      for (let i = 0; i < ups.length; i += CHUNK) {
        const part = ups.slice(i, i + CHUNK);
        try {
          await this.remote.upsert(table, part.map(rowOf));
          part.forEach((id) => done(id, recs.get(id)));
        } catch (e) {
          if (!(e instanceof SyncError && e.kind === 'limit')) throw e;
          // over an account limit: send one by one so everything that fits still syncs
          for (const id of part) {
            try {
              await this.remote.upsert(table, [rowOf(id)]);
              done(id, recs.get(id));
            } catch (e1) {
              if (!(e1 instanceof SyncError && e1.kind === 'limit')) throw e1;
              (this.meta.rejected ??= {})[id] = snap.get(id)!.h;
              delete pending[id];
              this.rejectedNow++;
            }
          }
        }
      }
      // deletions, grouped by their fixed key columns
      const groups = new Map<string, { eq: Record<string, string>; col: string; ids: string[]; values: string[]; t: number }>();
      for (const id of mine.filter((x) => !recs.has(x))) {
        if (!base[id] || base[id].h === 'DEL') {
          delete pending[id]; // never reached the server
          continue;
        }
        const kc = keyColumns(table, splitId(id)[1]);
        const gk = JSON.stringify(kc.eq);
        const g = groups.get(gk) ?? { eq: kc.eq, col: kc.col, ids: [], values: [], t: 0 };
        g.ids.push(id);
        g.values.push(kc.value);
        g.t = Math.max(g.t, snap.get(id)!.t);
        groups.set(gk, g);
      }
      for (const g of groups.values()) {
        for (let i = 0; i < g.values.length; i += CHUNK) {
          await this.remote.markDeleted(table, g.eq, g.col, g.values.slice(i, i + CHUNK), iso(g.t));
          g.ids.slice(i, i + CHUNK).forEach((id) => done(id, undefined));
          // room was made: items refused earlier by a limit get another try
          for (const rid of Object.keys(this.meta.rejected ?? {})) if (rid.startsWith(`${table}|`)) delete this.meta.rejected![rid];
        }
      }
    }
    return sent;
  }

  private rejectedNow = 0;

  /** One full round: local changes → pull → push. `rejected`: items refused by an account limit this round. */
  async sync(): Promise<{ pulled: number; pushed: number; rejected: number }> {
    this.rejectedNow = 0;
    this.scan();
    const pulled = await this.pull();
    this.scan(true);
    const pushed = await this.push();
    this.meta.lastSync = this.now();
    return { pulled, pushed, rejected: this.rejectedNow };
  }

  /** Local items currently not synced because of an account limit. */
  get rejectedCount() {
    return Object.keys(this.meta.rejected ?? {}).length;
  }

  /** Setting names the account already has (guest settings must not override them). */
  accountSettingKeys(): Set<string> {
    return new Set(Object.keys(this.meta.base).filter((id) => id.startsWith('user_settings|')).map((id) => splitId(id)[1]));
  }
}
