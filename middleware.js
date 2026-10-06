import { NextResponse } from 'next/server';
import { verifyToken, COOKIE } from '@/lib/auth';
export async function middleware(req) {
  const token = req.cookies.get(COOKIE)?.value;
  const valid = token ? await verifyToken(token) : null;
  const { pathname } = req.nextUrl;
  if (pathname === '/login') return valid ? NextResponse.redirect(new URL('/dashboard', req.url)) : NextResponse.next();
  if (!valid) return NextResponse.redirect(new URL('/login', req.url));
  if (pathname === '/') return NextResponse.redirect(new URL('/dashboard', req.url));
  return NextResponse.next();
}
export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'] };
