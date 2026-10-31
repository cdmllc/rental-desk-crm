import { env } from 'cloudflare:workers';
import { AuthError, listUsers, requireCrmSession } from '@/lib/crm/auth';
import { DEFAULT_ADMIN_USER_ID, DEMO_AGENT_USER_ID, dataSchema, ownsCustomer, ownsDeal, ownsTask, type CrmSession, type Data, type Deal } from '@/lib/crm/model';
import { sampleData } from '@/lib/crm/seed';
import { applySalesTerms, productsForStaff } from '@/lib/crm/sales';

export const dynamic = 'force-dynamic';
const workspace = 'primary';

async function readMasterData(): Promise<Data> {
  const database = env.DB;
  if (!database) throw new Error('Database binding unavailable');
  await database.prepare(`CREATE TABLE IF NOT EXISTS crm_state (
    workspace_id TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  const row = await database.prepare('SELECT data FROM crm_state WHERE workspace_id = ?').bind(workspace).first<{ data: string }>();
  const data = row ? dataSchema.parse(JSON.parse(row.data)) : sampleData();
  const users = await listUsers();
  const validIds = new Set(users.map(user => user.id));
  const adminId = users.find(user => user.role === 'admin' && user.active)?.id || DEFAULT_ADMIN_USER_ID;
  const demoId = users.find(user => user.id === DEMO_AGENT_USER_ID && user.active)?.id;
  const customers = data.customers.map(customer => {
    const fallback = customer.owner.includes('佐々木') && demoId ? demoId : adminId;
    const assigneeUserId = validIds.has(customer.assigneeUserId) ? customer.assigneeUserId : fallback;
    const user = users.find(item => item.id === assigneeUserId);
    return { ...customer, assigneeUserId, ownerUserId: assigneeUserId, owner: user?.displayName || customer.owner, ownerEmail: user?.email || customer.ownerEmail };
  });
  const customerAssignees = new Map(customers.map(customer => [customer.id, customer.assigneeUserId]));
  const deals = data.deals.map(deal => ({ ...deal, assigneeUserId: validIds.has(deal.assigneeUserId) ? deal.assigneeUserId : customerAssignees.get(deal.customerId) || adminId }));
  const dealAssignees = new Map(deals.map(deal => [deal.id, deal.assigneeUserId]));
  const tasks = data.tasks.map(task => {
    const assigneeUserId = validIds.has(task.assigneeUserId) ? task.assigneeUserId : dealAssignees.get(task.dealId) || adminId;
    return { ...task, assigneeUserId, owner: users.find(user => user.id === assigneeUserId)?.displayName || task.owner };
  });
  return { ...data, customers, deals, tasks };
}

function filteredData(data: Data, session: CrmSession): Data {
  if (session.isAdmin && session.crmAccess === 'admin') return data;
  const staffView = { ...data, products: productsForStaff(data.products), salesRoles: data.salesRoles.filter(role => role.userId === session.userId) };
  if (session.crmAccess === 'admin') return staffView;
  const customers = data.customers.filter(customer => ownsCustomer(customer, session));
  const customerIds = new Set(customers.map(customer => customer.id));
  const deals = data.deals.filter(deal => ownsDeal(deal, session) && customerIds.has(deal.customerId));
  const dealIds = new Set(deals.map(deal => deal.id));
  return { ...staffView, customers, deals, tasks: data.tasks.filter(task => ownsTask(task, session) && (!task.dealId || dealIds.has(task.dealId))) };
}

// 担当者は条件書で決まる単価と報酬率、成果確定日と解約日を変更できない。都度入力の商材だけ単価を受け付ける。
function protectAgentDeal(deal: Deal, master: Data): Deal {
  const previous = master.deals.find(item => item.id === deal.id), product = master.products.find(item => item.id === deal.productId);
  if (!product || (!product.terms.length && !product.manualPrice)) return deal;
  const locked = previous?.productId === deal.productId && !product.manualPrice ? { unitPrice: previous.unitPrice, termId: previous.termId } : product.manualPrice ? {} : { termId: '' };
  return applySalesTerms({ ...deal, ...locked, achievedDate: previous?.achievedDate || '', cancelledDate: previous?.cancelledDate || '', payRate: previous?.productId === deal.productId ? previous.payRate : 0 }, master);
}

function mergeAgentData(master: Data, incoming: Data, session: CrmSession): Data {
  if (incoming.customers.some(customer => !ownsCustomer(customer, session))) throw new AuthError('担当外の顧客は更新できません', 403);
  const incomingCustomerIds = new Set(incoming.customers.map(customer => customer.id));
  if (incoming.deals.some(deal => !ownsDeal(deal, session) || !incomingCustomerIds.has(deal.customerId))) throw new AuthError('担当外の案件は更新できません', 403);
  const incomingDealIds = new Set(incoming.deals.map(deal => deal.id));
  if (incoming.tasks.some(task => !ownsTask(task, session) || task.dealId && !incomingDealIds.has(task.dealId))) throw new AuthError('担当外のタスクは更新できません', 403);

  return {
    customers: [...master.customers.filter(customer => !ownsCustomer(customer, session)), ...incoming.customers],
    deals: [...master.deals.filter(deal => !ownsDeal(deal, session)), ...incoming.deals.map(deal => protectAgentDeal(deal, master))],
    tasks: [...master.tasks.filter(task => !ownsTask(task, session)), ...incoming.tasks],
    products: master.products,
    settings: master.settings,
    salesRoles: master.salesRoles,
    salesTargets: master.salesTargets,
  };
}

export async function GET() {
  try {
    const session = await requireCrmSession();
    if (session.crmAccess === 'none') throw new AuthError('CRMの利用権限がありません', 403, 'CRM_ACCESS_DENIED');
    return Response.json({ data: filteredData(await readMasterData(), session), session });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 503;
    return Response.json({ error: error instanceof Error ? error.message : 'データを読み込めませんでした', code: error instanceof AuthError ? error.code : undefined }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireCrmSession();
    if (session.crmAccess === 'none') throw new AuthError('CRMの利用権限がありません', 403, 'CRM_ACCESS_DENIED');
    const parsed = dataSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: '入力内容を確認してください' }, { status: 400 });
    const master = await readMasterData();
    const next = session.isAdmin && session.crmAccess === 'admin' ? parsed.data : session.crmAccess === 'admin' ? { ...parsed.data, deals: parsed.data.deals.map(deal => protectAgentDeal(deal, master)), products: master.products, settings: master.settings, salesRoles: master.salesRoles, salesTargets: master.salesTargets } : mergeAgentData(master, parsed.data, session);
    const database = env.DB;
    if (!database) throw new Error('Database binding unavailable');
    await database.prepare(`INSERT INTO crm_state (workspace_id, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .bind(workspace, JSON.stringify(next), Date.now()).run();
    return Response.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 503;
    return Response.json({ error: error instanceof Error ? error.message : '保存できませんでした。もう一度お試しください' }, { status });
  }
}
