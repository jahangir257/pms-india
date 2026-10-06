import * as svc from './services';
import { AppError } from './services';
import { generate, generateImageBytes } from './gemini';
import { generateReport, createCustomFile, REPORT_TYPES } from './reports';
import { saveFile } from './files';
import { fileName, fmtDateTime, MIME } from './render';
import { audit } from './services';
import { connect } from './db';
import { ChatMessage } from './models';
import { ROLE_LABEL, PROJECT_STATUSES, TASK_STATUSES, PRIORITIES, TASK_TYPES, ROLES } from './constants';

/*
 * SAFETY: the AI toolset below intentionally contains NO delete / archive / deactivate tool.
 * Every tool runs through the same service layer and permission checks as the UI, using the
 * signed-in user's identity, and the service-layer delete functions additionally reject ctx.via === 'ai'.
 */
const S = 'STRING', N = 'NUMBER', A = 'ARRAY', O = 'OBJECT';
const str = (description, extra = {}) => ({ type: S, description, ...extra });
const tools = [
  { name: 'search_users', description: 'Find users (id, name, email, role). Use to resolve names to ids before assigning.', parameters: { type: O, properties: { query: str('name or email fragment'), role: str('role filter', { enum: ROLES }) } } },
  { name: 'search_clients', description: 'Find clients by name/code/contact.', parameters: { type: O, properties: { query: str('search text') } } },
  { name: 'search_projects', description: 'List/search projects the user can access, with progress.', parameters: { type: O, properties: { query: str('name or code'), status: str('status', { enum: PROJECT_STATUSES }) } } },
  { name: 'get_project', description: 'Full project detail: team, modules, task stats.', parameters: { type: O, properties: { projectId: str('project id or code like PRJ-0001') }, required: ['projectId'] } },
  { name: 'create_client', description: 'Create a client (admin only).', parameters: { type: O, properties: { name: str('company name'), contactPerson: str(''), email: str(''), phone: str(''), industry: str(''), gstin: str('15-char GSTIN'), pan: str('PAN'), city: str(''), state: str(''), pincode: str(''), address: str('address line 1'), website: str(''), paymentTerms: str(''), notes: str('') }, required: ['name', 'contactPerson', 'email', 'phone'] } },
  { name: 'update_client', description: 'Update client fields (admin only).', parameters: { type: O, properties: { clientId: str('id or code'), fields: str('JSON object string of fields to change, e.g. {"status":"done"}. Allowed: fields to change (name, contactPerson, email, phone, industry, status, notes, paymentTerms ...)') }, required: ['clientId', 'fields'] } },
  { name: 'create_project', description: 'Create a project (admin only). Dates ISO yyyy-mm-dd.', parameters: { type: O, properties: { name: str(''), clientId: str('client id or code'), startDate: str('yyyy-mm-dd'), endDate: str('yyyy-mm-dd'), description: str(''), category: str(''), budget: { type: N }, priority: str('', { enum: PRIORITIES }), billingType: str('', { enum: ['fixed_price', 'time_and_material', 'retainer'] }), managerId: str('manager user id/email (optional)') }, required: ['name', 'clientId', 'startDate', 'endDate'] } },
  { name: 'update_project', description: 'Update project fields (admin all; project manager limited).', parameters: { type: O, properties: { projectId: str(''), fields: str('JSON object string of fields to change, e.g. {"status":"done"}. Allowed: status, priority, description, endDate, riskLevel, tags, ...') }, required: ['projectId', 'fields'] } },
  { name: 'assign_project_team', description: 'Set project manager (admin) and/or team leads & employees (admin/manager). Replaces the listed groups. Pass ids or emails.', parameters: { type: O, properties: { projectId: str(''), managerId: str(''), teamLeadIds: { type: A, items: { type: S } }, employeeIds: { type: A, items: { type: S } } }, required: ['projectId'] } },
  { name: 'create_module', description: 'Create a module in a project.', parameters: { type: O, properties: { projectId: str(''), name: str(''), description: str(''), leadId: str('module lead: any project member (manager, team lead or employee). Only admins may pick the manager'), startDate: str(''), endDate: str('') }, required: ['projectId', 'name'] } },
  { name: 'update_module', description: 'Update a module.', parameters: { type: O, properties: { moduleId: str(''), fields: str('JSON object string of fields to change') }, required: ['moduleId', 'fields'] } },
  { name: 'list_tasks', description: 'List tasks with filters. assignee may be "me".', parameters: { type: O, properties: { projectId: str(''), moduleId: str(''), assignee: str(''), status: str('', { enum: TASK_STATUSES }), priority: str('', { enum: PRIORITIES }), overdue: { type: 'BOOLEAN' }, query: str('') } } },
  { name: 'create_task', description: 'Create a task inside a project (optionally module + assignee).', parameters: { type: O, properties: { projectId: str(''), title: str(''), description: str(''), moduleId: str(''), assigneeId: str('project member id/email'), priority: str('', { enum: PRIORITIES }), type: str('', { enum: TASK_TYPES }), dueDate: str('yyyy-mm-dd'), estimatedHours: { type: N } }, required: ['projectId', 'title'] } },
  { name: 'update_task', description: 'Update a task: status, assignee, priority, due date, etc.', parameters: { type: O, properties: { taskId: str('task id'), fields: str('JSON object string of fields to change, e.g. {"status":"done"}. Allowed: title, description, status, priority, assignee (user id), module (id), dueDate, estimatedHours, type') }, required: ['taskId', 'fields'] } },
  { name: 'add_task_comment', description: 'Comment on a task.', parameters: { type: O, properties: { taskId: str(''), text: str('') }, required: ['taskId', 'text'] } },
  { name: 'log_time', description: 'Log worked hours on a task.', parameters: { type: O, properties: { taskId: str(''), hours: { type: N }, note: str('') }, required: ['taskId', 'hours'] } },
  { name: 'create_user', description: 'Create a user account (admin only). If no password is given a temporary one is generated and returned.', parameters: { type: O, properties: { name: str(''), email: str(''), role: str('', { enum: ROLES }), phone: str(''), designation: str(''), department: str('') }, required: ['name', 'email', 'role'] } },
  { name: 'dashboard_summary', description: 'Portfolio KPIs for the signed-in user: counts, task status mix, overdue, progress per project.' },
  { name: 'generate_report', description: `Generate a downloadable standard report. Types: ${Object.entries(REPORT_TYPES).map(([k, v]) => `${k} (${v})`).join(', ')}.`, parameters: { type: O, properties: { type: str('report type', { enum: Object.keys(REPORT_TYPES) }), format: str('', { enum: ['pdf', 'xlsx', 'csv'] }), projectId: str('optional project filter'), status: str('optional status filter') }, required: ['type', 'format'] } },
  { name: 'create_file', description: 'Create ANY custom downloadable file (pdf/xlsx/csv) from content you compose: e.g. meeting minutes, status summary, task export, plan. For csv/xlsx give columns+rows. For pdf give text (markdown-lite: #, ##, - bullets) and/or columns+rows.', parameters: { type: O, properties: { format: str('', { enum: ['pdf', 'xlsx', 'csv'] }), title: str(''), columns: { type: A, items: { type: S } }, rows: { type: A, items: { type: A, items: { type: S } } }, text: str('document body') }, required: ['format', 'title'] } },
  { name: 'generate_image', description: 'Generate an image (illustration, banner, diagram-style graphic, mock visual) from a prompt.', parameters: { type: O, properties: { prompt: str('detailed visual description') }, required: ['prompt'] } },
];

const compact = {
  user: (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, designation: u.designation }),
  task: (t) => ({ id: t.id, code: t.code, title: t.title, status: t.status, priority: t.priority, type: t.type, assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null, project: t.project?.code, module: t.module ? { id: t.module.id, name: t.module.name } : null, dueDate: t.dueDate, estimatedHours: t.estimatedHours, loggedHours: t.loggedHours }),
};
const J = async (v) => {
  let o = v; if (typeof v === 'string') { try { o = JSON.parse(v); } catch { throw new AppError(400, 'fields must be a valid JSON object string'); } }
  if (!o || typeof o !== 'object') throw new AppError(400, 'fields must be an object');
  for (const k of ['assignee', 'manager', 'lead', 'accountManager']) if (typeof o[k] === 'string' && o[k].includes('@')) o[k] = (await svc.User.findOne({ email: o[k].toLowerCase() }))?.id;
  return o;
};
const plain = (x) => JSON.parse(JSON.stringify(x));
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

const handlers = {
  async search_users(a, c) { return (await svc.listUsers(c, { q: a.query, role: a.role })).slice(0, 40).map(compact.user); },
  async search_clients(a, c) { return (await svc.listClients(c, { q: a.query })).slice(0, 30).map((x) => pick(x, ['id', 'code', 'name', 'industry', 'contactPerson', 'email', 'status', 'projectCount'])); },
  async search_projects(a, c) { return (await svc.listProjects(c, { q: a.query, status: a.status })).slice(0, 40).map((p) => ({ id: p.id, code: p.code, name: p.name, client: p.client?.name, manager: p.manager?.name || null, status: p.status, priority: p.priority, endDate: p.endDate, progress: p.progress })); },
  async get_project(a, c) {
    const p = plain(await svc.getProject(c, a.projectId));
    return { id: p.id, code: p.code, name: p.name, client: p.client?.name, status: p.status, priority: p.priority, startDate: p.startDate, endDate: p.endDate, budget: p.budget, manager: p.manager && { id: p.manager.id, name: p.manager.name }, teamLeads: p.teamLeads.map(compact.user), employees: p.employees.map(compact.user), modules: p.modules.map((m) => ({ id: m.id, name: m.name, status: m.status, lead: m.lead?.name, progress: m.progress, tasks: m.taskTotal })), taskStats: p.taskStats, myAccess: p.myAccess };
  },
  async create_client(a, c) {
    const x = await svc.createClient(c, { name: a.name, contactPerson: a.contactPerson, email: a.email, phone: a.phone, industry: a.industry, gstin: a.gstin, pan: a.pan, website: a.website, paymentTerms: a.paymentTerms, notes: a.notes, address: { line1: a.address, city: a.city, state: a.state, pincode: a.pincode } });
    return { id: x.id, code: x.code, name: x.name };
  },
  async update_client(a, c) { const x = await svc.updateClient(c, a.clientId, await J(a.fields)); return { id: x.id, code: x.code, name: x.name, updated: true }; },
  async create_project(a, c) {
    const cl = await svc.listClients(c, { q: a.clientId }); const m = cl.find((x) => x.id === a.clientId || x.code === String(a.clientId).toUpperCase()) || (cl.length === 1 ? cl[0] : null);
    if (!m) throw new AppError(400, 'Client not found; use search_clients first and pass its id or code');
    const x = await svc.createProject(c, { name: a.name, client: m.id, startDate: a.startDate, endDate: a.endDate, description: a.description, category: a.category, budget: a.budget, priority: a.priority, billingType: a.billingType, manager: a.managerId });
    return { id: x.id, code: x.code, name: x.name };
  },
  async update_project(a, c) { const x = await svc.updateProject(c, a.projectId, await J(a.fields)); return { id: x.id, code: x.code, updated: true }; },
  async assign_project_team(a, c) {
    const x = plain(await svc.setProjectTeam(c, a.projectId, { manager: a.managerId, teamLeads: a.teamLeadIds, employees: a.employeeIds }));
    return { code: x.code, manager: x.manager?.name, teamLeads: x.teamLeads.map((u) => u.name), employees: x.employees.map((u) => u.name) };
  },
  async create_module(a, c) { const x = await svc.createModule(c, a.projectId, { name: a.name, description: a.description, lead: a.leadId, startDate: a.startDate, endDate: a.endDate }); return { id: x.id, name: x.name }; },
  async update_module(a, c) { const x = await svc.updateModule(c, a.moduleId, await J(a.fields)); return { id: x.id, name: x.name, updated: true }; },
  async list_tasks(a, c) { return (await svc.listTasks(c, { project: a.projectId, module: a.moduleId, assignee: a.assignee, status: a.status, priority: a.priority, overdue: a.overdue, q: a.query, limit: 60 })).map(compact.task); },
  async create_task(a, c) {
    const x = await svc.createTask(c, a.projectId, { title: a.title, description: a.description, module: a.moduleId, assignee: a.assigneeId && (a.assigneeId.includes('@') ? (await svc.User.findOne({ email: a.assigneeId.toLowerCase() }))?.id : a.assigneeId), priority: a.priority, type: a.type, dueDate: a.dueDate, estimatedHours: a.estimatedHours }, { ai: true });
    return compact.task(x);
  },
  async update_task(a, c) { return compact.task(await svc.updateTask(c, a.taskId, await J(a.fields))); },
  async add_task_comment(a, c) { await svc.addComment(c, a.taskId, a.text); return { ok: true }; },
  async log_time(a, c) { const t = await svc.logTime(c, a.taskId, { hours: a.hours, note: a.note }); return { code: t.code, loggedHours: t.loggedHours }; },
  async create_user(a, c) { const r = await svc.createUser(c, a); return { id: r.user.id, email: r.user.email, role: r.user.role, ...(r.tempPassword ? { tempPassword: r.tempPassword } : {}) }; },
  async dashboard_summary(a, c) { const d = plain(await svc.dashboard(c)); delete d.recent; delete d.upcoming; return d; },
  async generate_report(a, c) { return { ...(await generateReport(c, { type: a.type, format: a.format, projectId: a.projectId, status: a.status })), kind: 'file' }; },
  async create_file(a, c) { return { ...(await createCustomFile(c, a)), kind: 'file' }; },
  async generate_image(a, c) {
    const { buffer, mime } = await generateImageBytes(String(a.prompt).slice(0, 2000));
    const f = await saveFile(c, { name: fileName('ai-image', mime.includes('jpeg') ? 'jpg' : 'png'), mime, buffer, kind: 'image' });
    await audit(c, 'generate', 'image', f.id, 'Generated image');
    return { ...f, kind: 'image' };
  },
};

const systemPrompt = (user) => `You are the built-in AI project operations assistant of PMS India, a project management system for an Indian company.
Signed-in user: ${user.name} (${ROLE_LABEL[user.role]}). Current time: ${fmtDateTime()} (${process.env.APP_TIMEZONE || 'Asia/Kolkata'}).
You act on behalf of this user with exactly their permissions; if a tool returns a permission error, explain it plainly and suggest who can do it.
HARD RULES: You can create and update records, generate reports/files/images, and analyse data. You must NEVER delete, archive, deactivate or remove anything; no such tool exists. If asked to delete, politely refuse and tell the user to do it from the application UI (admins only).
Workflow: resolve names/codes to ids with search tools before writing. Do not invent ids. For bulk or ambiguous requests ask one brief clarifying question; otherwise act. After acting, summarise what changed using codes (PRJ-0001, TSK-00012). Use INR/Indian conventions. When you generate a file or image, say so briefly; the UI shows the download automatically. Keep replies concise, in plain text or light markdown.`;

const toClient = (m) => ({ id: m.id, role: m.role, text: m.text, files: m.files || [], actions: m.actions || [], at: m.createdAt });

export async function getChatHistory(ctx, { limit = 200 } = {}) {
  await connect();
  const rows = await ChatMessage.find({ user: ctx.user.id }).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 200, 500));
  return rows.reverse().map(toClient);
}
export async function clearChatHistory(ctx) {
  await connect();
  const r = await ChatMessage.deleteMany({ user: ctx.user.id });
  return { ok: true, removed: r.deletedCount || 0 };
}

export async function chat(ctx, { message, history = [] }) {
  const text = String(message || '').trim();
  if (!text) throw new AppError(400, 'Message is empty');
  await connect();
  // Conversation context comes from the saved history (survives refresh / navigation); client history is only a fallback.
  const saved = (await ChatMessage.find({ user: ctx.user.id }).sort({ createdAt: -1 }).limit(20)).reverse().map((m) => ({ role: m.role, text: m.text }));
  const prior = saved.length ? saved : (Array.isArray(history) ? history : []).slice(-20);
  const contents = prior.filter((m) => m && m.text).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: String(m.text).slice(0, 6000) }] }));
  contents.push({ role: 'user', parts: [{ text: text.slice(0, 6000) }] });
  const out = await runChat(ctx, contents);
  try {
    await ChatMessage.create({ user: ctx.user.id, role: 'user', text: text.slice(0, 6000) });
    await ChatMessage.create({ user: ctx.user.id, role: 'model', text: String(out.reply || '').slice(0, 20000), files: out.files || [], actions: out.actions || [] });
  } catch (e) { /* history is best-effort; never fail the reply */ }
  return out;
}

async function runChat(ctx, contents) {
  const files = []; const actions = [];
  const aictx = { user: ctx.user, via: 'ai' };
  for (let i = 0; i < 10; i++) {
    const res = await generate({ systemInstruction: { parts: [{ text: systemPrompt(ctx.user) }] }, contents, tools: [{ functionDeclarations: tools }], generationConfig: { temperature: 0.3 } });
    const cand = res.candidates?.[0];
    if (!cand?.content?.parts?.length) { return { reply: res.promptFeedback?.blockReason ? 'That request was blocked by the AI safety filter.' : 'I could not produce a response. Please rephrase.', files, actions }; }
    contents.push(cand.content);
    const calls = cand.content.parts.filter((p) => p.functionCall);
    if (!calls.length) return { reply: cand.content.parts.filter((p) => p.text).map((p) => p.text).join('\n').trim(), files, actions };
    const responses = [];
    for (const { functionCall: fc } of calls) {
      let out;
      try {
        if (!handlers[fc.name]) throw new AppError(400, `Unknown tool ${fc.name}. Deleting is not available to the AI.`);
        out = await handlers[fc.name](fc.args || {}, aictx);
        if (out?.kind === 'file' || out?.kind === 'image') files.push(pick(out, ['id', 'name', 'mime', 'size', 'url', 'kind']));
        actions.push({ tool: fc.name, ok: true });
        out = { result: plain(out) };
      } catch (e) { actions.push({ tool: fc.name, ok: false, error: e.message }); out = { error: e.message || 'failed' }; }
      responses.push({ functionResponse: { name: fc.name, response: out } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return { reply: 'I reached the step limit for this request. Please break it into smaller parts.', files, actions };
}
