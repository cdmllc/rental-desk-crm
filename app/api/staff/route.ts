import { env } from 'cloudflare:workers';
import { AuthError, currentCrmSession } from '@/lib/crm/auth';
import { today } from '@/lib/crm/model';
import { dailyReportSchema, workforceDataSchema, type WorkforceData, type WorkforceStaff } from '@/lib/workforce/model';
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

async function loadData() {
  const db = await database();
  const row = await db.prepare('SELECT data FROM workforce_state WHERE workspace_id=?').bind(workspace).first<{ data: string }>();
  const parsed = row ? workforceDataSchema.parse(JSON.parse(row.data)) : sampleWorkforceData();
  const cleaned = removeSampleWorkforceData(parsed);
  if (row && JSON.stringify(cleaned) !== JSON.stringify(parsed)) return saveData(cleaned);
  return cleaned;
}

async function saveData(data: WorkforceData) {
  const db = await database(), next = { ...data, updatedAt: new Date().toISOString() };
  await db.prepare(`INSERT INTO workforce_state (workspace_id,data,updated_at) VALUES (?,?,?)
    ON CONFLICT(workspace_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`)
    .bind(workspace, JSON.stringify(next), Date.now()).run();
  return next;
}

async function requireStaffContext() {
  const session = await currentCrmSession();
  if (!session) throw new AuthError('ログインが必要です', 401, 'LOGIN_REQUIRED');
  if (session.mustChangePassword) throw new AuthError('初期パスワードを変更してください', 403, 'PASSWORD_CHANGE_REQUIRED');
  if (session.workforceAccess !== 'staff' && session.workforceAccess !== 'admin') throw new AuthError('スタッフ画面の利用権限がありません', 403, 'STAFF_ACCESS_DENIED');
  let data = await loadData();
  let staff = data.staff.find(item => item.userId === session.userId) || data.staff.find(item => item.email.toLowerCase() === session.email.toLowerCase());
  if (staff && staff.userId !== session.userId) {
    staff = { ...staff, userId: session.userId, email: session.email };
    data = await saveData({ ...data, staff: data.staff.map(item => item.id === staff!.id ? staff! : item) });
  }
  if (!staff && session.workforceAccess === 'staff') {
    const companyId = data.companies.find(item => item.active)?.id, employmentTypeId = data.employmentTypes.find(item => item.active)?.id;
    if (!companyId || !employmentTypeId) throw new AuthError('管理者による会社・雇用区分の設定が必要です', 409, 'STAFF_SETUP_REQUIRED');
    staff = {
      id: crypto.randomUUID(), userId: session.userId, name: session.displayName, email: session.email,
      companyId, employmentTypeId, status: 'active',
      payRates: [{ id: crypto.randomUUID(), startDate: `${new Date().toISOString().slice(0, 7)}-01`, endDate: '', dailyRate: 0 }],
    } satisfies WorkforceStaff;
    data = await saveData({ ...data, staff: [staff, ...data.staff] });
  }
  if (!staff || staff.status !== 'active') throw new AuthError('有効なスタッフ情報が見つかりません', 403, 'STAFF_PROFILE_UNAVAILABLE');
  return { session, staff, data };
}

function ownData(data: WorkforceData, staff: WorkforceStaff): WorkforceData {
  return {
    ...data,
    staff: [staff],
    reports: data.reports.filter(report => report.staffId === staff.id),
    monthlySnapshots: data.monthlySnapshots.map(snapshot => ({ ...snapshot, entries: snapshot.entries.filter(entry => entry.staffId === staff.id) })).filter(snapshot => snapshot.entries.length > 0),
    revenuePlans: [],
  };
}

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : 'スタッフ情報を処理できませんでした', code: error instanceof AuthError ? error.code : undefined }, { status: error instanceof AuthError ? error.status : 503 });
}

export async function GET() {
  try {
    const { session, staff, data } = await requireStaffContext();
    return Response.json({ data: ownData(data, staff), session });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const { session, staff, data } = await requireStaffContext();
    const parsed = dailyReportSchema.safeParse((await request.json() as { report?: unknown }).report);
    if (!parsed.success) throw new AuthError('日報の入力内容を確認してください', 400);
    const report = parsed.data, existing = data.reports.find(item => item.id === report.id);
    if (report.staffId !== staff.id || existing && existing.staffId !== staff.id) throw new AuthError('この日報は更新できません', 403);
    if (report.date > today()) throw new AuthError('未来の日付の日報は登録できません', 400);
    if (existing?.status === 'approved' || existing?.status === 'submitted') throw new AuthError('提出済みまたは承認済みの日報は編集できません', 409);
    if (report.status !== 'draft' && report.status !== 'submitted') throw new AuthError('保存状態を確認してください', 400);
    if (report.status === 'submitted' && report.transportationCost > 0 && !report.transportationReceipt) throw new AuthError('交通費を申請する場合は領収書を添付してください', 400);
    if (report.transportationReceipt && !/^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,/.test(report.transportationReceipt)) throw new AuthError('領収書のファイル形式を確認してください', 400);
    if (data.reports.some(item => item.staffId === staff.id && item.date === report.date && item.id !== report.id)) throw new AuthError('この日付の日報は登録済みです', 409);
    if (!data.projects.some(item => item.id === report.projectId && item.active) || !data.sites.some(item => item.id === report.siteId && item.active) || !data.workTypes.some(item => item.id === report.workTypeId && item.active)) throw new AuthError('案件・現場・稼働区分を確認してください', 400);
    const allowedPerformance = new Set(data.performanceItems.filter(item => item.projectId === report.projectId && item.active).map(item => item.id));
    if (Object.keys(report.performance).some(itemId => !allowedPerformance.has(itemId))) throw new AuthError('成績項目を確認してください', 400);
    const nextReport = {
      ...report,
      submittedAt: report.status === 'submitted' ? new Date().toISOString() : '',
      reviewedAt: '', reviewedBy: '',
      returnComment: existing?.returnComment || '',
    };
    const reports = existing ? data.reports.map(item => item.id === report.id ? nextReport : item) : [nextReport, ...data.reports];
    const next = await saveData({ ...data, reports });
    return Response.json({ data: ownData(next, staff), session });
  } catch (error) { return errorResponse(error); }
}
