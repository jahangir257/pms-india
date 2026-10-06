'use client';
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, ShieldCheck, FileText, Download, Wrench, Check, X, Trash2 } from 'lucide-react';
import { api } from '@/lib/client';
import { PageHeader, Spinner } from '@/components/ui';
import Markdown from '@/components/Markdown';

const IDEAS = ['Give me a summary of all active projects and what is overdue', 'Generate an Excel report of all open tasks', 'Create a PDF status report for each project in progress', 'Create an illustration banner for a project kickoff'];
export default function AI() {
  const [msgs, setMsgs] = useState([]); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [loadingHist, setLoadingHist] = useState(true); const end = useRef();
  useEffect(() => { let off = false; api('ai/history').then((h) => { if (!off) setMsgs(h || []); }).catch(() => {}).finally(() => { if (!off) setLoadingHist(false); }); return () => { off = true; }; }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: loadingHist ? 'auto' : 'smooth' }); }, [msgs, busy, loadingHist]);
  const clear = async () => { if (!msgs.length || busy || !window.confirm('Clear your entire AI chat history?')) return; try { await api('ai/history', { method: 'DELETE' }); setMsgs([]); } catch (e) { alert(e.message); } };
  const send = async (m) => {
    const message = (m ?? text).trim(); if (!message || busy) return;
    const history = msgs.map((x) => ({ role: x.role, text: x.text })); setMsgs((x) => [...x, { role: 'user', text: message }]); setText(''); setBusy(true);
    try { const r = await api('ai/chat', { method: 'POST', body: { message, history } }); setMsgs((x) => [...x, { role: 'model', text: r.reply, files: r.files, actions: r.actions }]); }
    catch (e) { setMsgs((x) => [...x, { role: 'model', text: 'Error: ' + e.message, error: true }]); } finally { setBusy(false); }
  };
  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col lg:h-[calc(100vh-4rem)]">
      <PageHeader icon={Sparkles} title="AI Assistant" subtitle="Creates, updates, analyses and generates files for you. Never deletes."><div className="flex items-center gap-2"><span className="flex items-center gap-1 rounded-full bg-cream px-3 py-1 text-xs text-brand-900"><ShieldCheck className="h-4 w-4" />Delete is disabled for AI</span><button type="button" className="btn btn-soft !px-3 !py-1 text-xs" onClick={clear} disabled={!msgs.length || busy}><Trash2 className="h-4 w-4" />Clear chat</button></div></PageHeader>
      <div className="card flex-1 space-y-4 overflow-y-auto p-4">
        {loadingHist && <div className="flex items-center gap-2 text-sm text-brand-900/60"><Spinner />Loading chat history...</div>}
        {!loadingHist && !msgs.length && <div className="mx-auto max-w-xl py-10 text-center"><Sparkles className="mx-auto mb-3 h-10 w-10 text-brand-900" /><p className="mb-5 text-brand-900/70">Ask in plain language. The assistant works with your exact permissions.</p><div className="grid gap-2 sm:grid-cols-2">{IDEAS.map((i) => <button key={i} onClick={() => send(i)} className="rounded-lg border border-cream-300 bg-white p-3 text-left text-sm text-brand-900 hover:border-brand-900/40">{i}</button>)}</div></div>}
        {msgs.map((m, i) => <div key={m.id || i} className={`flex ${m.role === 'user' ? 'justify-end' : ''}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${m.role === 'user' ? 'bg-brand-900 text-cream' : m.error ? 'bg-red-50 text-red-800' : 'bg-cream-100 text-brand-950'}`}>
          {m.role === 'user' ? <div className="whitespace-pre-wrap break-words">{m.text}</div> : <Markdown text={m.text} />}
          {m.files?.map((f) => f.kind === 'image'
            ? <a key={f.id} href={`${f.url}?download=1`} className="mt-3 block"><img src={f.url} alt={f.name} className="max-h-80 rounded-lg border border-cream-300" /><span className="mt-1 flex items-center gap-1 text-xs"><Download className="h-3 w-3" />{f.name}</span></a>
            : <a key={f.id} href={`${f.url}?download=1`} className="mt-3 flex items-center gap-2 rounded-lg border border-brand-900/20 bg-white px-3 py-2 text-brand-900 hover:bg-cream-50"><FileText className="h-4 w-4" />{f.name}<Download className="ml-auto h-4 w-4" /></a>)}
          {m.actions?.length > 0 && <details className="mt-2 text-xs opacity-80"><summary className="flex cursor-pointer items-center gap-1"><Wrench className="h-3 w-3" />{m.actions.length} action(s)</summary><ul className="mt-1 space-y-0.5">{m.actions.map((a, k) => <li key={k} className="flex items-center gap-1">{a.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 text-red-600" />}{a.tool}{a.error && `: ${a.error}`}</li>)}</ul></details>}
        </div></div>)}
        {busy && <div className="flex items-center gap-2 text-sm text-brand-900/60"><Spinner />Working...</div>}<div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-3 flex gap-2"><input className="input !py-3" placeholder="e.g. Create module 'Payments' in PRJ-0001 and assign tasks to Priya" value={text} onChange={(e) => setText(e.target.value)} /><button className="btn btn-primary !px-5" disabled={busy}><Send className="h-4 w-4" />Send</button></form>
    </div>
  );
}
