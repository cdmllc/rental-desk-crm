import { env } from "cloudflare:workers";
import { dataSchema } from "@/lib/crm/model";
import { sampleData } from "@/lib/crm/seed";

export const dynamic = "force-dynamic";
const workspace = "primary";

export async function GET() {
  try {
    const database = env.DB;
    if (!database) throw new Error("Database binding unavailable");
    const row = await database.prepare(
      "SELECT data FROM crm_state WHERE workspace_id = ?",
    ).bind(workspace).first<{ data: string }>();
    return Response.json(row ? JSON.parse(row.data) : sampleData());
  } catch (error) {
    console.error("CRM read failed", error);
    return Response.json({ error: "データを読み込めませんでした" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const database = env.DB;
    if (!database) throw new Error("Database binding unavailable");
    const parsed = dataSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "入力内容を確認してください" }, { status: 400 });
    }
    await database.prepare(
      `INSERT INTO crm_state (workspace_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).bind(workspace, JSON.stringify(parsed.data), Date.now()).run();
    return Response.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error("CRM write failed", error);
    return Response.json({ error: "保存できませんでした。もう一度お試しください" }, { status: 503 });
  }
}
