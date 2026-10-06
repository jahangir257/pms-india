'use client';
import { useState } from 'react';
import { Building2, Plus, Search, Pencil, Trash2, Mail, Phone } from 'lucide-react';
import { api, useFetch, fmtDate, toInput } from '@/lib/client';
import { PageHeader, PageLoader, ErrorBox, Modal, Input, Select, Textarea, Badge, Empty, Confirm } from '@/components/ui';
import { useUser } from '@/components/Shell';
import { CLIENT_STATUSES, INDUSTRIES } from '@/lib/constants';

const blank = { name: '', industry: '', contactPerson: '', designation: '', email: '', phone: '', altPhone: '', website: '', gstin: '', pan: '', cin: '', status: 'active', paymentTerms: 'Net 30', contractStart: '', contractEnd: '', notes: '', address: { line1: '', line2: '', city: '', state: '', pincode: '', country: 'India' } };
export default function Clients() {
  const user = useUser(); const admin = ['super_admin', 'admin'].includes(user.role);
  const [q, setQ] = useState(''); const { data, loading, error, reload } = useFetch(`clients?q=${encodeURIComponent(q)}`);
  const [form, setForm] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [del, setDel] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v })); const setA = (k, v) => setForm((f) => ({ ...f, address: { ...f.address, [k]: v } }));
  const open = (c) => { setErr(''); setForm(c ? { ...blank, ...c, address: { ...blank.address, ...(c.address || {}) }, contractStart: toInput(c.contractStart), contractEnd: toInput(c.contractEnd), accountManager: undefined } : blank); };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const { id, code, projectCount, createdAt, updatedAt, accountManager, ...body } = form; await api(id ? `clients/${id}` : 'clients', { method: id ? 'PATCH' : 'POST', body }); setForm(null); reload(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const remove = async () => { setBusy(true); try { await api(`clients/${del.id}`, { method: 'DELETE' }); setDel(null); reload(); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  return (
    <>
      <PageHeader icon={Building2} title="Clients" subtitle="Company profiles with statutory and billing details">
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-brand-900/40" /><input className="input !pl-9" placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {admin && <button className="btn btn-primary" onClick={() => open()}><Plus className="h-4 w-4" />New client</button>}
      </PageHeader>
      {error && <ErrorBox>{error}</ErrorBox>}{err && !form && <ErrorBox>{err}</ErrorBox>}
      {loading ? <PageLoader /> : !data?.length ? <div className="card"><Empty title="No clients found">{admin ? 'Add your first client to start creating projects.' : ''}</Empty></div> : (
        <div className="card overflow-x-auto"><table className="w-full"><thead className="border-b border-cream-300"><tr><th className="th">Client</th><th className="th">Contact</th><th className="th">GSTIN / PAN</th><th className="th">Location</th><th className="th">Projects</th><th className="th">Status</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-cream-200">{data.map((c) => (
            <tr key={c.id} className="hover:bg-cream-50"><td className="td"><div className="text-brand-900">{c.name}</div><div className="text-xs text-brand-900/50">{c.code} &middot; {c.industry || 'n/a'}</div></td>
              <td className="td"><div>{c.contactPerson}</div><div className="flex items-center gap-1 text-xs text-brand-900/60"><Mail className="h-3 w-3" />{c.email}</div><div className="flex items-center gap-1 text-xs text-brand-900/60"><Phone className="h-3 w-3" />{c.phone}</div></td>
              <td className="td text-xs"><div>{c.gstin || '-'}</div><div>{c.pan || '-'}</div></td><td className="td">{[c.address?.city, c.address?.state].filter(Boolean).join(', ') || '-'}</td>
              <td className="td">{c.projectCount}</td><td className="td"><Badge value={c.status} /></td>
              <td className="td whitespace-nowrap text-right">{admin && <><button className="btn btn-ghost !p-2" onClick={() => open(c)} aria-label="Edit"><Pencil className="h-4 w-4" /></button><button className="btn btn-ghost !p-2 text-red-700" onClick={() => setDel(c)} aria-label="Archive"><Trash2 className="h-4 w-4" /></button></>}</td></tr>))}</tbody></table></div>)}
      <Modal open={!!form} onClose={() => setForm(null)} wide title={form?.id ? 'Edit client' : 'New client'}>
        {form && <form onSubmit={save} className="space-y-5">
          <ErrorBox>{err}</ErrorBox>
          <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-2 text-sm text-brand-900">Company</legend>
            <Input label="Company name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
            <Select label="Industry" placeholder="Select" options={INDUSTRIES.map((i) => ({ value: i, label: i }))} value={form.industry || ''} onChange={(e) => set('industry', e.target.value)} />
            <Input label="Website" value={form.website || ''} onChange={(e) => set('website', e.target.value)} />
            <Select label="Status" options={CLIENT_STATUSES} value={form.status} onChange={(e) => set('status', e.target.value)} /></fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-2 text-sm text-brand-900">Primary contact</legend>
            <Input label="Contact person" required value={form.contactPerson || ''} onChange={(e) => set('contactPerson', e.target.value)} />
            <Input label="Designation" value={form.designation || ''} onChange={(e) => set('designation', e.target.value)} />
            <Input label="Email" type="email" required value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
            <Input label="Phone" required value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
            <Input label="Alternate phone" value={form.altPhone || ''} onChange={(e) => set('altPhone', e.target.value)} /></fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-3"><legend className="mb-2 text-sm text-brand-900">Statutory</legend>
            <Input label="GSTIN" maxLength={15} value={form.gstin || ''} onChange={(e) => set('gstin', e.target.value.toUpperCase())} />
            <Input label="PAN" maxLength={10} value={form.pan || ''} onChange={(e) => set('pan', e.target.value.toUpperCase())} />
            <Input label="CIN" value={form.cin || ''} onChange={(e) => set('cin', e.target.value.toUpperCase())} /></fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-2 text-sm text-brand-900">Address</legend>
            <Input label="Address line 1" value={form.address.line1 || ''} onChange={(e) => setA('line1', e.target.value)} />
            <Input label="Address line 2" value={form.address.line2 || ''} onChange={(e) => setA('line2', e.target.value)} />
            <Input label="City" value={form.address.city || ''} onChange={(e) => setA('city', e.target.value)} />
            <Input label="State" value={form.address.state || ''} onChange={(e) => setA('state', e.target.value)} />
            <Input label="PIN code" maxLength={6} value={form.address.pincode || ''} onChange={(e) => setA('pincode', e.target.value)} />
            <Input label="Country" value={form.address.country || ''} onChange={(e) => setA('country', e.target.value)} /></fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-3"><legend className="mb-2 text-sm text-brand-900">Contract</legend>
            <Input label="Contract start" type="date" value={form.contractStart || ''} onChange={(e) => set('contractStart', e.target.value)} />
            <Input label="Contract end" type="date" value={form.contractEnd || ''} onChange={(e) => set('contractEnd', e.target.value)} />
            <Input label="Payment terms" value={form.paymentTerms || ''} onChange={(e) => set('paymentTerms', e.target.value)} /></fieldset>
          <Textarea label="Notes" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
          <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save client'}</button></div>
        </form>}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} busy={busy} title="Archive client"><p className="text-sm">Archive <b>{del?.name}</b>? It is hidden from lists but kept in the database. Clients with active projects cannot be archived.</p></Confirm>
    </>
  );
}
