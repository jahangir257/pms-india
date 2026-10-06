import { listProjects, listClients, listTasks, listAudit, isAdmin, AppError, audit, Task, Project, User } from './services';
import { renderFile, fileName, fmtDate, fmtDateTime } from './render';
import { saveFile } from './files';
import mongoose from 'mongoose';

export const REPORT_TYPES = {
  projects: 'Project portfolio', tasks: 'Task register', clients: 'Client directory',
  team_workload: 'Team workload', project_health: 'Project health & progress', audit: 'Audit trail (admins only)',
};
const name = (u) => (u && u.name) || '';
const money = (n, c = 'INR') => (n ? `${c} ${Number(n).toLocaleString('en-IN')}` : '');

export async function buildDataset(ctx, { type, projectId, status }) {
  switch (type) {
    case 'projects': {
      const ps = await listProjects(ctx, { status });
      return { title: 'Project Portfolio', columns: ['Code', 'Project', 'Client', 'Manager', 'Status', 'Priority', 'Start', 'End', 'Budget', 'Progress %'],
        rows: ps.map((p) => [p.code, p.name, name(p.client), name(p.manager), p.status, p.priority, fmtDate(p.startDate), fmtDate(p.endDate), money(p.budget, p.currency), p.progress]) };
    }
    case 'tasks': {
      const ts = await listTasks(ctx, { projectId, project: projectId, status, limit: 500 });
      // listTasks omits comments/time logs, so load description + user notes separately
      const extra = await Task.find({ _id: { $in: ts.map((t) => t.id) } }).select('description comments timeLogs')
        .populate('comments.user', 'name').populate('timeLogs.user', 'name').lean();
      const ex = Object.fromEntries(extra.map((e) => [String(e._id), e]));
      const plain = (v) => String(v ?? '').replace(/\r/g, '').replace(/\*\*|__|`/g, '').trim();
      const info = (t) => {
        const e = ex[t.id] || {};
        const notes = (e.comments || []).map((c) => `[${fmtDateTime(c.at)} - ${name(c.user) || 'Unknown'}${c.via === 'ai' ? ' (AI)' : ''}] ${plain(c.text)}`);
        const logs = (e.timeLogs || []).filter((l) => l.note || l.hours).map((l) => `[${fmtDate(l.date)} - ${name(l.user) || 'Unknown'}] ${l.hours || 0}h${l.note ? ' - ' + plain(l.note) : ''}`);
        return { desc: plain(e.description), notes, logs };
      };
      const rows = ts.map((t) => {
        const i = info(t);
        return [t.code, t.title, t.project?.code, name(t.module), name(t.assignee), t.status, t.priority, fmtDate(t.dueDate), t.estimatedHours, t.loggedHours, i.desc, i.notes.join('\n'), i.logs.join('\n')];
      });
      const details = ts.map((t) => {
        const i = info(t);
        const one = (v) => plain(v).replace(/\n+/g, ' ');
        const out = [`## ${t.code} - ${one(t.title)}`,
          `**Project:** ${t.project?.code || '-'}   **Assignee:** ${name(t.assignee) || 'Unassigned'}   **Status:** ${t.status}   **Priority:** ${t.priority}   **Due:** ${fmtDate(t.dueDate) || '-'}`,
          `**Description:** ${one(i.desc) || 'No description'}`];
        out.push(i.notes.length ? '**Task notes:**' : '**Task notes:** none');
        i.notes.forEach((n) => out.push(`- ${one(n)}`));
        if (i.logs.length) { out.push('**Time log notes:**'); i.logs.forEach((n) => out.push(`- ${one(n)}`)); }
        return out.join('\n');
      });
      return { title: 'Task Register', columns: ['Code', 'Task', 'Project', 'Module', 'Assignee', 'Status', 'Priority', 'Due', 'Est. h', 'Logged h', 'Description', 'Task notes', 'Time log notes'], rows,
        pdfColumns: 10, pdfText: ts.length ? '# Task details & notes\n\n' + details.join('\n\n---\n\n') : '' };
    }
    case 'clients': {
      const cs = await listClients(ctx, {});
      return { title: 'Client Directory', columns: ['Code', 'Client', 'Industry', 'Contact', 'Email', 'Phone', 'GSTIN', 'City', 'Status', 'Projects'],
        rows: cs.map((c) => [c.code, c.name, c.industry, c.contactPerson, c.email, c.phone, c.gstin, c.address?.city, c.status, c.projectCount]) };
    }
    case 'team_workload': {
      if (!isAdmin(ctx.user) && !['manager', 'team_lead'].includes(ctx.user.role)) throw new AppError(403, 'Not allowed');
      const ts = await listTasks(ctx, { project: projectId, limit: 500 });
      const m = {};
      for (const t of ts) {
        const k = t.assignee ? t.assignee.id : 'none'; m[k] = m[k] || { name: t.assignee?.name || 'Unassigned', open: 0, prog: 0, done: 0, over: 0, est: 0, log: 0 };
        const r = m[k]; if (t.status === 'done') r.done++; else { r.open++; if (t.status === 'in_progress') r.prog++; if (t.dueDate && t.dueDate < new Date()) r.over++; }
        r.est += t.estimatedHours || 0; r.log += t.loggedHours || 0;
      }
      return { title: 'Team Workload', columns: ['Member', 'Open', 'In progress', 'Done', 'Overdue', 'Estimated h', 'Logged h'],
        rows: Object.values(m).sort((a, b) => b.open - a.open).map((r) => [r.name, r.open, r.prog, r.done, r.over, r.est, r.log]) };
    }
    case 'project_health': {
      const ps = await listProjects(ctx, {});
      const od = await Task.aggregate([{ $match: { archived: { $ne: true }, project: { $in: ps.map((p) => new mongoose.Types.ObjectId(p.id)) }, dueDate: { $lt: new Date() }, status: { $ne: 'done' } } }, { $group: { _id: '$project', n: { $sum: 1 } } }]);
      const om = Object.fromEntries(od.map((o) => [String(o._id), o.n]));
      return { title: 'Project Health', columns: ['Code', 'Project', 'Status', 'Risk', 'Tasks', 'Done', 'Progress %', 'Overdue tasks', 'End date'],
        rows: ps.map((p) => [p.code, p.name, p.status, p.riskLevel, p.taskTotal, p.taskDone, p.progress, om[p.id] || 0, fmtDate(p.endDate)]) };
    }
    case 'audit': {
      const a = await listAudit(ctx, { limit: 500 });
      return { title: 'Audit Trail', columns: ['When', 'User', 'Via', 'Action', 'Entity', 'Summary'], rows: a.map((x) => [fmtDateTime(x.createdAt), name(x.user), x.via, x.action, x.entity, x.summary]) };
    }
    default: throw new AppError(400, `Unknown report type. Use one of: ${Object.keys(REPORT_TYPES).join(', ')}`);
  }
}

export async function generateReport(ctx, { type, projectId, status, format = 'pdf' }) {
  if (!['pdf', 'xlsx', 'csv'].includes(format)) throw new AppError(400, 'format must be pdf, xlsx or csv');
  const ds = await buildDataset(ctx, { type, projectId, status });
  const spec = { ...ds, subtitle: `${ds.rows.length} records | Generated ${fmtDateTime()} by ${ctx.user.name}` };
  if (format === 'pdf' && ds.pdfColumns) { // PDF: compact table first, full description + notes in a detail section after it
    spec.columns = ds.columns.slice(0, ds.pdfColumns); spec.rows = ds.rows.map((r) => r.slice(0, ds.pdfColumns));
    spec.text = ds.pdfText; spec.textAfter = true;
  }
  const { buffer, mime, ext } = await renderFile(format, spec);
  const file = await saveFile(ctx, { name: fileName(ds.title, ext), mime, buffer, kind: 'report' });
  await audit(ctx, 'generate', 'report', file.id, `Generated ${ds.title} (${format})`);
  return { ...file, records: ds.rows.length, title: ds.title };
}

export async function createCustomFile(ctx, { format, title, columns, rows, text }) {
  if (!['pdf', 'xlsx', 'csv'].includes(format)) throw new AppError(400, 'format must be pdf, xlsx or csv');
  const md = (v) => (typeof v === 'string' ? v.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]*)`/g, '$1') : v);
  const cols = Array.isArray(columns) ? columns.map((c) => String(md(c))) : [];
  const rws = (Array.isArray(rows) ? rows : []).slice(0, 5000).map((r) => (Array.isArray(r) ? r : [r]).slice(0, Math.max(cols.length, 1)).map(md));
  if (!cols.length && format !== 'pdf') throw new AppError(400, 'columns are required for csv/xlsx');
  if (!cols.length && !text) throw new AppError(400, 'Provide columns/rows or text');
  const { buffer, mime, ext } = await renderFile(format, { title: title || 'Document', columns: cols, rows: rws, text, subtitle: `Generated ${fmtDateTime()} by ${ctx.user.name}` });
  const file = await saveFile(ctx, { name: fileName(title || 'document', ext), mime, buffer, kind: 'document' });
  await audit(ctx, 'generate', 'file', file.id, `Generated ${title || 'document'} (${format})`);
  return file;
}
