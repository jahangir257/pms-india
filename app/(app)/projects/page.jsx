'use client';
import Link from 'next/link';
import { useState } from 'react';
import { FolderKanban, Plus, Search, Calendar, User as UserIcon } from 'lucide-react';
import { api, useFetch, fmtDate } from '@/lib/client';
import { PageHeader, PageLoader, ErrorBox, Modal, Input, Select, Textarea, Badge, Empty, Progress } from '@/components/ui';
import { useUser } from '@/components/Shell';
import { PROJECT_STATUSES, PRIORITIES, BILLING_TYPES, RISK_LEVELS } from '@/lib/constants';

export default function Projects() {
  const user = useUser(); const admin = ['super_admin', 'admin'].includes(user.role);
  const [q, setQ] = useState(''); const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useFetch(`projects?q=${encodeURIComponent(q)}&status=${status}`);
  const [form, setForm] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const clients = useFetch(admin ? 'clients' : null); const managers = useFetch(admin ? 'users?role=manager&active=true' : null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const p = await api('projects', { method: 'POST', body: { ...form, budget: form.budget || undefined, tags: form.tags ? form.tags.split(',').map((s) => s.trim()).filter(Boolean) : [] } }); window.location.href = `/projects/${p.id}`; } catch (x) { setErr(x.message); setBusy(false); } };
  return (
    <>
      <PageHeader icon={FolderKanban} title="Projects" subtitle="Delivery portfolio">
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-brand-900/40" /><input className="input !pl-9" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
        {admin && <button className="btn btn-primary" onClick={() => { setErr(''); setForm({ name: '', client: '', startDate: '', endDate: '', status: 'planning', priority: 'medium', riskLevel: 'low', billingType: 'fixed_price', budget: '', currency: 'INR', manager: '', category: '', poNumber: '', description: '', tags: '' }); }}><Plus className="h-4 w-4" />New project</button>}
      </PageHeader>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading ? <PageLoader /> : !data?.length ? <div className="card"><Empty title="No projects">{admin ? 'Create a project, then assign a manager.' : 'You have not been assigned to any project yet.'}</Empty></div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="card block p-5 transition hover:-translate-y-0.5 hover:border-brand-900/40 hover:shadow-md">
            <div className="mb-2 flex items-start justify-between gap-2"><div><div className="text-xs tracking-widest text-brand-900/50">{p.code}</div><h3 className="text-lg leading-snug text-brand-900">{p.name}</h3></div><Badge value={p.status} /></div>
            <p className="mb-3 text-sm text-brand-900/60">{p.client?.name}</p>
            <Progress value={p.progress} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-brand-900/60"><span className="flex items-center gap-1"><UserIcon className="h-3.5 w-3.5" />{p.manager?.name || 'No manager yet'}</span><span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{fmtDate(p.endDate)}</span><Badge value={p.priority} /></div>
          </Link>))}</div>)}
      <Modal open={!!form} onClose={() => setForm(null)} wide title="New project">
        {form && <form onSubmit={save} className="space-y-4"><ErrorBox>{err}</ErrorBox>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Project name" required className="sm:col-span-2" value={form.name} onChange={(e) => set('name', e.target.value)} />
            <Select label="Client" required placeholder="Select client" options={(clients.data || []).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))} value={form.client} onChange={(e) => set('client', e.target.value)} />
            <Select label="Project manager" placeholder="Assign later" hint="Can be assigned after creation" options={(managers.data || []).map((u) => ({ value: u.id, label: u.name }))} value={form.manager} onChange={(e) => set('manager', e.target.value)} />
            <Input label="Start date" type="date" required value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            <Input label="End date" type="date" required value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
            <Select label="Status" options={PROJECT_STATUSES} value={form.status} onChange={(e) => set('status', e.target.value)} />
            <Select label="Priority" options={PRIORITIES} value={form.priority} onChange={(e) => set('priority', e.target.value)} />
            <Select label="Risk level" options={RISK_LEVELS} value={form.riskLevel} onChange={(e) => set('riskLevel', e.target.value)} />
            <Select label="Billing type" options={BILLING_TYPES} value={form.billingType} onChange={(e) => set('billingType', e.target.value)} />
            <Input label="Budget (INR)" type="number" min="0" value={form.budget} onChange={(e) => set('budget', e.target.value)} />
            <Input label="PO / Work order no." value={form.poNumber} onChange={(e) => set('poNumber', e.target.value)} />
            <Input label="Category" value={form.category} onChange={(e) => set('category', e.target.value)} />
            <Input label="Tags" hint="Comma separated" value={form.tags} onChange={(e) => set('tags', e.target.value)} />
            <Textarea label="Description / scope" className="sm:col-span-2" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Creating...' : 'Create project'}</button></div></form>}
      </Modal>
    </>
  );
}
