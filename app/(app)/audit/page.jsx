'use client';
import { ScrollText, Bot } from 'lucide-react';
import { useFetch, fmtDateTime } from '@/lib/client';
import { PageHeader, PageLoader, ErrorBox, Badge } from '@/components/ui';
export default function Audit() {
  const { data, loading, error } = useFetch('audit?limit=300');
  return (<><PageHeader icon={ScrollText} title="Audit log" subtitle="Every change, by people and by the AI assistant" />
    {error && <ErrorBox>{error}</ErrorBox>}{loading ? <PageLoader /> : (
      <div className="card overflow-x-auto"><table className="w-full"><thead className="border-b border-cream-300"><tr>{['When', 'User', 'Via', 'Action', 'Entity', 'Summary'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-cream-200">{data.map((a) => <tr key={a.id}><td className="td whitespace-nowrap text-xs">{fmtDateTime(a.createdAt)}</td><td className="td">{a.user?.name}</td><td className="td">{a.via === 'ai' ? <span className="flex items-center gap-1 text-brand-900"><Bot className="h-4 w-4" />AI</span> : 'UI'}</td><td className="td"><Badge>{a.action}</Badge></td><td className="td">{a.entity}</td><td className="td">{a.summary}</td></tr>)}</tbody></table></div>)}</>);
}
