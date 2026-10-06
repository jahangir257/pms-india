'use client';
import { useEffect } from 'react';
import { X, Loader2, Inbox, AlertCircle } from 'lucide-react';
import { label } from '@/lib/constants';

export const Spinner = ({ className = '' }) => <Loader2 className={`h-5 w-5 animate-spin text-brand-900 ${className}`} />;
export const PageLoader = () => <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;
export const ErrorBox = ({ children }) => children ? <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{children}</div> : null;
export const Empty = ({ icon: Icon = Inbox, title = 'Nothing here yet', children }) => (
  <div className="flex flex-col items-center gap-2 py-14 text-center text-brand-900/60"><Icon className="h-9 w-9" /><p className="text-base text-brand-900">{title}</p>{children && <p className="max-w-sm text-sm">{children}</p>}</div>
);
export function PageHeader({ title, subtitle, children, icon: Icon }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-900 text-cream"><Icon className="h-5 w-5" /></span>}
        <div><h1 className="text-2xl text-brand-900">{title}</h1>{subtitle && <p className="text-sm text-brand-900/60">{subtitle}</p>}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
export function Modal({ open, onClose, title, children, wide, footer }) {
  useEffect(() => { if (!open) return; const h = (e) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-950/50 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`my-8 w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} rounded-2xl border border-cream-300 bg-cream-50 shadow-2xl`} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-cream-300 px-5 py-4"><h2 className="text-lg text-brand-900">{title}</h2><button onClick={onClose} className="btn btn-ghost !p-1.5" aria-label="Close"><X className="h-5 w-5" /></button></div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-cream-300 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
export function Field({ label: l, children, hint, required, className = '' }) {
  return <label className={`block ${className}`}><span className="mb-1 block text-xs uppercase tracking-widest text-brand-900/70">{l}{required && <span className="text-red-600"> *</span>}</span>{children}{hint && <span className="mt-1 block text-xs text-brand-900/50">{hint}</span>}</label>;
}
export const Input = ({ label: l, hint, required, className, ...p }) => <Field label={l} hint={hint} required={required} className={className}><input className="input" required={required} {...p} /></Field>;
export const Textarea = ({ label: l, hint, className, ...p }) => <Field label={l} hint={hint} className={className}><textarea className="input min-h-[84px]" {...p} /></Field>;
export function Select({ label: l, options = [], placeholder, className, required, hint, ...p }) {
  return (
    <Field label={l} className={className} required={required} hint={hint}>
      <select className="input" required={required} {...p}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{label(o)}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}
const TONES = {
  active: 'bg-emerald-100 text-emerald-900', completed: 'bg-brand-900 text-cream', done: 'bg-brand-900 text-cream', in_progress: 'bg-sky-100 text-sky-900',
  planning: 'bg-amber-100 text-amber-900', todo: 'bg-stone-200 text-stone-800', in_review: 'bg-violet-100 text-violet-900', blocked: 'bg-red-100 text-red-800',
  on_hold: 'bg-orange-100 text-orange-900', cancelled: 'bg-stone-300 text-stone-700', prospect: 'bg-amber-100 text-amber-900', inactive: 'bg-stone-200 text-stone-700',
  low: 'bg-stone-100 text-stone-700', medium: 'bg-sky-100 text-sky-900', high: 'bg-orange-100 text-orange-900', critical: 'bg-red-100 text-red-800', not_started: 'bg-stone-200 text-stone-800',
};
export const Badge = ({ value, children, tone }) => <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs tracking-wide ${TONES[tone || value] || 'bg-cream text-brand-900'}`}>{children || label(value)}</span>;
export const Progress = ({ value = 0 }) => {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return <div className="flex items-center gap-2"><div className="progress-track" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}><div className="progress-fill" style={{ width: `${v}%` }} /></div><span className="w-10 shrink-0 whitespace-nowrap text-right text-xs text-brand-900/70">{v}%</span></div>;
};
export const Stat = ({ icon: Icon, label: l, value, hint, tone = 'bg-brand-900 text-cream' }) => (
  <div className="card flex items-center gap-4 p-4"><span className={`grid h-12 w-12 place-items-center rounded-xl ${tone}`}><Icon className="h-6 w-6" /></span><div><div className="text-2xl leading-none text-brand-900">{value}</div><div className="mt-1 text-xs uppercase tracking-widest text-brand-900/60">{l}</div>{hint && <div className="text-xs text-brand-900/50">{hint}</div>}</div></div>
);
export const Avatar = ({ name = '?', size = 'h-8 w-8' }) => <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-cream text-xs uppercase text-brand-900 ring-1 ring-brand-900/20`}>{name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>;
export const Confirm = ({ open, onClose, onConfirm, title, children, busy }) => (
  <Modal open={open} onClose={onClose} title={title} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-danger" disabled={busy} onClick={onConfirm}>{busy ? 'Working...' : 'Confirm'}</button></>}>{children}</Modal>
);
