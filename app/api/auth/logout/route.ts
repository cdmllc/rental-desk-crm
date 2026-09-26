import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clearSessionCookie, revokeSession } from '@/lib/crm/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const cookie = clearSessionCookie();
  await revokeSession((await cookies()).get(cookie.name)?.value);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
