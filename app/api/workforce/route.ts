import { env } from 'cloudflare:workers';
import { AuthError, requireCrmSession } from '@/lib/crm/auth';
import { workforceDataSchema } from '@/lib/workforce/model';
import { removeSampleWorkforceData, sampleWorkforceData } from '@/lib/workforce/seed';

export const dynamic = 'force-dynamic';
const workspace = 'primary';

async function database() {
  if (!env.DB) throw new Error('Database binding unavailable');
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS workforce_state (
    workspace_id TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  return env.DB;
}

async function requireWorkforceAdmin() {
  const session = await requireCrmSession();
  if (session.workforceAccess !== 'admin') throw new AuthError('稼働・報酬の管理権限が必要です', 403);
  return session;
}

export async function GET() {
  try {
    const session = await requireWorkforceAdmin(), db = await database();
    const row = await db.prepare('SELECT data FROM workforce_state WHERE workspace_id=?').bind(workspace).first<{ data: string }>();
    const parsed = row ? workforceDataSchema.parse(JSON.parse(row.data)) : sampleWorkforceData();
    const data = removeSampleWorkforceData(parsed);
    if (row && JSON.stringify(data) !== JSON.stringify(parsed)) await db.prepare('UPDATE workforce_state SET data=?,updated_at=? WHERE workspace_id=?').bind(JSON.stringify(data), Date.now(), workspace).run();
    return Response.json({ data, session });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '稼働データを読み込めませんでした' }, { status: error instanceof AuthError ? error.status : 503 });
  }
}

export async function PUT(request: Request) {
  try {
    await requireWorkforceAdmin();
    const parsed = workforceDataSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: '入力内容を確認してください', issues: parsed.error.issues }, { status: 400 });
    const db = await database(), data = { ...removeSampleWorkforceData(parsed.data), updatedAt: new Date().toISOString() };
    await db.prepare(`INSERT INTO workforce_state (workspace_id,data,updated_at) VALUES (?,?,?)
      ON CONFLICT(workspace_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`)
      .bind(workspace, JSON.stringify(data), Date.now()).run();
    return Response.json({ data, savedAt: data.updatedAt });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '稼働データを保存できませんでした' }, { status: error instanceof AuthError ? error.status : 503 });
  }
}
