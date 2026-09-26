import { AuthError, currentCrmSession, listAccessRequests, reviewAccessRequest, submitAccessRequest } from '@/lib/crm/auth';

export const dynamic = 'force-dynamic';

function responseError(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : '申請を処理できませんでした' }, { status: error instanceof AuthError ? error.status : 503 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; displayName?: string; password?: string; requestedPortal?: 'crm' | 'staff' };
    if (!body.email || !body.displayName || !body.password) throw new AuthError('すべての項目を入力してください', 400);
    return Response.json({ request: await submitAccessRequest({ email: body.email, displayName: body.displayName, password: body.password, requestedPortal: body.requestedPortal === 'staff' ? 'staff' : 'crm' }) });
  } catch (error) { return responseError(error); }
}

export async function GET() {
  try {
    const session = await currentCrmSession();
    if (!session?.isAdmin || session.mustChangePassword) throw new AuthError('管理者権限が必要です', 403);
    return Response.json({ requests: await listAccessRequests() });
  } catch (error) { return responseError(error); }
}

export async function PATCH(request: Request) {
  try {
    const session = await currentCrmSession();
    if (!session?.isAdmin || session.mustChangePassword) throw new AuthError('管理者権限が必要です', 403);
    const body = await request.json() as { id?: string; decision?: 'approve' | 'reject' };
    if (!body.id || !body.decision || !['approve', 'reject'].includes(body.decision)) throw new AuthError('入力内容を確認してください', 400);
    return Response.json(await reviewAccessRequest(session, body.id, body.decision));
  } catch (error) { return responseError(error); }
}
