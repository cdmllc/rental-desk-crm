import { z } from 'zod';

export const businessCategories = ['real-estate', 'recruitment', 'lifeline'] as const;
export const businessCategoryLabels: Record<(typeof businessCategories)[number], string> = {
  'real-estate': '不動産',
  recruitment: '人材',
  lifeline: 'ライフライン',
};

export const statusKinds = ['active', 'complete', 'hold', 'lost', 'cancelled'] as const;
export const defaultStatuses = [
  { id: '新規', label: '新規', kind: 'active' }, { id: 'ヒアリング済', label: 'ヒアリング済', kind: 'active' },
  { id: '物件提案中', label: '物件提案中', kind: 'active' }, { id: '内見調整中', label: '内見調整中', kind: 'active' },
  { id: '内見予定', label: '内見予定', kind: 'active' }, { id: '内見済', label: '内見済', kind: 'active' },
  { id: '申込準備', label: '申込準備', kind: 'active' }, { id: '申込済', label: '申込済', kind: 'active' },
  { id: '審査中', label: '審査中', kind: 'active' }, { id: '審査通過', label: '審査通過', kind: 'active' },
  { id: '契約手続中', label: '契約手続中', kind: 'active' }, { id: '契約完了', label: '契約完了', kind: 'active' },
  { id: '入居待ち', label: '入居待ち', kind: 'active' }, { id: '完了', label: '完了', kind: 'complete' },
  { id: '保留', label: '保留', kind: 'hold' }, { id: '失注', label: '失注', kind: 'lost' },
  { id: 'キャンセル', label: 'キャンセル', kind: 'cancelled' },
] as const;

export const defaultProducts = [
  { id: 'product-rental', category: 'real-estate', name: '賃貸仲介', unitPrice: 0, active: true, version: 1 },
  { id: 'product-career', category: 'recruitment', name: '人材紹介', unitPrice: 300000, active: true, version: 1 },
  { id: 'product-hiring', category: 'recruitment', name: '採用支援', unitPrice: 100000, active: true, version: 1 },
  { id: 'product-electricity', category: 'lifeline', name: '電気', unitPrice: 12000, active: true, version: 1 },
  { id: 'product-gas', category: 'lifeline', name: 'ガス', unitPrice: 10000, active: true, version: 1 },
  { id: 'product-internet', category: 'lifeline', name: 'インターネット', unitPrice: 25000, active: true, version: 1 },
  { id: 'product-water', category: 'lifeline', name: 'ウォーターサーバー', unitPrice: 15000, active: true, version: 1 },
] as const;

const text = z.string().max(5000);
const date = z.string().refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, '日付を確認してください');
const month = z.string().refine(value => !value || /^\d{4}-(0[1-9]|1[0-2])$/.test(value), '入金予定月を確認してください');
const money = z.number().int().min(0).max(1000000000);
const base = { id: z.string().min(1).max(100), version: z.number().int().min(0).default(0) };

export const customerSchema = z.object({
  ...base, name: text.min(1, '氏名を入力してください'), phone: text,
  email: z.union([z.literal(''), z.string().email('メールアドレスを確認してください')]),
  line: text, owner: text, ownerEmail: text.default(''), ownerUserId: text.default(''), note: text,
});

export const dealSchema = z.object({
  ...base, customerId: text.min(1), status: text.min(1),
  category: z.enum(businessCategories).default('real-estate'), productId: text.default('product-rental'),
  pricingMode: z.enum(['master', 'realEstate']).default('realEstate'), unitPrice: money.default(0), quantity: z.number().int().min(1).max(10000).default(1),
  property: text, room: text, rent: money, commonFee: money, management: text,
  viewingDate: date, applicationDate: date, contractDate: date, moveInDate: date,
  action: text, dueDate: date, brokerage: money, adMode: z.enum(['rate', 'amount']),
  adBase: money, adRate: z.number().min(0).max(10000), adAmount: money, other: money,
  partnerRate: z.number().min(0).max(100), paymentMonth: month, paymentDate: date,
  paidDate: date, paid: z.boolean(), documents: z.array(z.object({ id: text.min(1), name: text.min(1), done: z.boolean() })).max(100),
  note: text, history: z.array(z.object({ at: text, text })).default([]),
}).superRefine((deal, context) => {
  if (deal.paid && !deal.paidDate) context.addIssue({ code: 'custom', message: '入金済の場合は実入金日を入力してください', path: ['paidDate'] });
  if (deal.paymentDate && deal.paymentMonth !== deal.paymentDate.slice(0, 7)) context.addIssue({ code: 'custom', message: '入金予定日と入金予定月を合わせてください', path: ['paymentMonth'] });
});

export const taskSchema = z.object({ ...base, dealId: text, title: text.min(1, 'タスク名を入力してください'), dueDate: date, owner: text, done: z.boolean() });
export const statusOptionSchema = z.object({ id: z.string().min(1).max(100), label: z.string().trim().min(1).max(40), kind: z.enum(statusKinds) });
export const productSchema = z.object({ ...base, category: z.enum(businessCategories), name: z.string().trim().min(1).max(80), unitPrice: money, active: z.boolean() });
export const settingsSchema = z.object({ ...base, partnerRate: z.number().min(0).max(100), statuses: z.array(statusOptionSchema).min(1).max(100).default(defaultStatuses.map(item => ({ ...item }))) });
export const dataSchema = z.object({
  customers: z.array(customerSchema).max(5000), deals: z.array(dealSchema).max(10000), tasks: z.array(taskSchema).max(20000),
  products: z.array(productSchema).max(500).default(defaultProducts.map(item => ({ ...item }))), settings: settingsSchema,
});

export type BusinessCategory = (typeof businessCategories)[number];
export type Customer = z.infer<typeof customerSchema>;
export type Deal = z.infer<typeof dealSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type StatusOption = z.infer<typeof statusOptionSchema>;
export type Product = z.infer<typeof productSchema>;
export type Data = z.infer<typeof dataSchema>;
export type CrmSession = { userId: string; email: string; displayName: string; isAdmin: boolean };
export type CrmPayload = { data: Data; session: CrmSession };

export function totals(deal: Pick<Deal, 'brokerage' | 'adMode' | 'adBase' | 'adRate' | 'adAmount' | 'other' | 'partnerRate'>) {
  const ad = deal.adMode === 'rate' ? Math.round(deal.adBase * deal.adRate / 100) : deal.adAmount;
  const gross = deal.brokerage + ad + deal.other;
  const partner = Math.round(gross * deal.partnerRate / 100);
  return { ad, gross, partner, net: gross - partner };
}

export const expectedIncome = (deal: Deal) => deal.pricingMode === 'master' ? deal.unitPrice * deal.quantity : totals(deal).net;
export const yen = (value: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value);
export const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
export function shiftMonth(value: string, offset: number) { const [year, monthValue] = value.split('-').map(Number); return new Date(Date.UTC(year, monthValue - 1 + offset, 1)).toISOString().slice(0, 7); }
export const monthLabel = (value: string) => value ? `${Number(value.slice(0, 4))}年${Number(value.slice(5))}月` : '未設定';
export const shortDate = (value: string) => value ? `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}` : '未設定';
export const statusKind = (deal: Pick<Deal, 'status'>, statuses: StatusOption[]) => statuses.find(item => item.id === deal.status)?.kind ?? 'active';
export const active = (deal: Deal, statuses: StatusOption[]) => statusKind(deal, statuses) === 'active';
export const validRevenue = (deal: Deal, statuses: StatusOption[]) => !['lost', 'cancelled'].includes(statusKind(deal, statuses));
export const missing = (deal: Deal) => deal.documents.filter(item => !item.done).length;
export const urgent = (deal: Deal, day: string, statuses: StatusOption[]) => active(deal, statuses) && ((Boolean(deal.dueDate) && deal.dueDate <= day) || missing(deal) > 0);
export const ownsCustomer = (customer: Customer, session: CrmSession) => customer.ownerUserId === session.userId || Boolean(customer.ownerEmail) && customer.ownerEmail.toLowerCase() === session.email.toLowerCase();

export function emptyData(): Data {
  return { customers: [], deals: [], tasks: [], products: defaultProducts.map(item => ({ ...item })), settings: { id: 'default', version: 1, partnerRate: 20, statuses: defaultStatuses.map(item => ({ ...item })) } };
}

export function emptyDeal(customerId: string, rate: number, status: string): Deal {
  return {
    id: crypto.randomUUID(), version: 0, customerId, status, category: 'real-estate', productId: 'product-rental', pricingMode: 'realEstate', unitPrice: 0, quantity: 1,
    property: '', room: '', rent: 0, commonFee: 0, management: '', viewingDate: '', applicationDate: '', contractDate: '', moveInDate: '',
    action: '', dueDate: '', brokerage: 0, adMode: 'rate', adBase: 0, adRate: 100, adAmount: 0, other: 0, partnerRate: rate,
    paymentMonth: '', paymentDate: '', paidDate: '', paid: false, documents: [], note: '', history: [],
  };
}
