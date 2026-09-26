import { AuthError, createUser, listUsers, requireCrmSession, updateUser } from '@/lib/crm/auth';
import { userRoles, type UserRole } from '@/lib/crm/model';
import { crmAccessLevels, workforceAccessLevels, type CrmAccess, type WorkforceAccess } from '@/lib/workforce/model';

export const dynamic = 'force-dynamic';

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : '担当者情報を更新できませんでした' }, { status: error instanceof AuthError ? error.status : 503 });
}

export async function GET() {
  try {
    const session = await requireCrmSession();
    if (!session.isAdmin) throw new AuthError('管理者権限が必要です', 403);
    return Response.json({ users: await listUsers() });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireCrmSession();
    if (!session.isAdmin) throw new AuthError('管理者権限が必要です', 403);
    const body = await request.json() as { email?: string; displayName?: string; role?: UserRole; crmAccess?: CrmAccess; workforceAccess?: WorkforceAccess; initialPassword?: string };
    if (!body.email || !/^\S+@\S+\.\S+$/.test(body.email) || !body.displayName?.trim() || !body.initialPassword || !body.role || !userRoles.includes(body.role) || body.crmAccess && !crmAccessLevels.includes(body.crmAccess) || body.workforceAccess && !workforceAccessLevels.includes(body.workforceAccess)) throw new AuthError('入力内容を確認してください', 400);
    return Response.json({ user: await createUser({ email: body.email, displayName: body.displayName, role: body.role, crmAccess: body.crmAccess, workforceAccess: body.workforceAccess, initialPassword: body.initialPassword }) });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireCrmSession();
    if (!session.isAdmin) throw new AuthError('管理者権限が必要です', 403);
    const body = await request.json() as { id?: string; displayName?: string; role?: UserRole; crmAccess?: CrmAccess; workforceAccess?: WorkforceAccess; active?: boolean; initialPassword?: string };
    if (!body.id || body.role && !userRoles.includes(body.role) || body.crmAccess && !crmAccessLevels.includes(body.crmAccess) || body.workforceAccess && !workforceAccessLevels.includes(body.workforceAccess)) throw new AuthError('入力内容を確認してください', 400);
    return Response.json({ user: await updateUser(session, { ...body, id: body.id }) });
  } catch (error) { return errorResponse(error); }
}
