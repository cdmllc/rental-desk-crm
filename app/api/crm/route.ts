import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { dataSchema, ownsCustomer, type CrmSession, type Data } from '@/lib/crm/model';
import { sampleData } from '@/lib/crm/seed';

export const dynamic = 'force-dynamic';
const workspace = 'primary';
const administratorEmails = new Set(['ceo@cdm-lifesupport.com']);

async function currentSession(): Promise<CrmSession | null> {
  const user = await getChatGPTUser();
  if (user) return { userId: user.userId, email: user.email, displayName: user.displayName, isAdmin: administratorEmails.has(user.email.toLowerCase()) };
  if (process.env.NODE_ENV === 'development') return { userId: 'local-admin', email: 'ceo@cdm-lifesupport.com', displayName: '開発管理者', isAdmin: true };
  return null;
}

async function readMasterData(): Promise<Data> {
  const database = env.DB;
  if (!database) throw new Error('Database binding unavailable');
  const row = await database.prepare('SELECT data FROM crm_state WHERE workspace_id = ?').bind(workspace).first<{ data: string }>();
  return row ? dataSchema.parse(JSON.parse(row.data)) : sampleData();
}

function filteredData(data: Data, session: CrmSession): Data {
  if (session.isAdmin) return data;
  const customers = data.customers.filter(customer => ownsCustomer(customer, session));
  const customerIds = new Set(customers.map(customer => customer.id));
  const deals = data.deals.filter(deal => customerIds.has(deal.customerId));
  const dealIds = new Set(deals.map(deal => deal.id));
  return { ...data, customers, deals, tasks: data.tasks.filter(task => !task.dealId || dealIds.has(task.dealId)) };
}

function mergeStaffData(master: Data, incoming: Data, session: CrmSession): Data {
  if (incoming.customers.some(customer => !ownsCustomer(customer, session))) throw new Error('担当外の顧客は更新できません');
  const incomingCustomerIds = new Set(incoming.customers.map(customer => customer.id));
  if (incoming.deals.some(deal => !incomingCustomerIds.has(deal.customerId))) throw new Error('担当外の案件は更新できません');
  const incomingDealIds = new Set(incoming.deals.map(deal => deal.id));
  if (incoming.tasks.some(task => task.dealId && !incomingDealIds.has(task.dealId))) throw new Error('担当外のタスクは更新できません');

  const ownedCustomerIds = new Set(master.customers.filter(customer => ownsCustomer(customer, session)).map(customer => customer.id));
  const ownedDealIds = new Set(master.deals.filter(deal => ownedCustomerIds.has(deal.customerId)).map(deal => deal.id));
  return {
    customers: [...master.customers.filter(customer => !ownedCustomerIds.has(customer.id)), ...incoming.customers],
    deals: [...master.deals.filter(deal => !ownedCustomerIds.has(deal.customerId)), ...incoming.deals],
    tasks: [...master.tasks.filter(task => !ownedDealIds.has(task.dealId)), ...incoming.tasks],
    products: master.products,
    settings: master.settings,
  };
}

export async function GET() {
  try {
    const session = await currentSession();
    if (!session) return Response.json({ error: 'ログインが必要です' }, { status: 401 });
    return Response.json({ data: filteredData(await readMasterData(), session), session });
  } catch (error) {
    console.error('CRM read failed', error);
    return Response.json({ error: 'データを読み込めませんでした' }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await currentSession();
    if (!session) return Response.json({ error: 'ログインが必要です' }, { status: 401 });
    const parsed = dataSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: '入力内容を確認してください' }, { status: 400 });
    const master = await readMasterData();
    const next = session.isAdmin ? parsed.data : mergeStaffData(master, parsed.data, session);
    const database = env.DB;
    if (!database) throw new Error('Database binding unavailable');
    await database.prepare(
      `INSERT INTO crm_state (workspace_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).bind(workspace, JSON.stringify(next), Date.now()).run();
    return Response.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error('CRM write failed', error);
    return Response.json({ error: error instanceof Error ? error.message : '保存できませんでした。もう一度お試しください' }, { status: 503 });
  }
}
