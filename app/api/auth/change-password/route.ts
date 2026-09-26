import { currentCrmSession, changeOwnPassword, AuthError } from '@/lib/crm/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await currentCrmSession();
    if (!session) return Response.json({ error: 'ログインが必要です' }, { status: 401 });
    const body = await request.json() as { currentPassword?: string; newPassword?: string };
    if (!body.currentPassword || !body.newPassword) return Response.json({ error: '現在と新しいパスワードを入力してください' }, { status: 400 });
    await changeOwnPassword(session, body.currentPassword, body.newPassword);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'パスワードを変更できませんでした' }, { status: error instanceof AuthError ? error.status : 503 });
  }
}
