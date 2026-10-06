import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { connect } from './db';
import { User, Client, Project, Module, Task, Audit, nextSeq } from './models';
import { ROLES, PROJECT_STATUSES, TASK_STATUSES, PRIORITIES, TASK_TYPES, CLIENT_STATUSES, BILLING_TYPES, RISK_LEVELS, MODULE_STATUSES } from './constants';

export class AppError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const isAdmin = (u) => ['super_admin', 'admin'].includes(u.role);
const S = (v) => (v == null ? v : String(v));
const idOf = (v) => S(v && v._id ? v._id : v);
const OID = (v) => new mongoose.Types.ObjectId(String(v));
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pad = (n, l) => String(n).padStart(l, '0');
const noAI = (ctx) => { if (ctx.via === 'ai') throw new AppError(403, 'AI assistant is not permitted to delete or archive anything.'); };
const need = (cond, msg = 'Forbidden', status = 403) => { if (!cond) throw new AppError(status, msg); };

function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) throw new AppError(400, r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
  return r.data;
}
const blank = (v) => (v === '' || v === undefined ? undefined : v);
const optStr = z.preprocess(blank, z.string().trim().optional());
const optDate = z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullable().optional());
const optId = z.preprocess((v) => (v === '' ? null : v), z.string().nullable().optional());
const optNum = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().min(0).optional());
const en = (arr) => z.enum(arr);
const addr = z.object({ line1: optStr, line2: optStr, city: optStr, state: optStr, country: optStr, pincode: optStr }).partial().optional();

export async function audit(ctx, action, entity, entityId, summary) {
  try { await Audit.create({ user: ctx.user.id, action, entity, entityId: S(entityId), summary, via: ctx.via || 'ui' }); } catch {}
}

/* ---------------- scopes ---------------- */
function projectScope(u) {
  if (isAdmin(u)) return { archived: { $ne: true } };
  return { archived: { $ne: true }, $or: [{ manager: u.id }, { teamLeads: u.id }, { employees: u.id }] };
}
async function taskScope(u) {
  if (isAdmin(u)) return {};
  const ps = await Project.find({ archived: { $ne: true }, $or: [{ manager: u.id }, { teamLeads: u.id }] }).select('_id');
  return { $or: [{ project: { $in: ps.map((p) => p._id) } }, { assignee: OID(u.id) }] };
}
const isPM = (u, p) => isAdmin(u) || S(p.manager) === u.id || idOf(p.manager) === u.id;
const isTL = (u, p) => (p.teamLeads || []).some((x) => idOf(x) === u.id);
const isMember = (p, uid) => [p.manager, ...(p.teamLeads || []), ...(p.employees || [])].some((x) => x && idOf(x) === String(uid));

// Who may receive tasks from this user in this project (single source of truth for UI + API + AI).
function assignableList(u, p) {
  const mgr = idOf(p.manager);
  const all = [p.manager, ...(p.teamLeads || []), ...(p.employees || [])].filter(Boolean);
  let list = [];
  if (isAdmin(u)) list = all;
  else if (isPM(u, p)) list = all.filter((x) => idOf(x) !== mgr && idOf(x) !== u.id);
  else if (isTL(u, p)) list = [...(p.employees || []), ...(p.teamLeads || []).filter((x) => idOf(x) === u.id)];
  const seen = new Set();
  return list.filter((x) => { const k = idOf(x); if (seen.has(k)) return false; seen.add(k); return true; });
}
const assignableIds = (u, p) => assignableList(u, p).map(idOf);

async function findProject(ctx, idOrCode, { populate = false } = {}) {
  if (!idOrCode) throw new AppError(400, 'projectId is required');
  const q = mongoose.isValidObjectId(idOrCode) ? { _id: idOrCode } : { code: String(idOrCode).toUpperCase() };
  let query = Project.findOne({ ...q, ...projectScope(ctx.user) });
  if (populate) query = query.populate('client', 'name code industry').populate('manager teamLeads employees', 'name email role designation');
  const p = await query;
  if (!p) throw new AppError(404, 'Project not found or no access');
  return p;
}
async function resolveUser(v, roles) {
  if (!v) return null;
  const u = mongoose.isValidObjectId(v) ? await User.findById(v) : await User.findOne({ email: String(v).toLowerCase() });
  if (!u || !u.active) throw new AppError(400, `User not found or inactive: ${v}`);
  if (roles && !roles.includes(u.role)) throw new AppError(400, `${u.name} has role ${u.role}; expected ${roles.join('/')}`);
  return u;
}

/* ---------------- users ---------------- */
const userSchema = z.object({
  name: z.string().trim().min(2), email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).optional(), role: en(ROLES).default('employee'),
  phone: optStr, designation: optStr, department: optStr, employeeId: optStr,
});
export async function listUsers(ctx, { q, role, active } = {}) {
  const u = ctx.user;
  need(isAdmin(u) || ['manager', 'team_lead'].includes(u.role));
  const f = {};
  if (role) f.role = role;
  if (!isAdmin(u)) { f.active = true; f.role = role || { $in: ['manager', 'team_lead', 'employee'] }; }
  else if (active !== undefined && active !== '') f.active = active === 'true' || active === true;
  if (q) f.$or = [{ name: new RegExp(esc(q), 'i') }, { email: new RegExp(esc(q), 'i') }];
  return User.find(f).select(isAdmin(u) ? '' : 'name email role designation').sort({ name: 1 }).limit(500);
}
export async function createUser(ctx, data) {
  need(isAdmin(ctx.user));
  const d = parse(userSchema, data);
  if (await User.findOne({ email: d.email })) throw new AppError(409, 'A user with this email already exists');
  const generated = !d.password;
  const password = d.password || crypto.randomBytes(9).toString('base64url') + '#1';
  const { password: _p, ...rest } = d;
  const user = await User.create({ ...rest, passwordHash: await bcrypt.hash(password, 12), createdBy: ctx.user.id });
  await audit(ctx, 'create', 'user', user.id, `Created ${d.role} ${d.name} (${d.email})`);
  return { user, ...(generated ? { tempPassword: password } : {}) };
}
export async function updateUser(ctx, id, data) {
  need(isAdmin(ctx.user));
  const user = await User.findById(id);
  if (!user) throw new AppError(404, 'User not found');
  if (user.role === 'super_admin' && ctx.user.role !== 'super_admin') throw new AppError(403, 'Only a super admin can modify a super admin');
  const d = parse(userSchema.partial(), data);
  if (d.email && d.email !== user.email && (await User.findOne({ email: d.email }))) throw new AppError(409, 'Email already in use');
  const active = data.active;
  if (id === ctx.user.id && (d.role && d.role !== user.role || active === false)) throw new AppError(400, 'You cannot change your own role or deactivate yourself');
  if (user.role === 'super_admin' && ((d.role && d.role !== 'super_admin') || active === false)) {
    if ((await User.countDocuments({ role: 'super_admin', active: true })) <= 1) throw new AppError(400, 'At least one active super admin is required');
  }
  const { password, ...rest } = d;
  Object.assign(user, rest);
  if (typeof active === 'boolean') user.active = active;
  if (password) user.passwordHash = await bcrypt.hash(password, 12);
  await user.save();
  await audit(ctx, 'update', 'user', id, `Updated user ${user.name}`);
  return user;
}
export async function deactivateUser(ctx, id) {
  noAI(ctx); return updateUser(ctx, id, { active: false });
}

/* ---------------- clients ---------------- */
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const clientSchema = z.object({
  name: z.string().trim().min(2), industry: optStr, contactPerson: z.string().trim().min(2),
  designation: optStr, email: z.string().trim().toLowerCase().email(), phone: z.string().trim().min(7),
  altPhone: optStr, website: optStr,
  gstin: z.preprocess(blank, z.string().trim().toUpperCase().regex(GSTIN, 'Invalid GSTIN').optional()),
  pan: z.preprocess(blank, z.string().trim().toUpperCase().regex(PAN, 'Invalid PAN').optional()),
  cin: optStr, address: addr, billingAddress: addr, status: en(CLIENT_STATUSES).default('active'),
  accountManager: optId, contractStart: optDate, contractEnd: optDate, paymentTerms: optStr,
  currency: optStr, notes: optStr, tags: z.array(z.string()).optional(),
});
export async function listClients(ctx, { q, status } = {}) {
  const f = { archived: { $ne: true } };
  if (!isAdmin(ctx.user)) { const ids = await Project.distinct('client', projectScope(ctx.user)); f._id = { $in: ids }; }
  if (status) f.status = status;
  if (q) f.$or = [{ name: new RegExp(esc(q), 'i') }, { contactPerson: new RegExp(esc(q), 'i') }, { code: new RegExp(esc(q), 'i') }];
  const clients = await Client.find(f).populate('accountManager', 'name').sort({ name: 1 }).limit(500);
  const counts = await Project.aggregate([{ $match: { archived: { $ne: true }, client: { $in: clients.map((c) => c._id) } } }, { $group: { _id: '$client', n: { $sum: 1 } } }]);
  const map = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  return clients.map((c) => ({ ...c.toJSON(), projectCount: map[String(c._id)] || 0 }));
}
export async function getClient(ctx, id) {
  const c = await Client.findOne({ _id: id, archived: { $ne: true } }).populate('accountManager', 'name email');
  if (!c) throw new AppError(404, 'Client not found');
  if (!isAdmin(ctx.user)) { const ids = (await Project.distinct('client', projectScope(ctx.user))).map(String); need(ids.includes(String(c._id))); }
  const projects = await Project.find({ client: c._id, archived: { $ne: true }, ...(isAdmin(ctx.user) ? {} : projectScope(ctx.user)) }).select('code name status endDate');
  return { ...c.toJSON(), projects };
}
export async function createClient(ctx, data) {
  need(isAdmin(ctx.user));
  const d = parse(clientSchema, data);
  const c = await Client.create({ ...d, code: 'CLT-' + pad(await nextSeq('client'), 4), createdBy: ctx.user.id });
  await audit(ctx, 'create', 'client', c.id, `Created client ${c.name} (${c.code})`);
  return c;
}
export async function updateClient(ctx, idOrCode, data) {
  need(isAdmin(ctx.user));
  const c = await findClient(idOrCode);
  const d = parse(clientSchema.partial(), data);
  Object.assign(c, d); await c.save();
  await audit(ctx, 'update', 'client', c.id, `Updated client ${c.name}`);
  return c;
}
async function findClient(v) {
  const c = mongoose.isValidObjectId(v) ? await Client.findById(v) : await Client.findOne({ code: String(v).toUpperCase() });
  if (!c || c.archived) throw new AppError(404, 'Client not found');
  return c;
}
export async function deleteClient(ctx, id) {
  noAI(ctx); need(isAdmin(ctx.user));
  const c = await findClient(id);
  if (await Project.exists({ client: c._id, archived: { $ne: true } })) throw new AppError(400, 'Client has active projects; archive those first');
  c.archived = true; await c.save();
  await audit(ctx, 'archive', 'client', c.id, `Archived client ${c.name}`);
  return { ok: true };
}

/* ---------------- projects ---------------- */
const projectSchema = z.object({
  name: z.string().trim().min(2), client: z.string().min(1), description: optStr, category: optStr, poNumber: optStr,
  status: en(PROJECT_STATUSES).default('planning'), priority: en(PRIORITIES).default('medium'),
  riskLevel: en(RISK_LEVELS).default('low'), billingType: en(BILLING_TYPES).default('fixed_price'),
  startDate: z.coerce.date(), endDate: z.coerce.date(), budget: optNum, currency: optStr,
  manager: optId, tags: z.array(z.string()).optional(),
});
async function progressMap(ids) {
  const rows = await Task.aggregate([{ $match: { archived: { $ne: true }, project: { $in: ids } } }, { $group: { _id: { p: '$project', s: '$status' }, n: { $sum: 1 } } }]);
  const m = {};
  for (const r of rows) { const k = String(r._id.p); m[k] = m[k] || { total: 0, done: 0 }; m[k].total += r.n; if (r._id.s === 'done') m[k].done += r.n; }
  return m;
}
export async function listProjects(ctx, { q, status, client } = {}) {
  const f = projectScope(ctx.user);
  if (status) f.status = status;
  if (client) f.client = client;
  if (q) { const r = new RegExp(esc(q), 'i'); f.$and = [{ $or: [{ name: r }, { code: r }] }]; }
  const ps = await Project.find(f).populate('client', 'name code').populate('manager', 'name').sort({ createdAt: -1 }).limit(500);
  const pm = await progressMap(ps.map((p) => p._id));
  return ps.map((p) => { const s = pm[String(p._id)] || { total: 0, done: 0 }; return { ...p.toJSON(), taskTotal: s.total, taskDone: s.done, progress: s.total ? Math.round((s.done / s.total) * 100) : 0 }; });
}
export async function getProject(ctx, idOrCode) {
  const p = await findProject(ctx, idOrCode, { populate: true });
  const modules = await Module.find({ project: p._id, archived: { $ne: true } }).populate('lead', 'name').sort({ createdAt: 1 });
  const tr = await Task.aggregate([{ $match: { archived: { $ne: true }, project: p._id } }, { $group: { _id: { m: '$module', s: '$status' }, n: { $sum: 1 } } }]);
  const byStatus = {}; const byMod = {};
  for (const r of tr) { byStatus[r._id.s] = (byStatus[r._id.s] || 0) + r.n; const k = String(r._id.m || 'none'); byMod[k] = byMod[k] || { total: 0, done: 0 }; byMod[k].total += r.n; if (r._id.s === 'done') byMod[k].done += r.n; }
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return {
    ...p.toJSON(),
    modules: modules.map((m) => { const s = byMod[String(m._id)] || { total: 0, done: 0 }; return { ...m.toJSON(), taskTotal: s.total, taskDone: s.done, progress: s.total ? Math.round((s.done / s.total) * 100) : 0 }; }),
    taskStats: { total, byStatus, done: byStatus.done || 0, progress: total ? Math.round(((byStatus.done || 0) / total) * 100) : 0 },
    myAccess: { canManage: isPM(ctx.user, p), canAssign: isPM(ctx.user, p) || isTL(ctx.user, p), isAdmin: isAdmin(ctx.user) },
    assignable: assignableList(ctx.user, p).map((x) => ({ id: idOf(x), name: x.name, role: x.role })),
  };
}
export async function createProject(ctx, data) {
  need(isAdmin(ctx.user));
  const d = parse(projectSchema, data);
  if (d.endDate < d.startDate) throw new AppError(400, 'End date cannot be before start date');
  await findClient(d.client);
  const mgr = d.manager ? await resolveUser(d.manager, ['manager']) : null;
  const p = await Project.create({ ...d, manager: mgr?._id, code: 'PRJ-' + pad(await nextSeq('project'), 4), createdBy: ctx.user.id });
  await audit(ctx, 'create', 'project', p.id, `Created project ${p.name} (${p.code})`);
  return p;
}
export async function updateProject(ctx, idOrCode, data) {
  const p = await findProject(ctx, idOrCode);
  need(isPM(ctx.user, p), 'Only admins or the project manager can edit this project');
  let d = parse(projectSchema.partial(), data);
  if (!isAdmin(ctx.user)) { const { description, status, priority, endDate, tags, riskLevel, category } = d; d = Object.fromEntries(Object.entries({ description, status, priority, endDate, tags, riskLevel, category }).filter(([, v]) => v !== undefined)); }
  if (d.manager !== undefined) { const m = d.manager ? await resolveUser(d.manager, ['manager']) : null; d.manager = m?._id || null; }
  if (d.client) await findClient(d.client);
  Object.assign(p, d);
  if (p.endDate < p.startDate) throw new AppError(400, 'End date cannot be before start date');
  await p.save();
  await audit(ctx, 'update', 'project', p.id, `Updated project ${p.name}`);
  return p;
}
export async function setProjectTeam(ctx, idOrCode, { manager, teamLeads, employees } = {}) {
  const p = await findProject(ctx, idOrCode);
  need(isPM(ctx.user, p), 'Only admins or the project manager can change the team');
  if (manager !== undefined) {
    need(isAdmin(ctx.user), 'Only an admin can assign the project manager');
    p.manager = manager ? (await resolveUser(manager, ['manager']))._id : null;
  }
  const many = async (arr, roles) => { const out = []; for (const v of [...new Set(arr)]) out.push((await resolveUser(v, roles))._id); return out; };
  if (teamLeads) p.teamLeads = await many(teamLeads, ['team_lead']);
  if (employees) p.employees = await many(employees, ['employee', 'team_lead']);
  await p.save();
  await audit(ctx, 'assign', 'project', p.id, `Updated team of ${p.name}`);
  return getProject(ctx, p.id);
}
export async function deleteProject(ctx, id) {
  noAI(ctx); need(isAdmin(ctx.user));
  const p = await findProject(ctx, id);
  p.archived = true; await p.save();
  await audit(ctx, 'archive', 'project', p.id, `Archived project ${p.name}`);
  return { ok: true };
}

/* ---------------- modules ---------------- */
const moduleSchema = z.object({
  name: z.string().trim().min(2), description: optStr, status: en(MODULE_STATUSES).default('not_started'),
  lead: optId, startDate: optDate, endDate: optDate,
});
export async function createModule(ctx, projectId, data) {
  const p = await findProject(ctx, projectId);
  need(isPM(ctx.user, p), 'Only admins or the project manager can create modules');
  const d = parse(moduleSchema, data);
  if (d.lead) { need(isMember(p, d.lead), 'Module lead must be a project member'); }
  const m = await Module.create({ ...d, lead: d.lead || undefined, project: p._id, createdBy: ctx.user.id });
  await audit(ctx, 'create', 'module', m.id, `Created module ${m.name} in ${p.code}`);
  return m;
}
export async function updateModule(ctx, id, data) {
  const m = await Module.findById(id); if (!m || m.archived) throw new AppError(404, 'Module not found');
  const p = await findProject(ctx, m.project);
  need(isPM(ctx.user, p) || (isTL(ctx.user, p) && idOf(m.lead) === ctx.user.id), 'Not allowed to edit this module');
  const d = parse(moduleSchema.partial(), data);
  if (d.lead) need(isMember(p, d.lead), 'Module lead must be a project member');
  Object.assign(m, d); await m.save();
  await audit(ctx, 'update', 'module', m.id, `Updated module ${m.name}`);
  return m;
}
export async function deleteModule(ctx, id) {
  noAI(ctx);
  const m = await Module.findById(id); if (!m) throw new AppError(404, 'Module not found');
  const p = await findProject(ctx, m.project);
  need(isPM(ctx.user, p));
  m.archived = true; await m.save();
  await Task.updateMany({ module: m._id }, { $unset: { module: 1 } });
  await audit(ctx, 'archive', 'module', m.id, `Archived module ${m.name}`);
  return { ok: true };
}

/* ---------------- tasks ---------------- */
const taskSchema = z.object({
  title: z.string().trim().min(2), description: optStr, module: optId, assignee: optId,
  type: en(TASK_TYPES).default('feature'), priority: en(PRIORITIES).default('medium'),
  status: en(TASK_STATUSES).default('todo'), dueDate: optDate, estimatedHours: optNum,
});
const taskPop = (q) => q.populate('assignee', 'name role').populate('project', 'name code').populate('module', 'name');
export async function listTasks(ctx, f = {}) {
  const and = [{ archived: { $ne: true } }];
  const sc = await taskScope(ctx.user); if (Object.keys(sc).length) and.push(sc);
  if (f.project) { const p = await findProject(ctx, f.project); and.push({ project: p._id }); }
  if (f.module) and.push({ module: f.module });
  if (f.assignee) { const a = f.assignee === 'me' ? ctx.user.id : (await resolveUser(f.assignee))._id; and.push({ assignee: a }); }
  if (f.status) and.push({ status: Array.isArray(f.status) ? { $in: f.status } : f.status });
  if (f.priority) and.push({ priority: f.priority });
  if (f.overdue === true || f.overdue === 'true') and.push({ dueDate: { $lt: new Date() }, status: { $ne: 'done' } });
  if (f.q) { const r = new RegExp(esc(f.q), 'i'); and.push({ $or: [{ title: r }, { code: r }] }); }
  return taskPop(Task.find({ $and: and }).select('-comments -timeLogs').sort({ updatedAt: -1 }).limit(Math.min(Number(f.limit) || 300, 500)));
}
async function taskAccess(ctx, id) {
  const t = await Task.findById(id); if (!t || t.archived) throw new AppError(404, 'Task not found');
  const p = await findProject(ctx, t.project, { populate: true }).catch(() => null);
  const mine = idOf(t.assignee) === ctx.user.id;
  if (!p && !mine) throw new AppError(404, 'Task not found');
  const pm = p ? isPM(ctx.user, p) : isAdmin(ctx.user);
  const tl = p ? isTL(ctx.user, p) : false;
  if (!isAdmin(ctx.user) && !pm && !tl && !mine) throw new AppError(403, 'No access to this task');
  return { t, p, perms: { canEdit: pm || tl, canStatus: pm || tl || mine, canComment: true, canLog: pm || tl || mine } };
}
export async function getTask(ctx, id) {
  const { t, p, perms } = await taskAccess(ctx, id);
  await t.populate([{ path: 'assignee', select: 'name role' }, { path: 'assignedBy', select: 'name' }, { path: 'project', select: 'name code' }, { path: 'module', select: 'name' }, { path: 'comments.user', select: 'name role' }, { path: 'timeLogs.user', select: 'name' }]);
  const members = p ? assignableList(ctx.user, p).map((u) => ({ id: idOf(u), name: u.name, role: u.role })) : [];
  if (t.assignee && !members.some((m) => m.id === idOf(t.assignee))) members.push({ id: idOf(t.assignee), name: t.assignee.name, role: t.assignee.role }); // keep current assignee visible
  const modules = p ? await Module.find({ project: p._id, archived: { $ne: true } }).select('name') : [];
  return { ...t.toJSON(), perms, members, modules };
}
export async function createTask(ctx, projectId, data, { ai = false } = {}) {
  const p = await findProject(ctx, projectId);
  need(isPM(ctx.user, p) || isTL(ctx.user, p), 'Only admins, the project manager or team leads can create tasks');
  const d = parse(taskSchema, data);
  if (d.module) { const m = await Module.findOne({ _id: d.module, project: p._id, archived: { $ne: true } }); if (!m) throw new AppError(400, 'Module does not belong to this project'); }
  if (d.assignee) need(assignableIds(ctx.user, p).includes(String(d.assignee)), 'You cannot assign tasks to this user. Managers assign to team leads and employees; admins can also assign to the manager.', 403);
  const t = await Task.create({ ...d, module: d.module || undefined, assignee: d.assignee || undefined, project: p._id, code: 'TSK-' + pad(await nextSeq('task'), 5), assignedBy: ctx.user.id, createdBy: ctx.user.id, createdByAI: ai || ctx.via === 'ai' });
  await audit(ctx, 'create', 'task', t.id, `Created task ${t.code}: ${t.title}`);
  return taskPop(Task.findById(t._id));
}
export async function updateTask(ctx, id, data) {
  const { t, p, perms } = await taskAccess(ctx, id);
  const d = parse(taskSchema.partial(), data);
  const keys = Object.keys(d);
  if (!perms.canEdit) {
    need(perms.canStatus && keys.every((k) => k === 'status'), 'You can only update the status of tasks assigned to you');
  }
  if (d.module) { const m = await Module.findOne({ _id: d.module, project: t.project, archived: { $ne: true } }); if (!m) throw new AppError(400, 'Module does not belong to this project'); }
  if (d.assignee && d.assignee !== idOf(t.assignee)) { need(p && assignableIds(ctx.user, p).includes(String(d.assignee)), 'You cannot assign tasks to this user.', 403); t.assignedBy = ctx.user.id; }
  Object.assign(t, d);
  if (d.status) t.completedAt = d.status === 'done' ? new Date() : undefined;
  await t.save();
  await audit(ctx, 'update', 'task', t.id, `Updated task ${t.code} (${keys.join(', ')})`);
  return taskPop(Task.findById(t._id));
}
export async function addComment(ctx, id, text) {
  const { t } = await taskAccess(ctx, id);
  const s = String(text || '').trim(); if (!s) throw new AppError(400, 'Comment is empty');
  t.comments.push({ user: ctx.user.id, text: s.slice(0, 4000), via: ctx.via }); await t.save();
  await audit(ctx, 'comment', 'task', t.id, `Commented on ${t.code}`);
  return getTask(ctx, id);
}
export async function logTime(ctx, id, { hours, note, date } = {}) {
  const { t, perms } = await taskAccess(ctx, id);
  need(perms.canLog);
  const h = Number(hours); if (!(h > 0 && h <= 24)) throw new AppError(400, 'Hours must be between 0 and 24');
  t.timeLogs.push({ user: ctx.user.id, hours: h, note, date: date ? new Date(date) : new Date() });
  t.loggedHours = Math.round((t.loggedHours + h) * 100) / 100; await t.save();
  await audit(ctx, 'log', 'task', t.id, `Logged ${h}h on ${t.code}`);
  return getTask(ctx, id);
}
export async function deleteTask(ctx, id) {
  noAI(ctx);
  const { t, perms } = await taskAccess(ctx, id); need(perms.canEdit);
  t.archived = true; await t.save();
  await audit(ctx, 'archive', 'task', t.id, `Archived task ${t.code}`);
  return { ok: true };
}

/* ---------------- dashboard / audit ---------------- */
export async function dashboard(ctx) {
  const u = ctx.user;
  const projects = await Project.find(projectScope(u)).select('name code status endDate');
  const pids = projects.map((p) => p._id);
  const sc = await taskScope(u);
  const match = { archived: { $ne: true }, ...(Object.keys(sc).length ? sc : {}) };
  const [st, overdue, myOpen, byProject, upcoming] = await Promise.all([
    Task.aggregate([{ $match: match }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Task.countDocuments({ ...match, dueDate: { $lt: new Date() }, status: { $ne: 'done' } }),
    Task.countDocuments({ archived: { $ne: true }, assignee: u.id, status: { $ne: 'done' } }),
    Task.aggregate([{ $match: { ...match, project: { $in: pids } } }, { $group: { _id: { p: '$project', s: '$status' }, n: { $sum: 1 } } }]),
    Task.find({ ...match, assignee: u.id, status: { $ne: 'done' }, dueDate: { $ne: null } }).sort({ dueDate: 1 }).limit(6).populate('project', 'code name'),
  ]);
  const tasksByStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])); st.forEach((r) => (tasksByStatus[r._id] = r.n));
  const projectsByStatus = Object.fromEntries(PROJECT_STATUSES.map((s) => [s, 0])); projects.forEach((p) => projectsByStatus[p.status]++);
  const pm = {}; byProject.forEach((r) => { const k = String(r._id.p); pm[k] = pm[k] || { total: 0, done: 0 }; pm[k].total += r.n; if (r._id.s === 'done') pm[k].done += r.n; });
  const out = {
    counts: { projects: projects.length, activeProjects: projectsByStatus.active, tasks: Object.values(tasksByStatus).reduce((a, b) => a + b, 0), overdue, myOpen },
    tasksByStatus, projectsByStatus, upcoming,
    projectProgress: projects.filter((p) => p.status !== 'cancelled').slice(0, 3).map((p) => { const s = pm[String(p._id)] || { total: 0, done: 0 }; return { id: p.id, code: p.code, name: p.name, status: p.status, total: s.total, done: s.done, pct: s.total ? Math.round((s.done / s.total) * 100) : 0 }; }),
  };
  if (isAdmin(u)) {
    out.counts.clients = await Client.countDocuments({ archived: { $ne: true } });
    out.counts.users = await User.countDocuments({ active: true });
    out.recent = await Audit.find().sort({ createdAt: -1 }).limit(8).populate('user', 'name');
  }
  return out;
}
export async function listAudit(ctx, { limit = 200, entity } = {}) {
  need(isAdmin(ctx.user));
  return Audit.find(entity ? { entity } : {}).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 200, 500)).populate('user', 'name role');
}
export { connect, User, Task, Project, Client, Module };
