'use client';
import Link from 'next/link';
import { FolderKanban, ListChecks, AlertTriangle, Building2, Users, UserCheck, LayoutDashboard, Activity } from 'lucide-react';
import { useFetch, fmtDate, fmtDateTime } from '@/lib/client';
import { PageHeader, PageLoader, ErrorBox, Stat, Progress, Badge, Empty } from '@/components/ui';
import { useUser } from '@/components/Shell';
import { TASK_STATUSES, label } from '@/lib/constants';

const COLORS = { todo: '#A8A29E', in_progress: '#0284C7', in_review: '#7C3AED', blocked: '#DC2626', done: '#064E3B' };
export default function Dashboard() {
  const user = useUser(); const { data: d, loading, error } = useFetch('dashboard');
  if (loading) return <PageLoader />; if (error) return <ErrorBox>{error}</ErrorBox>;
  const total = d.counts.tasks || 1;
  return (
    <>
      <PageHeader icon={LayoutDashboard} title={`Welcome, ${user.name.split(' ')[0]}`} subtitle="Live overview of your portfolio" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={FolderKanban} label="Projects" value={d.counts.projects} hint={`${d.counts.activeProjects} active`} />
        <Stat icon={ListChecks} label="Tasks" value={d.counts.tasks} hint={`${d.counts.myOpen} open for you`} tone="bg-cream text-brand-900 ring-1 ring-brand-900/20" />
        <Stat icon={AlertTriangle} label="Overdue" value={d.counts.overdue} tone="bg-red-100 text-red-800" />
        {d.counts.clients !== undefined ? <Stat icon={Building2} label="Clients" value={d.counts.clients} hint={`${d.counts.users} active users`} /> : <Stat icon={UserCheck} label="My open tasks" value={d.counts.myOpen} />}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-3">
          <h2 className="mb-4 text-lg text-brand-900">Project progress</h2>
          {!d.projectProgress.length ? <Empty title="No projects yet" /> : <div className="space-y-4">{d.projectProgress.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="block rounded-lg p-2 hover:bg-cream-100"><div className="mb-1 flex items-center justify-between text-sm"><span className="text-brand-900">{p.code} &middot; {p.name}</span><Badge value={p.status} /></div><Progress value={p.pct} /><div className="mt-0.5 text-xs text-brand-900/50">{p.done}/{p.total} tasks done</div></Link>))}</div>}
        </section>
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-lg text-brand-900">Tasks by status</h2>
          <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-cream-200">{TASK_STATUSES.map((s) => <div key={s} title={`${label(s)}: ${d.tasksByStatus[s]}`} style={{ width: `${(d.tasksByStatus[s] / total) * 100}%`, background: COLORS[s] }} />)}</div>
          <ul className="space-y-2 text-sm">{TASK_STATUSES.map((s) => <li key={s} className="flex items-center justify-between"><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full" style={{ background: COLORS[s] }} />{label(s)}</span><span className="text-brand-900">{d.tasksByStatus[s]}</span></li>)}</ul>
        </section>
        <section className="card p-5 lg:col-span-3">
          <h2 className="mb-3 text-lg text-brand-900">My upcoming deadlines</h2>
          {!d.upcoming.length ? <Empty title="No upcoming deadlines" /> : <ul className="divide-y divide-cream-300">{d.upcoming.map((t) => <li key={t.id} className="flex items-center justify-between py-2.5 text-sm"><div><div className="text-brand-900">{t.title}</div><div className="text-xs text-brand-900/50">{t.code} &middot; {t.project?.code}</div></div><div className="text-right"><div className={new Date(t.dueDate) < new Date() ? 'text-red-700' : ''}>{fmtDate(t.dueDate)}</div><Badge value={t.priority} /></div></li>)}</ul>}
        </section>
        {d.recent && <section className="card p-5 lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-lg text-brand-900"><Activity className="h-4 w-4" />Recent activity</h2>
          <ul className="space-y-3 text-sm">{d.recent.map((a) => <li key={a.id}><div className="text-brand-900">{a.summary}</div><div className="text-xs text-brand-900/50">{a.user?.name} &middot; {fmtDateTime(a.createdAt)}{a.via === 'ai' && ' &middot; via AI'}</div></li>)}</ul>
        </section>}
      </div>
    </>
  );
}
