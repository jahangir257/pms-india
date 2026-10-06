import { SignJWT, jwtVerify } from 'jose';
export const COOKIE = 'pms_session';
const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (min 32 chars)');
  return new TextEncoder().encode(s);
};
export async function signToken(userId, role) {
  return new SignJWT({ role }).setProtectedHeader({ alg: 'HS256' }).setSubject(String(userId)).setIssuedAt().setExpirationTime('12h').sign(secret());
}
export async function verifyToken(token) {
  try { const { payload } = await jwtVerify(token, secret()); return payload; } catch { return null; }
}
