'use client';
import { useCallback, useEffect, useState } from 'react';
const TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE || 'Asia/Kolkata';
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api/' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let data = null; try { data = await res.json(); } catch {}
  if (res.status === 401 && !path.startsWith('auth/')) { window.location.href = '/login'; throw new Error('Session expired'); }
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data;
}
export function useFetch(path) {
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { if (!path) return; setLoading(true); try { setData(await api(path)); setError(''); } catch (e) { setError(e.message); } finally { setLoading(false); } }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }) : '-');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
export const toInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const inr = (n, c = 'INR') => (n ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: c || 'INR', maximumFractionDigits: 0 }).format(n) : '-');
export const isAdminRole = (r) => r === 'super_admin' || r === 'admin';
export const isOverdue = (t) => t.dueDate && t.status !== 'done' && new Date(t.dueDate) < new Date();
