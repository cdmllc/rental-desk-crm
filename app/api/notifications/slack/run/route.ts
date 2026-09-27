import { processSlackTaskNotifications, verifySlackCronSecret } from '@/lib/crm/slack-notifications';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!verifySlackCronSecret(request.headers.get('authorization'))) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await processSlackTaskNotifications();
    return Response.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Slack通知を処理できませんでした' }, { status: 503 });
  }
}
