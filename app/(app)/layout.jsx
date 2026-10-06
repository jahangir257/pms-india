import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { connect } from '@/lib/db';
import { User } from '@/lib/models';
import { verifyToken, COOKIE } from '@/lib/auth';
import Shell from '@/components/Shell';

export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }) {
  const token = cookies().get(COOKIE)?.value;
  const payload = token ? await verifyToken(token) : null;
  if (!payload) redirect('/login');
  await connect();
  const u = await User.findById(payload.sub);
  if (!u || !u.active) redirect('/login');
  return <Shell user={{ id: u.id, name: u.name, email: u.email, role: u.role }}>{children}</Shell>;
}
