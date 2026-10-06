'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useState } from 'react';
import { LayoutDashboard, Building2, FolderKanban, ListChecks, Users, FileBarChart, Sparkles, ScrollText, LogOut, Menu, KeyRound, X } from 'lucide-react';
import { api } from '@/lib/client';
import { ROLE_LABEL } from '@/lib/constants';
import { Avatar, Modal, Input, ErrorBox } from './ui';

const UserCtx = createContext(null);
export const useUser = () => useContext(UserCtx);

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Building2, roles: ['super_admin', 'admin', 'manager'] },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/tasks', label: 'Tasks', icon: ListChecks },
  { href: '/users', label: 'Users', icon: Users, roles: ['super_admin', 'admin'] },
  { href: '/reports', label: 'Reports', icon: FileBarChart, roles: ['super_admin', 'admin', 'manager', 'team_lead'] },
  { href: '/ai', label: 'AI Assistant', icon: Sparkles },
  { href: '/audit', label: 'Audit Log', icon: ScrollText, roles: ['super_admin', 'admin'] },
];

export default function Shell({ user, children }) {
  const path = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(false); const [pw, setPw] = useState(false);
  const [form, setForm] = useState({ current: '', next: '' }); const [err, setErr] = useState(''); const [ok, setOk] = useState(false);
  const logout = async () => { await api('auth/logout', { method: 'POST' }); router.replace('/login'); router.refresh(); };
  const changePw = async (e) => { e.preventDefault(); setErr(''); try { await api('auth/password', { method: 'POST', body: form }); setOk(true); setForm({ current: '', next: '' }); } catch (x) { setErr(x.message); } };
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role));
  const sidebar = (
    <div className="flex h-full flex-col bg-brand-900 text-cream">
      <div className="flex items-center gap-3 px-5 py-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cream text-brand-900"><FolderKanban className="h-5 w-5" /></span><div><div className="text-lg leading-none tracking-wide">PMS India</div><div className="mt-1 text-[10px] uppercase tracking-[.25em] text-cream/60">Project Control</div></div></div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + '/');
          return <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm tracking-wide transition ${active ? 'bg-cream text-brand-900' : 'text-cream/80 hover:bg-brand-800 hover:text-cream'}`}><Icon className="h-[18px] w-[18px]" />{label}</Link>;
        })}
      </nav>
      <div className="border-t border-cream/15 p-4">
        <div className="mb-3 flex items-center gap-3"><Avatar name={user.name} /><div className="min-w-0"><div className="truncate text-sm">{user.name}</div><div className="text-xs text-cream/60">{ROLE_LABEL[user.role]}</div></div></div>
        <div className="flex gap-2"><button onClick={() => setPw(true)} className="btn flex-1 bg-brand-800 !py-1.5 text-cream hover:bg-brand-700"><KeyRound className="h-4 w-4" />Password</button><button onClick={logout} className="btn flex-1 bg-brand-800 !py-1.5 text-cream hover:bg-brand-700"><LogOut className="h-4 w-4" />Sign out</button></div>
      </div>
    </div>
  );
  return (
    <UserCtx.Provider value={user}>
      <div className="min-h-screen lg:pl-64">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
        {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-brand-950/50" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 left-0 w-64"><button className="absolute right-2 top-2 z-10 text-cream" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>{sidebar}</aside></div>}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-cream-300 bg-cream-50/90 px-4 py-3 backdrop-blur lg:hidden"><button onClick={() => setOpen(true)} className="btn btn-ghost !p-2"><Menu className="h-5 w-5" /></button><span className="text-brand-900">PMS India</span></header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
      <Modal open={pw} onClose={() => { setPw(false); setOk(false); setErr(''); }} title="Change password">
        <form onSubmit={changePw} className="space-y-4">
          <ErrorBox>{err}</ErrorBox>{ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Password updated.</p>}
          <Input label="Current password" type="password" required value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
          <Input label="New password" type="password" required minLength={8} hint="At least 8 characters" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
          <button className="btn btn-primary w-full">Update password</button>
        </form>
      </Modal>
    </UserCtx.Provider>
  );
}
