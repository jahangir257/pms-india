'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { FolderKanban, Plus, Pencil, Users, Layers, KanbanSquare, Info, Calendar, Wallet, Building2, AlertTriangle, ArrowLeft, Trash2 } from 'lucide-react';
import { api, useFetch, fmtDate, inr, toInput, isOverdue } from '@/lib/client';
import { PageLoader, ErrorBox, Modal, Input, Select, Textarea, Badge, Empty, Progress, Avatar, Confirm } from '@/components/ui';
import TaskModal from '@/components/TaskModal';
import { TASK_STATUSES, PRIORITIES, TASK_TYPES, PROJECT_STATUSES, MODULE_STATUSES, label, ROLE_LABEL } from '@/lib/constants';

const TABS = [['overview', 'Overview', Info], ['modules', 'Modules', Layers], ['tasks', 'Tasks', KanbanSquare], ['team', 'Team', Users]];
export default function ProjectPage() {
  const { id } = useParams(); const router = useRouter();
  const { data: p, loading, error, reload } = useFetch(`projects/${id}`);
  const tasks = useFetch(`tasks?project=${id}`);
  const [tab, setTab] = useState('overview'); const [openTask, setOpenTask] = useState(null);
  const [mod, setMod] = useState(null); const [task, setTask] = useState(null); const [team, setTeam] = useState(null); const [edit, setEdit] = useState(null); const [del, setDel] = useState(false);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [fm, setFm] = useState('');
  const pool = useFetch(team ? 'users' : null);
  if (loading) return <PageLoader />; if (error) return <ErrorBox>{error}</ErrorBox>;
  const A = p.myAccess; const refresh = () => { reload(); tasks.reload(); };
  const run = async (fn, done) => { setBusy(true); setErr(''); try { await fn(); done?.(); refresh(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const saveModule = (e) => { e.preventDefault(); run(() => api(mod.id ? `modules/${mod.id}` : `projects/${p.id}/modules`, { method: mod.id ? 'PATCH' : 'POST', body: { name: mod.name, description: mod.description, status: mod.status, lead: mod.lead || '', startDate: mod.startDate || '', endDate: mod.endDate || '' } }), () => setMod(null)); };
  const saveTask = (e) => { e.preventDefault(); run(() => api('tasks', { method: 'POST', body: { ...task, project: p.id } }), () => setTask(null)); };
  const saveTeam = () => run(() => api(`projects/${p.id}/team`, { method: 'PUT', body: { ...(A.isAdmin ? { manager: team.manager } : {}), teamLeads: team.teamLeads, employees: team.employees } }), () => setTeam(null));
  const saveEdit = (e) => { e.preventDefault(); const b = A.isAdmin ? { ...edit, budget: edit.budget || 0 } : { status: edit.status, priority: edit.priority, description: edit.description, endDate: edit.endDate, riskLevel: edit.riskLevel }; delete b.client; run(() => api(`projects/${p.id}`, { method: 'PATCH', body: b }), () => setEdit(null)); };
  const remove = () => run(() => api(`projects/${p.id}`, { method: 'DELETE' }), () => router.replace('/projects'));
  const members = [p.manager, ...p.teamLeads, ...p.employees].filter(Boolean);
  const allTasks = (tasks.data || []).filter((t) => !fm || (fm === 'none' ? !t.module : t.module?.id === fm));
  const toggle = (k, v) => setTeam((t) => ({ ...t, [k]: t[k].includes(v) ? t[k].filter((x) => x !== v) : [...t[k], v] }));
  const people = (role) => (pool.data || []).filter((u) => (Array.isArray(role) ? role.includes(u.role) : u.role === role) && u.active !== false);
  return (
    <>
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-brand-900/60 hover:text-brand-900"><ArrowLeft className="h-4 w-4" />All projects</Link>
      <div className="card mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-900 text-cream"><FolderKanban className="h-6 w-6" /></span>
            <div><div className="text-xs tracking-widest text-brand-900/50">{p.code}</div><h1 className="text-2xl text-brand-900">{p.name}</h1><div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-brand-900/60"><Building2 className="h-4 w-4" />{p.client?.name}<Badge value={p.status} /><Badge value={p.priority} />{p.riskLevel !== 'low' && <Badge tone="high"><AlertTriangle className="mr-1 inline h-3 w-3" />{label(p.riskLevel)} risk</Badge>}</div></div></div>
          <div className="flex gap-2">{A.canManage && <button className="btn btn-soft" onClick={() => { setErr(''); setEdit({ ...p, client: undefined, startDate: toInput(p.startDate), endDate: toInput(p.endDate), manager: p.manager?.id || '' }); }}><Pencil className="h-4 w-4" />Edit</button>}{A.isAdmin && <button className="btn btn-ghost text-red-700" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" />Archive</button>}</div>
        </div>
        <div className="mt-4"><Progress value={p.taskStats.progress} /><div className="mt-1 text-xs text-brand-900/50">{p.taskStats.done}/{p.taskStats.total} tasks completed</div></div>
      </div>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-cream-300">{TABS.map(([k, l, I]) => <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${tab === k ? 'border-brand-900 text-brand-900' : 'border-transparent text-brand-900/50 hover:text-brand-900'}`}><I className="h-4 w-4" />{l}</button>)}</div>
      {err && !mod && !task && !team && !edit && <ErrorBox>{err}</ErrorBox>}

      {tab === 'overview' && <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2"><h2 className="mb-2 text-lg text-brand-900">Scope</h2><p className="whitespace-pre-wrap text-sm text-brand-900/80">{p.description || 'No description provided.'}</p>
          {p.tags?.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{p.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>}</section>
        <section className="card space-y-3 p-5 text-sm">
          <Row icon={Calendar} k="Timeline" v={`${fmtDate(p.startDate)} - ${fmtDate(p.endDate)}`} /><Row icon={Wallet} k="Budget" v={inr(p.budget, p.currency)} /><Row k="Billing" v={label(p.billingType)} /><Row k="PO / WO" v={p.poNumber || '-'} /><Row k="Category" v={p.category || '-'} /><Row k="Industry" v={p.client?.industry || '-'} /></section>
        <section className="card p-5 lg:col-span-3"><h2 className="mb-3 text-lg text-brand-900">Task status</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{TASK_STATUSES.map((s) => <div key={s} className="rounded-lg bg-cream-100 p-3 text-center"><div className="text-2xl text-brand-900">{p.taskStats.byStatus[s] || 0}</div><div className="text-xs uppercase tracking-widest text-brand-900/60">{label(s)}</div></div>)}</div></section>
      </div>}

      {tab === 'modules' && <>
        {A.canManage && <div className="mb-4 flex justify-end"><button className="btn btn-primary" onClick={() => { setErr(''); setMod({ name: '', description: '', status: 'not_started', lead: '', startDate: '', endDate: '' }); }}><Plus className="h-4 w-4" />New module</button></div>}
        {!p.modules.length ? <div className="card"><Empty icon={Layers} title="No modules yet">Break the project into modules, then assign tasks to them.</Empty></div> :
          <div className="grid gap-4 md:grid-cols-2">{p.modules.map((m) => <div key={m.id} className="card p-5"><div className="mb-2 flex items-start justify-between"><div><h3 className="text-lg text-brand-900">{m.name}</h3><div className="text-xs text-brand-900/50">Lead: {m.lead?.name || 'unassigned'}</div></div><div className="flex items-center gap-1"><Badge value={m.status} />{A.canManage && <button className="btn btn-ghost !p-1.5" onClick={() => { setErr(''); setMod({ ...m, lead: m.lead?.id || '', startDate: toInput(m.startDate), endDate: toInput(m.endDate) }); }}><Pencil className="h-4 w-4" /></button>}</div></div>
            <p className="mb-3 line-clamp-2 text-sm text-brand-900/70">{m.description}</p><Progress value={m.progress} /><div className="mt-1 text-xs text-brand-900/50">{m.taskDone}/{m.taskTotal} tasks</div></div>)}</div>}
      </>}

      {tab === 'tasks' && <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><select className="input !w-auto" value={fm} onChange={(e) => setFm(e.target.value)}><option value="">All modules</option><option value="none">No module</option>{p.modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          {A.canAssign && <button className="btn btn-primary" onClick={() => { setErr(''); setTask({ title: '', description: '', module: '', assignee: '', priority: 'medium', type: 'feature', dueDate: '', estimatedHours: '' }); }}><Plus className="h-4 w-4" />New task</button>}</div>
        {tasks.loading ? <PageLoader /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{TASK_STATUSES.map((s) => { const col = allTasks.filter((t) => t.status === s); return (
          <div key={s} className="rounded-xl bg-cream-100/70 p-3"><div className="mb-3 flex items-center justify-between text-xs uppercase tracking-widest text-brand-900/70"><span>{label(s)}</span><span className="rounded-full bg-white px-2 py-0.5">{col.length}</span></div>
            <div className="space-y-2">{col.map((t) => <button key={t.id} onClick={() => setOpenTask(t.id)} className="block w-full rounded-lg border border-cream-300 bg-white p-3 text-left transition hover:border-brand-900/40 hover:shadow">
              <div className="text-[11px] tracking-widest text-brand-900/40">{t.code}</div><div className="mb-2 text-sm text-brand-900">{t.title}</div>
              <div className="flex items-center justify-between"><Badge value={t.priority} />{t.assignee ? <Avatar name={t.assignee.name} size="h-6 w-6" /> : <span className="text-xs text-brand-900/40">-</span>}</div>
              {(t.module || t.dueDate) && <div className={`mt-2 text-xs ${isOverdue(t) ? 'text-red-700' : 'text-brand-900/50'}`}>{t.module?.name} {t.dueDate && `· ${fmtDate(t.dueDate)}`}</div>}</button>)}
              {!col.length && <div className="py-4 text-center text-xs text-brand-900/30">Empty</div>}</div></div>); })}</div>}
      </>}

      {tab === 'team' && <>
        {A.canManage && <div className="mb-4 flex justify-end"><button className="btn btn-primary" onClick={() => { setErr(''); setTeam({ manager: p.manager?.id || '', teamLeads: p.teamLeads.map((u) => u.id), employees: p.employees.map((u) => u.id) }); }}><Users className="h-4 w-4" />Manage team</button></div>}
        {!members.length && <div className="card"><Empty icon={Users} title="No team assigned">An admin assigns the project manager; the manager then adds team leads and employees.</Empty></div>}
        <div className="grid gap-4 md:grid-cols-3">{[['Project manager', p.manager ? [p.manager] : []], ['Team leads', p.teamLeads], ['Employees', p.employees]].map(([t, list]) => <section key={t} className="card p-5"><h3 className="mb-3 text-sm uppercase tracking-widest text-brand-900/60">{t}</h3>{!list.length ? <p className="text-sm text-brand-900/40">None</p> : <ul className="space-y-3">{list.map((u) => <li key={u.id} className="flex items-center gap-3"><Avatar name={u.name} /><div><div className="text-sm text-brand-900">{u.name}</div><div className="text-xs text-brand-900/50">{u.designation || ROLE_LABEL[u.role]}</div></div></li>)}</ul>}</section>)}</div>
      </>}

      <TaskModal taskId={openTask} onClose={() => setOpenTask(null)} onChange={refresh} />

      <Modal open={!!mod} onClose={() => setMod(null)} title={mod?.id ? 'Edit module' : 'New module'}>{mod && <form onSubmit={saveModule} className="space-y-4"><ErrorBox>{err}</ErrorBox>
        <Input label="Module name" required value={mod.name} onChange={(e) => setMod({ ...mod, name: e.target.value })} /><Textarea label="Description" value={mod.description || ''} onChange={(e) => setMod({ ...mod, description: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2"><Select label="Status" options={MODULE_STATUSES} value={mod.status} onChange={(e) => setMod({ ...mod, status: e.target.value })} />
          <Select label="Module lead" placeholder="Unassigned" options={[...(A.isAdmin && p.manager ? [p.manager] : []), ...p.teamLeads, ...p.employees].filter((u, i, a) => a.findIndex((x) => x.id === u.id) === i).map((u) => ({ value: u.id, label: `${u.name}${u.id === p.manager?.id ? ' (Project manager)' : ''}` }))} value={mod.lead} onChange={(e) => setMod({ ...mod, lead: e.target.value })} />
          <Input label="Start" type="date" value={mod.startDate || ''} onChange={(e) => setMod({ ...mod, startDate: e.target.value })} /><Input label="End" type="date" value={mod.endDate || ''} onChange={(e) => setMod({ ...mod, endDate: e.target.value })} /></div>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={() => setMod(null)}>Cancel</button><button className="btn btn-primary" disabled={busy}>Save module</button></div></form>}</Modal>

      <Modal open={!!task} onClose={() => setTask(null)} wide title="New task">{task && <form onSubmit={saveTask} className="space-y-4"><ErrorBox>{err}</ErrorBox>
        <Input label="Title" required value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} /><Textarea label="Description" value={task.description} onChange={(e) => setTask({ ...task, description: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Module" placeholder="No module" options={p.modules.map((m) => ({ value: m.id, label: m.name }))} value={task.module} onChange={(e) => setTask({ ...task, module: e.target.value })} />
          <Select label="Assign to" placeholder="Unassigned" options={p.assignable.map((u) => ({ value: u.id, label: `${u.name} (${ROLE_LABEL[u.role]})` }))} value={task.assignee} onChange={(e) => setTask({ ...task, assignee: e.target.value })} />
          <Select label="Priority" options={PRIORITIES} value={task.priority} onChange={(e) => setTask({ ...task, priority: e.target.value })} /><Select label="Type" options={TASK_TYPES} value={task.type} onChange={(e) => setTask({ ...task, type: e.target.value })} />
          <Input label="Due date" type="date" value={task.dueDate} onChange={(e) => setTask({ ...task, dueDate: e.target.value })} /><Input label="Estimated hours" type="number" min="0" step="0.5" value={task.estimatedHours} onChange={(e) => setTask({ ...task, estimatedHours: e.target.value })} /></div>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={() => setTask(null)}>Cancel</button><button className="btn btn-primary" disabled={busy}>Create task</button></div></form>}</Modal>

      <Modal open={!!team} onClose={() => setTeam(null)} wide title="Manage team" footer={<><button className="btn btn-ghost" onClick={() => setTeam(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={saveTeam}>Save team</button></>}>{team && <div className="space-y-5"><ErrorBox>{err}</ErrorBox>
        {A.isAdmin && <Select label="Project manager" placeholder="Unassigned" options={people('manager').map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))} value={team.manager} onChange={(e) => setTeam({ ...team, manager: e.target.value })} />}
        {[['teamLeads', 'Team leads', 'team_lead'], ['employees', 'Employees', ['employee']]].map(([k, l, r]) => <div key={k}><div className="mb-2 text-xs uppercase tracking-widest text-brand-900/70">{l}</div>{pool.loading ? <p className="text-sm">Loading...</p> : !people(r).length ? <p className="text-sm text-brand-900/50">No users with this role. Ask an admin to create some.</p> : <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">{people(r).map((u) => <label key={u.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${team[k].includes(u.id) ? 'border-brand-900 bg-brand-900/5' : 'border-cream-300 bg-white'}`}><input type="checkbox" className="accent-[#064E3B]" checked={team[k].includes(u.id)} onChange={() => toggle(k, u.id)} />{u.name}</label>)}</div>}</div>)}</div>}</Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} wide title="Edit project">{edit && <form onSubmit={saveEdit} className="space-y-4"><ErrorBox>{err}</ErrorBox>
        <div className="grid gap-4 sm:grid-cols-2">
          {A.isAdmin && <Input label="Name" className="sm:col-span-2" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />}
          <Select label="Status" options={PROJECT_STATUSES} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })} /><Select label="Priority" options={PRIORITIES} value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })} />
          <Select label="Risk" options={['low', 'medium', 'high']} value={edit.riskLevel} onChange={(e) => setEdit({ ...edit, riskLevel: e.target.value })} /><Input label="End date" type="date" value={edit.endDate} onChange={(e) => setEdit({ ...edit, endDate: e.target.value })} />
          {A.isAdmin && <><Input label="Start date" type="date" value={edit.startDate} onChange={(e) => setEdit({ ...edit, startDate: e.target.value })} /><Input label="Budget (INR)" type="number" value={edit.budget || ''} onChange={(e) => setEdit({ ...edit, budget: e.target.value })} /></>}
          <Textarea label="Description" className="sm:col-span-2" value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy}>Save</button></div></form>}</Modal>
      <Confirm open={del} onClose={() => setDel(false)} onConfirm={remove} busy={busy} title="Archive project"><p className="text-sm">Archive {p.code}? It disappears from lists but all data is retained.</p></Confirm>
    </>
  );
}
const Row = ({ icon: I, k, v }) => <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-brand-900/60">{I && <I className="h-4 w-4" />}{k}</span><span className="text-right text-brand-900">{v}</span></div>;
