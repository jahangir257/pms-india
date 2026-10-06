'use client';
import { useState } from 'react';
import { FileBarChart, FileText, FileSpreadsheet, FileDown, Loader2 } from 'lucide-react';
import { api, useFetch } from '@/lib/client';
import { PageHeader, ErrorBox, Select } from '@/components/ui';
import { useUser } from '@/components/Shell';

const TYPES = [['projects', 'Project portfolio', 'All projects with client, manager, budget and progress'], ['project_health', 'Project health', 'Progress, risk and overdue tasks per project'], ['tasks', 'Task register', 'Every task with assignee, status and hours'], ['team_workload', 'Team workload', 'Open, done and overdue tasks per member'], ['clients', 'Client directory', 'Contacts and GST details', ['super_admin', 'admin', 'manager']], ['audit', 'Audit trail', 'Latest 500 recorded actions', ['super_admin', 'admin']]];
export default function Reports() {
  const user = useUser(); const { data: projects } = useFetch('projects');
  const [project, setProject] = useState(''); const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [done, setDone] = useState([]);
  const gen = async (type, format) => {
    setBusy(type + format); setErr('');
    try { const f = await api('reports', { method: 'POST', body: { type, format, projectId: project || undefined } }); setDone((d) => [f, ...d].slice(0, 8)); window.open(f.url, '_blank'); } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  return (
    <>
      <PageHeader icon={FileBarChart} title="Reports" subtitle="Generate PDF, Excel or CSV exports. Results respect your access." />
      <div className="mb-5 max-w-sm"><Select label="Limit to project (task reports)" placeholder="All projects" options={(projects || []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` }))} value={project} onChange={(e) => setProject(e.target.value)} /></div>
      <ErrorBox>{err}</ErrorBox>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{TYPES.filter((t) => !t[3] || t[3].includes(user.role)).map(([k, t, d]) => (
        <div key={k} className="card p-5"><h3 className="text-lg text-brand-900">{t}</h3><p className="mb-4 text-sm text-brand-900/60">{d}</p>
          <div className="flex gap-2">{[['pdf', FileText], ['xlsx', FileSpreadsheet], ['csv', FileDown]].map(([f, I]) => <button key={f} className="btn btn-soft flex-1 uppercase" disabled={!!busy} onClick={() => gen(k, f)}>{busy === k + f ? <Loader2 className="h-4 w-4 animate-spin" /> : <I className="h-4 w-4" />}{f}</button>)}</div></div>))}</div>
      {done.length > 0 && <section className="card mt-6 p-5"><h3 className="mb-2 text-lg text-brand-900">Recent exports</h3><ul className="space-y-1 text-sm">{done.map((f) => <li key={f.id}><a className="text-brand-900 underline" href={`${f.url}?download=1`}>{f.name}</a> <span className="text-brand-900/50">({f.records} records)</span></li>)}</ul></section>}
    </>
  );
}
