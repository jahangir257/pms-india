'use client';
import { useState } from 'react';
import { Users as UsersIcon, Plus, Search, Pencil, Copy, UserX, UserCheck } from 'lucide-react';
import { api, useFetch, fmtDateTime } from '@/lib/client';
import { PageHeader, PageLoader, ErrorBox, Modal, Input, Select, Badge, Avatar, Empty } from '@/components/ui';
import { ROLES, ROLE_LABEL } from '@/lib/constants';
import { useUser } from '@/components/Shell';

export default function UsersPage() {
  const me = useUser(); const [q, setQ] = useState(''); const [role, setRole] = useState('');
  const { data, loading, error, reload } = useFetch(`users?q=${encodeURIComponent(q)}&role=${role}`);
  const [form, setForm] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [created, setCreated] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const { id, ...b } = form; if (!b.password) delete b.password; const r = await api(id ? `users/${id}` : 'users', { method: id ? 'PATCH' : 'POST', body: b }); setForm(null); if (r.tempPassword) setCreated({ email: r.user.email, pw: r.tempPassword }); reload(); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  const toggle = async (u) => { try { await api(`users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); reload(); } catch (x) { alert(x.message); } };
  const roleOpts = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
  return (
    <>
      <PageHeader icon={UsersIcon} title="Users" subtitle="Accounts and roles">
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-brand-900/40" /><input className="input !pl-9" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input !w-auto" value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option>{roleOpts.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
        <button className="btn btn-primary" onClick={() => { setErr(''); setForm({ name: '', email: '', password: '', role: 'employee', phone: '', designation: '', department: '', employeeId: '' }); }}><Plus className="h-4 w-4" />Add user</button>
      </PageHeader>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading ? <PageLoader /> : !data?.length ? <div className="card"><Empty title="No users" /></div> : (
        <div className="card overflow-x-auto"><table className="w-full"><thead className="border-b border-cream-300"><tr>{['User', 'Role', 'Department', 'Phone', 'Last login', 'Status', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-cream-200">{data.map((u) => <tr key={u.id} className="hover:bg-cream-50"><td className="td"><div className="flex items-center gap-3"><Avatar name={u.name} /><div><div className="text-brand-900">{u.name}</div><div className="text-xs text-brand-900/50">{u.email}</div></div></div></td><td className="td"><Badge>{ROLE_LABEL[u.role]}</Badge></td><td className="td">{u.designation || '-'}<div className="text-xs text-brand-900/50">{u.department}</div></td><td className="td">{u.phone || '-'}</td><td className="td text-xs">{fmtDateTime(u.lastLoginAt)}</td><td className="td"><Badge value={u.active ? 'active' : 'inactive'} /></td>
            <td className="td whitespace-nowrap text-right"><button className="btn btn-ghost !p-2" onClick={() => { setErr(''); setForm({ ...u, password: '' }); }}><Pencil className="h-4 w-4" /></button>{u.id !== me.id && <button className="btn btn-ghost !p-2" title={u.active ? 'Deactivate' : 'Activate'} onClick={() => toggle(u)}>{u.active ? <UserX className="h-4 w-4 text-red-700" /> : <UserCheck className="h-4 w-4" />}</button>}</td></tr>)}</tbody></table></div>)}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit user' : 'Add user'}>{form && <form onSubmit={save} className="space-y-4"><ErrorBox>{err}</ErrorBox>
        <div className="grid gap-4 sm:grid-cols-2"><Input label="Full name" required value={form.name} onChange={(e) => set('name', e.target.value)} /><Input label="Email" type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} />
          <Select label="Role" options={roleOpts} value={form.role} onChange={(e) => set('role', e.target.value)} /><Input label={form.id ? 'Reset password' : 'Password'} type="password" minLength={8} hint={form.id ? 'Leave blank to keep' : 'Blank = auto-generate'} value={form.password} onChange={(e) => set('password', e.target.value)} />
          <Input label="Designation" value={form.designation || ''} onChange={(e) => set('designation', e.target.value)} /><Input label="Department" value={form.department || ''} onChange={(e) => set('department', e.target.value)} />
          <Input label="Phone" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /><Input label="Employee ID" value={form.employeeId || ''} onChange={(e) => set('employeeId', e.target.value)} /></div>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn btn-primary" disabled={busy}>Save</button></div></form>}</Modal>
      <Modal open={!!created} onClose={() => setCreated(null)} title="Temporary password"><p className="mb-3 text-sm">Share this once with <b>{created?.email}</b>. It is not stored in readable form.</p><div className="flex items-center justify-between rounded-lg bg-cream p-3 font-mono text-sm"><span>{created?.pw}</span><button className="btn btn-ghost !p-2" onClick={() => navigator.clipboard.writeText(created.pw)}><Copy className="h-4 w-4" /></button></div></Modal>
    </>
  );
}
