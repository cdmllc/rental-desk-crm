import { currentCrmSession } from '@/lib/crm/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await currentCrmSession();
  return session ? Response.json({ session }) : Response.json({ error: 'ログインが必要です' }, { status: 401 });
}
