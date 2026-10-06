'use client';
import { useEffect, useState } from 'react';
import { Send, Clock, Trash2, MessageSquare, Bot } from 'lucide-react';
import { api, fmtDate, fmtDateTime, toInput } from '@/lib/client';
import { Modal, Select, Input, Textarea, ErrorBox, Badge, Spinner, Avatar, Confirm } from './ui';
import { TASK_STATUSES, PRIORITIES, TASK_TYPES } from '@/lib/constants';
import { useUser } from './Shell';

export default function TaskModal({ taskId, onClose, onChange }) {
  const user = useUser(); const admin = ['super_admin', 'admin'].includes(user.role);
  const [t, setT] = useState(null); const [f, setF] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState(''); const [log, setLog] = useState({ hours: '', note: '' }); const [del, setDel] = useState(false);
  const hydrate = (x) => { setT(x); setF({ title: x.title, description: x.description || '', status: x.status, priority: x.priority, type: x.type, assignee: x.assignee?.id || '', module: x.module?.id || '', dueDate: toInput(x.dueDate), estimatedHours: x.estimatedHours || '' }); };
  useEffect(() => { if (!taskId) return; setT(null); setErr(''); api(`tasks/${taskId}`).then(hydrate).catch((e) => setErr(e.message)); }, [taskId]);
  const run = async (fn) => { setBusy(true); setErr(''); try { await fn(); onChange?.(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const save = (e) => { e.preventDefault(); run(async () => { const body = t.perms.canEdit ? { ...f, estimatedHours: f.estimatedHours === '' ? 0 : f.estimatedHours } : { status: f.status }; await api(`tasks/${t.id}`, { method: 'PATCH', body }); hydrate(await api(`tasks/${t.id}`)); }); };
  const addComment = (e) => { e.preventDefault(); if (!comment.trim()) return; run(async () => { hydrate(await api(`tasks/${t.id}/comments`, { method: 'POST', body: { text: comment } })); setComment(''); }); };
  const addLog = (e) => { e.preventDefault(); run(async () => { hydrate(await api(`tasks/${t.id}/time`, { method: 'POST', body: log })); setLog({ hours: '', note: '' }); }); };
  const remove = () => run(async () => { await api(`tasks/${t.id}`, { method: 'DELETE' }); setDel(false); onClose(); });
  const can = t?.perms; const ro = !can?.canEdit;
  return (
    <Modal open={!!taskId} onClose={onClose} wide title={t ? `${t.code} · ${t.project?.name}` : 'Task'}>
      {!t ? (err ? <ErrorBox>{err}</ErrorBox> : <div className="flex justify-center py-10"><Spinner /></div>) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <form onSubmit={save} className="space-y-4 lg:col-span-3">
            <ErrorBox>{err}</ErrorBox>
            <Input label="Title" required disabled={ro} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <Textarea label="Description" disabled={ro} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Status" disabled={!can.canStatus} options={TASK_STATUSES} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} />
              <Select label="Priority" disabled={ro} options={PRIORITIES} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} />
              <Select label="Type" disabled={ro} options={TASK_TYPES} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} />
              <Select label="Module" disabled={ro} placeholder="No module" options={t.modules.map((m) => ({ value: m.id, label: m.name }))} value={f.module} onChange={(e) => setF({ ...f, module: e.target.value })} />
              <Select label="Assignee" disabled={ro} placeholder="Unassigned" options={t.members.map((m) => ({ value: m.id, label: m.name }))} value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })} />
              <Input label="Due date" type="date" disabled={ro} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
              <Input label="Estimated hours" type="number" min="0" step="0.5" disabled={ro} value={f.estimatedHours} onChange={(e) => setF({ ...f, estimatedHours: e.target.value })} />
              <div className="text-sm text-brand-900/70"><div className="text-xs uppercase tracking-widest">Logged</div><div className="mt-2 text-xl text-brand-900">{t.loggedHours}h</div></div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-brand-900/50">{t.createdByAI && <span className="flex items-center gap-1"><Bot className="h-3.5 w-3.5" />Created by AI</span>}Assigned by {t.assignedBy?.name || '-'}</div>
              <div className="flex gap-2">{admin && <button type="button" className="btn btn-ghost text-red-700" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" />Archive</button>}{can.canStatus && <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button>}</div>
            </div>
          </form>
          <div className="space-y-6 lg:col-span-2">
            {can.canLog && <form onSubmit={addLog} className="rounded-xl border border-cream-300 bg-white/70 p-3"><div className="mb-2 flex items-center gap-2 text-sm text-brand-900"><Clock className="h-4 w-4" />Log time</div><div className="flex gap-2"><input className="input !w-20" type="number" step="0.25" min="0.25" max="24" placeholder="Hrs" required value={log.hours} onChange={(e) => setLog({ ...log, hours: e.target.value })} /><input className="input" placeholder="What did you do?" value={log.note} onChange={(e) => setLog({ ...log, note: e.target.value })} /><button className="btn btn-soft" disabled={busy}>Add</button></div>
              {t.timeLogs.length > 0 && <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-xs text-brand-900/70">{[...t.timeLogs].reverse().map((l) => <li key={l.id} className="flex justify-between"><span>{l.user?.name}: {l.note || 'work'}</span><span>{l.hours}h · {fmtDate(l.date)}</span></li>)}</ul>}</form>}
            <div><div className="mb-2 flex items-center gap-2 text-sm text-brand-900"><MessageSquare className="h-4 w-4" />Discussion</div>
              <ul className="mb-3 max-h-64 space-y-3 overflow-y-auto">{t.comments.length === 0 && <li className="text-sm text-brand-900/50">No comments yet.</li>}{t.comments.map((c) => <li key={c.id} className="flex gap-2"><Avatar name={c.user?.name} size="h-7 w-7" /><div className="min-w-0 rounded-lg bg-cream-100 px-3 py-2 text-sm"><div className="text-xs text-brand-900/60">{c.user?.name} · {fmtDateTime(c.at)}{c.via === 'ai' && ' · AI'}</div><div className="whitespace-pre-wrap break-words">{c.text}</div></div></li>)}</ul>
              <form onSubmit={addComment} className="flex gap-2"><input className="input" placeholder="Write a comment" value={comment} onChange={(e) => setComment(e.target.value)} /><button className="btn btn-primary !px-3" disabled={busy} aria-label="Send"><Send className="h-4 w-4" /></button></form></div>
          </div>
        </div>)}
      <Confirm open={del} onClose={() => setDel(false)} onConfirm={remove} busy={busy} title="Archive task"><p className="text-sm">Archive {t?.code}? It is hidden from boards but retained in the database.</p></Confirm>
    </Modal>
  );
}
