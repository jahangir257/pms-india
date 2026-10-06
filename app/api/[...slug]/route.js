import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { ZodError } from 'zod';
import { connect } from '@/lib/db';
import { signToken, verifyToken, COOKIE } from '@/lib/auth';
import * as svc from '@/lib/services';
import { AppError, User, audit } from '@/lib/services';
import { FileDoc } from '@/lib/models';
import { generateReport } from '@/lib/reports';
import { chat, getChatHistory, clearChatHistory } from '@/lib/ai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const table = [];
const add = (m, p, fn, opts = {}) => table.push({ m, segs: p.split('/'), fn, opts });
function match(m, segs) {
  for (const r of table) {
    if (r.m !== m || r.segs.length !== segs.length) continue;
    const params = {}; let ok = true;
    r.segs.forEach((s, i) => { if (s[0] === ':') params[s.slice(1)] = segs[i]; else if (s !== segs[i]) ok = false; });
    if (ok) return { r, params };
  }
}

// naive in-memory login throttle (per instance): 8 failures / 15 min per ip+email
const fails = new Map();
const throttled = (k) => { const a = (fails.get(k) || []).filter((t) => Date.now() - t < 900000); fails.set(k, a); return a.length >= 8; };
const DUMMY = bcrypt.hashSync('not-a-real-password', 10);

add('POST', 'auth/login', async ({ body, req }) => {
  const email = String(body.email || '').trim().toLowerCase();
  const key = (req.headers.get('x-forwarded-for') || 'local') + '|' + email;
  if (throttled(key)) throw new AppError(429, 'Too many failed attempts. Try again in 15 minutes.');
  const user = await User.findOne({ email });
  const ok = await bcrypt.compare(String(body.password || ''), user?.passwordHash || DUMMY);
  if (!user || !ok || !user.active) { fails.set(key, [...(fails.get(key) || []), Date.now()]); throw new AppError(401, 'Invalid email or password'); }
  fails.delete(key);
  user.lastLoginAt = new Date(); await user.save();
  await audit({ user: { id: user.id }, via: 'ui' }, 'login', 'user', user.id, `${user.name} signed in`);
  const res = NextResponse.json({ user });
  res.cookies.set(COOKIE, await signToken(user.id, user.role), { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', path: '/', maxAge: 60 * 60 * 12 });
  return res;
}, { auth: false });
add('POST', 'auth/logout', async () => { const res = NextResponse.json({ ok: true }); res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 }); return res; }, { auth: false });
add('GET', 'auth/me', async ({ ctx }) => ({ user: ctx.dbUser }));
add('POST', 'auth/password', async ({ ctx, body }) => {
  const u = ctx.dbUser;
  if (!(await bcrypt.compare(String(body.current || ''), u.passwordHash))) throw new AppError(400, 'Current password is incorrect');
  if (String(body.next || '').length < 8) throw new AppError(400, 'New password must be at least 8 characters');
  u.passwordHash = await bcrypt.hash(body.next, 12); await u.save();
  await audit(ctx, 'update', 'user', u.id, 'Changed own password');
  return { ok: true };
});

add('GET', 'dashboard', ({ ctx }) => svc.dashboard(ctx));
add('GET', 'users', ({ ctx, query }) => svc.listUsers(ctx, query));
add('POST', 'users', ({ ctx, body }) => svc.createUser(ctx, body));
add('PATCH', 'users/:id', ({ ctx, params, body }) => svc.updateUser(ctx, params.id, body));
add('DELETE', 'users/:id', async ({ ctx, params }) => { await svc.deactivateUser(ctx, params.id); return { ok: true }; });

add('GET', 'clients', ({ ctx, query }) => svc.listClients(ctx, query));
add('POST', 'clients', ({ ctx, body }) => svc.createClient(ctx, body));
add('GET', 'clients/:id', ({ ctx, params }) => svc.getClient(ctx, params.id));
add('PATCH', 'clients/:id', ({ ctx, params, body }) => svc.updateClient(ctx, params.id, body));
add('DELETE', 'clients/:id', ({ ctx, params }) => svc.deleteClient(ctx, params.id));

add('GET', 'projects', ({ ctx, query }) => svc.listProjects(ctx, query));
add('POST', 'projects', ({ ctx, body }) => svc.createProject(ctx, body));
add('GET', 'projects/:id', ({ ctx, params }) => svc.getProject(ctx, params.id));
add('PATCH', 'projects/:id', ({ ctx, params, body }) => svc.updateProject(ctx, params.id, body));
add('DELETE', 'projects/:id', ({ ctx, params }) => svc.deleteProject(ctx, params.id));
add('PUT', 'projects/:id/team', ({ ctx, params, body }) => svc.setProjectTeam(ctx, params.id, body));
add('POST', 'projects/:id/modules', ({ ctx, params, body }) => svc.createModule(ctx, params.id, body));
add('PATCH', 'modules/:id', ({ ctx, params, body }) => svc.updateModule(ctx, params.id, body));
add('DELETE', 'modules/:id', ({ ctx, params }) => svc.deleteModule(ctx, params.id));

add('GET', 'tasks', ({ ctx, query }) => svc.listTasks(ctx, query));
add('POST', 'tasks', ({ ctx, body }) => svc.createTask(ctx, body.project, body));
add('GET', 'tasks/:id', ({ ctx, params }) => svc.getTask(ctx, params.id));
add('PATCH', 'tasks/:id', ({ ctx, params, body }) => svc.updateTask(ctx, params.id, body));
add('DELETE', 'tasks/:id', ({ ctx, params }) => svc.deleteTask(ctx, params.id));
add('POST', 'tasks/:id/comments', ({ ctx, params, body }) => svc.addComment(ctx, params.id, body.text));
add('POST', 'tasks/:id/time', ({ ctx, params, body }) => svc.logTime(ctx, params.id, body));

add('POST', 'reports', ({ ctx, body }) => generateReport(ctx, body));
add('GET', 'audit', ({ ctx, query }) => svc.listAudit(ctx, query));
add('POST', 'ai/chat', ({ ctx, body }) => chat(ctx, body));
add('GET', 'ai/history', ({ ctx, query }) => getChatHistory(ctx, query));
add('DELETE', 'ai/history', ({ ctx }) => clearChatHistory(ctx));
add('GET', 'files/:id', async ({ ctx, params, query }) => {
  const f = await FileDoc.findById(params.id).select('+data');
  if (!f || (String(f.owner) !== ctx.user.id && !svc.isAdmin(ctx.user))) throw new AppError(404, 'File not found');
  const inline = f.mime.startsWith('image/') && query.download !== '1';
  return new Response(f.data, { headers: { 'Content-Type': f.mime, 'Content-Length': String(f.size), 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${f.name.replace(/"/g, '')}"`, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
});

async function handle(req, { params }) {
  try {
    const segs = params.slug; const method = req.method;
    const m = match(method, segs);
    if (!m) throw new AppError(404, 'Not found');
    if (method !== 'GET') { // basic CSRF defence: same-origin only
      const origin = req.headers.get('origin');
      if (origin && new URL(origin).host !== req.headers.get('host')) throw new AppError(403, 'Cross-origin request blocked');
    }
    await connect();
    let ctx = null;
    if (m.r.opts.auth !== false) {
      const token = req.cookies.get(COOKIE)?.value;
      const payload = token ? await verifyToken(token) : null;
      const u = payload ? await User.findById(payload.sub) : null;
      if (!u || !u.active) throw new AppError(401, 'Not authenticated');
      ctx = { user: { id: u.id, name: u.name, email: u.email, role: u.role }, via: 'ui', dbUser: u };
    }
    let body = {};
    if (!['GET', 'DELETE'].includes(method)) { try { body = await req.json(); } catch { body = {}; } }
    const query = Object.fromEntries(req.nextUrl.searchParams);
    const out = await m.r.fn({ ctx, params: m.params, body, query, req });
    if (out instanceof Response) return out;
    return NextResponse.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => i.message).join('; ') }, { status: 400 });
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e?.code === 11000) return NextResponse.json({ error: 'Duplicate value: record already exists' }, { status: 409 });
    if (e?.name === 'CastError' || e?.name === 'ValidationError') return NextResponse.json({ error: 'Invalid data: ' + e.message }, { status: 400 });
    console.error('[api]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
