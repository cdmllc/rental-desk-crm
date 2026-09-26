import { NextResponse } from 'next/server';
import { authenticate, AuthError, sessionCookie } from '@/lib/crm/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    if (!body.email || !body.password) return NextResponse.json({ error: 'メールアドレスとパスワードを入力してください' }, { status: 400 });
    const result = await authenticate(body.email, body.password);
    const response = NextResponse.json({ session: result.session });
    const cookie = sessionCookie(result.token);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 503;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'ログインできませんでした' }, { status });
  }
}
