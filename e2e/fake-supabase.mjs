// A local stand-in for a Supabase project, for end-to-end tests: GoTrue-style auth endpoints and a
// PostgREST subset on a REAL Postgres (PGlite) running supabase/migrations/0001_init.sql — so every request
// the app makes goes through the actual tables, triggers, RLS policies and grants.
// Not implemented: Realtime websockets (the app falls back to polling / tab focus), e-mail delivery.
//
//   node e2e/fake-supabase.mjs [port]          (default 54321)
// Test hooks: POST /__test/expire {email}, /__test/fail {count}, /__test/reset; GET /__test/rows/<table>,
// /__test/recovery?email=…
import http from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { createDb, createUser } from '../supabase/test/pg.mjs';

const PORT = Number(process.argv[2] || process.env.FAKE_SUPABASE_PORT || 54321);
let db = await createDb();
const users = new Map(); // email → { id, email, password, meta, confirmedAt }
const refresh = new Map(); // refresh token → user id
const notBefore = new Map(); // user id → tokens issued before this (s) are invalid
const recovery = new Map(); // email → code
const pkce = new Map(); // code → { userId, type }
let failNext = 0;
const log = [];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(user) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600, session_id: randomUUID() })}.${randomBytes(16).toString('base64url')}`;
}
function claims(req) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const parts = tok.split('.');
  if (parts.length !== 3) return null; // the publishable key → anon
  try {
    const c = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (c.exp * 1000 < Date.now() || c.iat < (notBefore.get(c.sub) ?? 0)) return { expired: true };
    return c;
  } catch {
    return null;
  }
}
const publicUser = (u) => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.confirmedAt, phone: '',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: u.meta, identities: [{ id: u.id, user_id: u.id, provider: 'email', identity_data: { sub: u.id, email: u.email } }],
  created_at: u.createdAt, updated_at: new Date().toISOString(),
});
function session(u) {
  const rt = randomBytes(18).toString('base64url');
  refresh.set(rt, u.id);
  return { access_token: jwt(u), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: rt, user: publicUser(u) };
}
const byId = (id) => [...users.values()].find((u) => u.id === id);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
const authErr = (res, status, msg, code) => send(res, status, { code: status, error_code: code, msg, message: msg, error: code, error_description: msg });

// ---------- PostgREST subset ----------
const IDENT = /^[a-z_][a-z0-9_]*$/;
const TABLES = new Set(['profiles', 'favorites', 'listening_history', 'search_history', 'playlists', 'playlist_tracks', 'user_settings']);
function parseIn(v) {
  const inner = v.replace(/^\(/, '').replace(/\)$/, '');
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of inner) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  if (inner.length) out.push(cur);
  return out;
}
function filters(params, args) {
  const where = [];
  for (const [col, raw] of params) {
    if (['select', 'order', 'offset', 'limit', 'on_conflict', 'columns'].includes(col)) continue;
    if (!IDENT.test(col)) throw Object.assign(new Error(`bad column ${col}`), { status: 400 });
    const dot = raw.indexOf('.');
    const op = raw.slice(0, dot);
    const val = raw.slice(dot + 1);
    const ops = { eq: '=', gt: '>', gte: '>=', lt: '<', lte: '<=', neq: '<>' };
    if (op === 'in') {
      args.push(parseIn(val));
      where.push(`${col}::text = any($${args.length}::text[])`);
    } else if (op === 'is') {
      where.push(`${col} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`);
    } else if (ops[op]) {
      args.push(val);
      where.push(`${col} ${ops[op]} $${args.length}`);
    } else throw Object.assign(new Error(`unsupported operator ${op}`), { status: 400 });
  }
  return where.length ? ` where ${where.join(' and ')}` : '';
}
function pgError(res, e) {
  const code = e.code || '';
  const status = e.status || (code === '42501' ? 403 : ['23514', '23502', '22P02', '23505', '22023'].includes(code) ? 400 : code === '23503' ? 409 : 500);
  send(res, status, { code, message: e.message, details: e.detail ?? null, hint: null });
}
async function asRole(c, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`set local role ${c?.sub ? 'authenticated' : 'anon'}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [c?.sub ?? '']);
    return fn(tx);
  });
}
const tableCols = async (table) => (await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`, [table])).rows.map((r) => r.column_name);

async function rest(req, res, url, body) {
  const c = claims(req);
  if (c?.expired) return send(res, 401, { code: 'PGRST303', message: 'JWT expired', details: null, hint: null });
  if (failNext > 0) {
    failNext--;
    return send(res, 503, { code: 'PGRST000', message: 'Service temporarily unavailable (test)', details: null, hint: null });
  }
  const [, , , name, fn] = url.pathname.split('/'); // /rest/v1/<table> or /rest/v1/rpc/<fn>
  if (name === 'rpc') {
    try {
      if (fn === 'ambertube_my_usage') {
        const r = await asRole(c, (tx) => tx.query('select public.ambertube_my_usage() as u'));
        return send(res, 200, r.rows[0].u);
      }
      if (fn !== 'ambertube_prune_my_history') return send(res, 404, { code: 'PGRST202', message: 'function not found' });
      await asRole(c, (tx) => tx.query('select public.ambertube_prune_my_history($1)', [Number(body?.keep_days ?? 180)]));
      return send(res, 204);
    } catch (e) {
      return pgError(res, e);
    }
  }
  if (!TABLES.has(name)) return send(res, 404, { code: 'PGRST205', message: `Could not find the table 'public.${name}' in the schema cache`, details: null, hint: null });
  const params = [...url.searchParams.entries()];
  const args = [];
  try {
    if (req.method === 'GET') {
      const where = filters(params, args);
      const order = url.searchParams.get('order');
      let sql = `select * from public.${name}${where}`;
      if (order) {
        const parts = order.split(',').map((p) => { const [col, dir] = p.split('.'); if (!IDENT.test(col)) throw new Error('bad order'); return `${col} ${dir === 'desc' ? 'desc' : 'asc'}`; });
        sql += ` order by ${parts.join(', ')}`;
      }
      if (url.searchParams.get('limit')) sql += ` limit ${Number(url.searchParams.get('limit'))}`;
      if (url.searchParams.get('offset')) sql += ` offset ${Number(url.searchParams.get('offset'))}`;
      const r = await asRole(c, (tx) => tx.query(sql, args));
      return send(res, 200, r.rows);
    }
    if (req.method === 'POST') {
      const rows = Array.isArray(body) ? body : [body];
      const known = new Set(await tableCols(name));
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      if (cols.some((k) => !known.has(k))) return send(res, 400, { code: 'PGRST204', message: `Could not find a column in the schema cache` });
      const oc = (url.searchParams.get('on_conflict') || '').split(',').filter(Boolean);
      if (oc.some((k) => !IDENT.test(k))) throw new Error('bad on_conflict');
      const list = cols.join(', ');
      let sql = `insert into public.${name} (${list}) select ${list} from json_populate_recordset(null::public.${name}, $1::json)`;
      const prefer = String(req.headers.prefer || '');
      if (oc.length) {
        const upd = cols.filter((k) => !oc.includes(k));
        sql += prefer.includes('ignore-duplicates') || !upd.length ? ` on conflict (${oc.join(', ')}) do nothing` : ` on conflict (${oc.join(', ')}) do update set ${upd.map((k) => `${k} = excluded.${k}`).join(', ')}`;
      }
      await asRole(c, (tx) => tx.query(sql, [JSON.stringify(rows.map((r) => Object.fromEntries(cols.map((k) => [k, r[k] ?? null]))))]));
      return send(res, 201);
    }
    if (req.method === 'PATCH') {
      const cols = Object.keys(body || {});
      if (!cols.length || cols.some((k) => !IDENT.test(k))) throw Object.assign(new Error('bad body'), { status: 400 });
      args.push(JSON.stringify(body));
      const where = filters(params, args);
      await asRole(c, (tx) => tx.query(`update public.${name} set (${cols.join(', ')}) = (select ${cols.join(', ')} from json_populate_record(null::public.${name}, $1::json))${where}`, args));
      return send(res, 204);
    }
    if (req.method === 'DELETE') {
      const where = filters(params, args);
      if (!where) throw Object.assign(new Error('DELETE requires a filter'), { status: 400 });
      await asRole(c, (tx) => tx.query(`delete from public.${name}${where}`, args));
      return send(res, 204);
    }
    return send(res, 405, { message: 'method not allowed' });
  } catch (e) {
    return pgError(res, e);
  }
}

// ---------- auth ----------
async function auth(req, res, url, body) {
  const path = url.pathname.replace('/auth/v1', '');
  if (path === '/settings') return send(res, 200, { external: { email: true, google: false, phone: false }, disable_signup: false, mailer_autoconfirm: true });
  if (path === '/signup' && req.method === 'POST') {
    const email = String(body.email || '').toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return authErr(res, 400, 'Unable to validate email address: invalid format', 'validation_failed');
    if (String(body.password || '').length < 8) return authErr(res, 422, 'Password should be at least 8 characters.', 'weak_password');
    if (users.has(email)) return authErr(res, 422, 'User already registered', 'user_already_exists');
    const u = { id: randomUUID(), email, password: body.password, meta: body.data || {}, confirmedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
    users.set(email, u);
    await createUser(db, u.id, email, u.meta);
    return send(res, 200, session(u));
  }
  if (path === '/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const u = users.get(String(body.email || '').toLowerCase());
      if (!u || u.password !== body.password) return authErr(res, 400, 'Invalid login credentials', 'invalid_credentials');
      return send(res, 200, session(u));
    }
    if (grant === 'refresh_token') {
      const id = refresh.get(body.refresh_token);
      if (!id) return authErr(res, 400, 'Invalid Refresh Token: Refresh Token Not Found', 'refresh_token_not_found');
      refresh.delete(body.refresh_token);
      return send(res, 200, session(byId(id)));
    }
    if (grant === 'pkce') {
      const p = pkce.get(body.auth_code);
      if (!p) return authErr(res, 400, 'invalid flow state, no valid flow state found', 'flow_state_not_found');
      pkce.delete(body.auth_code);
      return send(res, 200, { ...session(byId(p.userId)), redirect_type: p.type });
    }
    return authErr(res, 400, 'unsupported grant type', 'validation_failed');
  }
  const c = claims(req);
  if (path === '/user') {
    if (!c?.sub) return authErr(res, 401, 'invalid JWT', 'bad_jwt');
    const u = byId(c.sub);
    if (req.method === 'PUT') {
      if (body.password) {
        if (String(body.password).length < 8) return authErr(res, 422, 'Password should be at least 8 characters.', 'weak_password');
        u.password = body.password;
      }
      if (body.data) u.meta = { ...u.meta, ...body.data };
    }
    return send(res, 200, publicUser(u));
  }
  if (path === '/logout') {
    if (c?.sub) for (const [t, id] of refresh) if (id === c.sub) refresh.delete(t);
    return send(res, 204);
  }
  if (path === '/recover') {
    const u = users.get(String(body.email || '').toLowerCase());
    if (u) {
      const code = randomUUID();
      pkce.set(code, { userId: u.id, type: 'recovery' });
      recovery.set(u.email, code);
    }
    return send(res, 200, {});
  }
  return authErr(res, 404, 'not found', 'not_found');
}

// ---------- test hooks ----------
async function hooks(req, res, url, body) {
  const p = url.pathname;
  if (p === '/__test/expire') {
    const u = users.get(String(body.email).toLowerCase());
    if (u) {
      notBefore.set(u.id, Math.floor(Date.now() / 1000) + 1);
      for (const [t, id] of refresh) if (id === u.id) refresh.delete(t);
    }
    return send(res, 200, { ok: Boolean(u) });
  }
  if (p === '/__test/fail') { failNext = Number(body.count || 1); return send(res, 200, { failNext }); }
  if (p === '/__test/reset') {
    db = await createDb(); users.clear(); refresh.clear(); notBefore.clear(); recovery.clear(); pkce.clear(); failNext = 0; log.length = 0;
    return send(res, 200, { ok: true });
  }
  if (p === '/__test/recovery') return send(res, 200, { code: recovery.get(String(url.searchParams.get('email')).toLowerCase()) ?? null });
  if (p.startsWith('/__test/rows/')) {
    const t = p.split('/').pop();
    if (!TABLES.has(t)) return send(res, 404, {});
    return send(res, 200, (await db.query(`select * from public.${t} order by updated_at`)).rows);
  }
  if (p === '/__test/log') return send(res, 200, log);
  return send(res, 404, {});
}

const server = http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', req.headers.origin || '*');
  res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('access-control-allow-headers', 'authorization, apikey, content-type, x-client-info, prefer, accept-profile, content-profile, x-supabase-api-version, range');
  res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('access-control-expose-headers', 'content-range');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  let body = {};
  try {
    body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  } catch {
    return send(res, 400, { message: 'invalid JSON' });
  }
  log.push(`${req.method} ${url.pathname}${url.search}`);
  if (!req.headers.apikey && !url.pathname.startsWith('/__test')) return send(res, 401, { message: 'No API key found in request' });
  try {
    if (url.pathname.startsWith('/rest/v1/')) return await rest(req, res, url, body);
    if (url.pathname.startsWith('/auth/v1/')) return await auth(req, res, url, body);
    if (url.pathname.startsWith('/__test/')) return await hooks(req, res, url, body);
    if (url.pathname.startsWith('/realtime/')) return send(res, 404, { message: 'realtime not available in the fake server' });
    return send(res, 404, { message: 'not found' });
  } catch (e) {
    return send(res, 500, { message: String(e?.message || e) });
  }
});
server.listen(PORT, () => console.log(`fake supabase on http://localhost:${PORT}`));
