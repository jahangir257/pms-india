'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, Sparkles, ShieldCheck, FileBarChart, LogIn } from 'lucide-react';
import { api } from '@/lib/client';
import { ErrorBox, Spinner } from '@/components/ui';

export default function Login() {
  const router = useRouter();
  const [f, setF] = useState({ email: '', password: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await api('auth/login', { method: 'POST', body: f }); router.replace('/dashboard'); router.refresh(); } catch (x) { setErr(x.message); setBusy(false); } };
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-900 p-12 text-cream lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full border border-cream/10" /><div className="absolute -bottom-32 -left-16 h-[28rem] w-[28rem] rounded-full border border-cream/10" />
        <div className="relative flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-cream text-brand-900"><FolderKanban className="h-6 w-6" /></span><span className="text-2xl tracking-wide">PMS India</span></div>
        <div className="relative max-w-lg">
          <h1 className="text-5xl leading-tight tracking-wide">Every project.<br />Every module.<br />One clear line of command.</h1>
          <p className="mt-6 text-lg text-cream/70">Clients, projects, modules and tasks, assigned from Super Admin down to the last employee, with an AI operator that works for you but never deletes a thing.</p>
          <ul className="mt-10 space-y-4 text-cream/85">
            <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" />Five-level role based access</li>
            <li className="flex items-center gap-3"><Sparkles className="h-5 w-5" />Gemini automation with a no-delete guarantee</li>
            <li className="flex items-center gap-3"><FileBarChart className="h-5 w-5" />PDF, Excel and CSV reports on demand</li>
          </ul>
        </div>
        <p className="relative text-sm text-cream/50">Asia/Kolkata | INR | GSTIN ready</p>
      </section>
      <section className="flex items-center justify-center bg-cream-50 p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div><h2 className="text-3xl text-brand-900">Sign in</h2><p className="mt-1 text-sm text-brand-900/60">Use the credentials issued by your administrator.</p></div>
          <ErrorBox>{err}</ErrorBox>
          <label className="block"><span className="mb-1 block text-xs uppercase tracking-widest text-brand-900/70">Email</span><input className="input" type="email" required autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs uppercase tracking-widest text-brand-900/70">Password</span><input className="input" type="password" required autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
          <button className="btn btn-primary w-full !py-2.5" disabled={busy}>{busy ? <Spinner className="!text-cream" /> : <LogIn className="h-4 w-4" />}Sign in</button>
        </form>
      </section>
    </div>
  );
}
