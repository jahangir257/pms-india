'use client';
import { useState } from 'react';
import { ListChecks, Search } from 'lucide-react';
import { useFetch, fmtDate, isOverdue } from '@/lib/client';
import { PageHeader, PageLoader, ErrorBox, Badge, Empty } from '@/components/ui';
import TaskModal from '@/components/TaskModal';
import { TASK_STATUSES, PRIORITIES } from '@/lib/constants';

export default function Tasks() {
  const [f, setF] = useState({ q: '', status: '', priority: '', mine: true, overdue: false }); const [open, setOpen] = useState(null);
  const qs = new URLSearchParams({ q: f.q, status: f.status, priority: f.priority, ...(f.mine ? { assignee: 'me' } : {}), ...(f.overdue ? { overdue: 'true' } : {}) }).toString();
  const { data, loading, error, reload } = useFetch(`tasks?${qs}`);
  return (
    <>
      <PageHeader icon={ListChecks} title="Tasks" subtitle="Across all projects you can access">
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-brand-900/40" /><input className="input !pl-9" placeholder="Search tasks" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <select className="input !w-auto" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Any status</option>{TASK_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
        <select className="input !w-auto" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="">Any priority</option>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#064E3B]" checked={f.mine} onChange={(e) => setF({ ...f, mine: e.target.checked })} />Mine</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#064E3B]" checked={f.overdue} onChange={(e) => setF({ ...f, overdue: e.target.checked })} />Overdue</label>
      </PageHeader>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading ? <PageLoader /> : !data?.length ? <div className="card"><Empty title="No tasks match" /></div> : (
        <div className="card overflow-x-auto"><table className="w-full"><thead className="border-b border-cream-300"><tr>{['Task', 'Project', 'Module', 'Assignee', 'Priority', 'Status', 'Due'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-cream-200">{data.map((t) => <tr key={t.id} onClick={() => setOpen(t.id)} className="cursor-pointer hover:bg-cream-50"><td className="td"><div className="text-brand-900">{t.title}</div><div className="text-xs text-brand-900/50">{t.code}</div></td><td className="td">{t.project?.code}</td><td className="td">{t.module?.name || '-'}</td><td className="td">{t.assignee?.name || '-'}</td><td className="td"><Badge value={t.priority} /></td><td className="td"><Badge value={t.status} /></td><td className={`td ${isOverdue(t) ? 'text-red-700' : ''}`}>{fmtDate(t.dueDate)}</td></tr>)}</tbody></table></div>)}
      <TaskModal taskId={open} onClose={() => setOpen(null)} onChange={reload} />
    </>
  );
}
