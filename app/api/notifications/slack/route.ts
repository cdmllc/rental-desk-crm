import { AuthError, requireCrmSession } from '@/lib/crm/auth';
import {
  listSlackNotificationHistory, previewSlackTaskNotifications, sendSlackTestMessage, slackNotificationConfig,
} from '@/lib/crm/slack-notifications';

export const dynamic = 'force-dynamic';

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : 'Slack通知設定を処理できませんでした' }, { status: error instanceof AuthError ? error.status : 503 });
}

async function requireAdmin() {
  const session = await requireCrmSession();
  if (!session.isAdmin) throw new AuthError('管理者権限が必要です', 403);
  return session;
}

export async function GET() {
  try {
    await requireAdmin();
    const [history, preview] = await Promise.all([listSlackNotificationHistory(30), previewSlackTaskNotifications()]);
    return Response.json({ config: slackNotificationConfig(), history, preview });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const body = await request.json() as { action?: 'preview' | 'test' };
    if (body.action === 'preview') return Response.json({ preview: await previewSlackTaskNotifications() });
    if (body.action === 'test') return Response.json(await sendSlackTestMessage(session.displayName));
    throw new AuthError('操作を選択してください', 400);
  } catch (error) { return errorResponse(error); }
}
