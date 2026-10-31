import type { BusinessCategory, Data, Deal, Product, ProductTerm, SalesTarget, StatusOption } from './model';

type DealStatuses = Pick<Data, 'products' | 'settings'>;
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
const iso = (date: Date) => date.toISOString().slice(0, 10);

// 基準額を手入力していればそれを使い、空なら単価－控除で計算する。
export const autoBasePrice = (term: Pick<ProductTerm, 'grossPrice' | 'deduction'>) => Math.max(0, term.grossPrice - term.deduction);
export const netPrice = (term: Pick<ProductTerm, 'grossPrice' | 'deduction' | 'basePrice'>) => term.basePrice ?? autoBasePrice(term);

export function termForDate(product: Pick<Product, 'terms'>, date: string) {
  return product.terms.filter(term => term.startDate <= date && (!term.endDate || term.endDate >= date)).toSorted((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

// 祝日は考慮しない。営業日は土日だけを除いて数える。
export function expectedPaymentDate(term: ProductTerm, achievedDate: string) {
  if (!term.payment || !achievedDate) return '';
  const [year, month] = achievedDate.split('-').map(Number), targetMonth = month - 1 + term.payment.monthOffset;
  const normalized = new Date(Date.UTC(year, targetMonth, 1)), targetYear = normalized.getUTCFullYear(), monthIndex = normalized.getUTCMonth(), end = lastDay(targetYear, monthIndex);
  const date = new Date(Date.UTC(targetYear, monthIndex, term.payment.day === 'end' ? end : Math.min(term.payment.day, end)));
  for (let left = term.payment.businessDays; left > 0;) { date.setUTCDate(date.getUTCDate() + 1); if (![0, 6].includes(date.getUTCDay())) left -= 1; }
  return iso(date);
}

// 成果確定月を1か月目として数える。
export function monthsSince(startDate: string, date: string) {
  const [startYear, startMonth] = startDate.split('-').map(Number), [year, month] = date.split('-').map(Number);
  return (year - startYear) * 12 + month - startMonth + 1;
}

export function chargebackRate(term: ProductTerm | undefined, achievedDate: string, cancelledDate: string) {
  if (!term || !achievedDate || !cancelledDate) return 0;
  const elapsed = monthsSince(achievedDate, cancelledDate);
  return term.chargeback.toSorted((a, b) => a.untilMonth - b.untilMonth).find(band => elapsed <= band.untilMonth)?.rate ?? 0;
}

export function chargebackDeadline(term: ProductTerm | undefined, achievedDate: string) {
  if (!term?.chargeback.length || !achievedDate) return '';
  const [year, month] = achievedDate.split('-').map(Number), until = Math.max(...term.chargeback.map(band => band.untilMonth));
  const normalized = new Date(Date.UTC(year, month - 2 + until, 1));
  return iso(new Date(Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth(), lastDay(normalized.getUTCFullYear(), normalized.getUTCMonth()))));
}

export function payRateFor(data: Pick<Data, 'salesRoles' | 'settings'>, userId: string, date: string) {
  const role = data.salesRoles.filter(item => item.userId === userId && item.startDate <= date && (!item.endDate || item.endDate >= date)).toSorted((a, b) => b.startDate.localeCompare(a.startDate))[0];
  return role ? data.settings.roleRates[role.role] : 0;
}

// 確定した案件の単価と報酬率は、後で条件や役職が変わっても動かさない。
export function applySalesTerms(deal: Deal, data: Pick<Data, 'products' | 'salesRoles' | 'settings'>): Deal {
  const product = data.products.find(item => item.id === deal.productId);
  if (!product || (!product.terms.length && !product.manualPrice)) return deal;
  const baseDate = deal.achievedDate || deal.applicationDate, term = baseDate ? termForDate(product, baseDate) : undefined;
  const next: Deal = { ...deal, pricingMode: 'master' };
  if (term && next.termId !== term.id && !next.paid) { next.termId = term.id; next.unitPrice = netPrice(term); }
  if (term && deal.achievedDate && !next.paid) { const paymentDate = expectedPaymentDate(term, deal.achievedDate); if (paymentDate) { next.paymentDate = paymentDate; next.paymentMonth = paymentDate.slice(0, 7); } }
  if (!next.payRate && baseDate) next.payRate = payRateFor(data, deal.assigneeUserId, baseDate);
  return next;
}

export const dealPay = (deal: Pick<Deal, 'unitPrice' | 'quantity' | 'payRate'>) => Math.round(deal.unitPrice * deal.quantity * deal.payRate / 100);

function statusesFor(deal: Deal, data: DealStatuses): StatusOption[] { return data.products.find(item => item.id === deal.productId)?.statuses ?? data.settings.statuses; }
export function countsAsSale(deal: Deal, data: DealStatuses) { const kind = statusesFor(deal, data).find(item => item.id === deal.status)?.kind; return kind !== 'lost' && kind !== 'cancelled'; }

export function monthlyResults(data: Pick<Data, 'deals' | 'products' | 'settings' | 'salesTargets'>, month: string) {
  const deals = data.deals.filter(deal => countsAsSale(deal, data));
  return data.products.filter(product => (product.active && (product.terms.length || product.manualPrice)) || data.salesTargets.some(target => target.month === month && target.productId === product.id)).map(product => {
    const productDeals = deals.filter(deal => deal.productId === product.id), acquired = productDeals.filter(deal => deal.applicationDate.startsWith(month)), confirmed = productDeals.filter(deal => deal.achievedDate.startsWith(month));
    const target = data.salesTargets.find(item => item.month === month && item.productId === product.id);
    const amount = (rows: Deal[]) => rows.reduce((sum, deal) => sum + deal.unitPrice * deal.quantity, 0), count = (rows: Deal[]) => rows.reduce((sum, deal) => sum + deal.quantity, 0);
    return { product, target, acquired: count(acquired), confirmed: count(confirmed), acquiredRevenue: amount(acquired), confirmedRevenue: amount(confirmed), progress: product.manualPrice ? amount(acquired) : count(acquired) };
  });
}

export function monthlyPay(data: Pick<Data, 'deals' | 'products' | 'settings'>, month: string) {
  const totals = new Map<string, { userId: string; count: number; revenue: number; pay: number }>();
  data.deals.filter(deal => countsAsSale(deal, data) && deal.achievedDate.startsWith(month)).forEach(deal => {
    const row = totals.get(deal.assigneeUserId) || { userId: deal.assigneeUserId, count: 0, revenue: 0, pay: 0 };
    row.count += deal.quantity; row.revenue += deal.unitPrice * deal.quantity; row.pay += dealPay(deal); totals.set(deal.assigneeUserId, row);
  });
  return Array.from(totals.values());
}

export type ChargebackRow = { deal: Deal; product: Product; deadline: string; state: 'cancelled' | 'watch'; rate: number; amount: number; pay: number };

export function chargebackRows(data: Pick<Data, 'deals' | 'products'>, day: string) {
  return data.deals.filter(deal => deal.achievedDate).flatMap((deal): ChargebackRow[] => {
    const product = data.products.find(item => item.id === deal.productId); if (!product) return [];
    const term = termForDate(product, deal.achievedDate), deadline = chargebackDeadline(term, deal.achievedDate), revenue = deal.unitPrice * deal.quantity;
    if (deal.cancelledDate) { const rate = chargebackRate(term, deal.achievedDate, deal.cancelledDate); return rate ? [{ deal, product, deadline, state: 'cancelled', rate, amount: Math.round(revenue * rate), pay: Math.round(dealPay(deal) * rate) }] : []; }
    return deadline && deadline >= day ? [{ deal, product, deadline, state: 'watch', rate: 0, amount: revenue, pay: dealPay(deal) }] : [];
  }).toSorted((a, b) => a.deadline.localeCompare(b.deadline));
}

export type SalesMasterImport = { products: { id: string; category: BusinessCategory; name: string; manualPrice: boolean; terms: ProductTerm[] }[]; targets: SalesTarget[] };

// 同じ事業・同じ名前の商材があれば上書きし、既存の案件と進捗フローを残す。
export function mergeSalesMaster(current: Data, input: SalesMasterImport, statusesForCategory: (category: BusinessCategory) => StatusOption[], day: string): Data {
  const products: Product[] = [...current.products], resolved = new Map<string, string>();
  input.products.forEach(item => {
    const index = products.findIndex(product => product.id === item.id || (product.category === item.category && product.name === item.name));
    const latest = termForDate(item, day) || item.terms[item.terms.length - 1], change = { manualPrice: item.manualPrice, terms: item.terms, unitPrice: latest ? netPrice(latest) : 0 };
    if (index >= 0) { products[index] = { ...products[index], ...change, version: products[index].version + 1 }; resolved.set(item.id, products[index].id); }
    else { products.push({ id: item.id, version: 1, category: item.category, name: item.name, costUnitPrice: 0, active: true, statuses: statusesForCategory(item.category), ...change }); resolved.set(item.id, item.id); }
  });
  const targets = input.targets.map(target => ({ ...target, productId: resolved.get(target.productId) || target.productId })), replaced = new Set(targets.map(target => `${target.month}:${target.productId}`));
  return { ...current, products, salesTargets: [...current.salesTargets.filter(target => !replaced.has(`${target.month}:${target.productId}`)), ...targets] };
}

const currentUnitPrice = (terms: ProductTerm[], day: string) => { const latest = termForDate({ terms }, day) || terms[terms.length - 1]; return latest ? netPrice(latest) : 0; };

// 確定前の案件だけ新しい基準額に合わせる。手で変えた単価と確定済みの案件は動かさない。
export function saveProductTerm(current: Data, productId: string, change: { name: string; manualPrice: boolean }, term: ProductTerm | null, day: string): Data {
  const product = current.products.find(item => item.id === productId); if (!product) return current;
  const previous = term && product.terms.find(item => item.id === term.id);
  const terms = term ? (previous ? product.terms.map(item => item.id === term.id ? term : item) : [...product.terms, term]) : product.terms;
  const deals = previous && term && netPrice(previous) !== netPrice(term) ? current.deals.map(deal => deal.productId === productId && deal.termId === term.id && !deal.achievedDate && !deal.paid && deal.unitPrice === netPrice(previous) ? { ...deal, unitPrice: netPrice(term), version: deal.version + 1 } : deal) : current.deals;
  return { ...current, deals, products: current.products.map(item => item.id === productId ? { ...item, ...change, terms, unitPrice: currentUnitPrice(terms, day), version: item.version + 1 } : item) };
}

const dayBefore = (date: string) => iso(new Date(Date.parse(`${date}T00:00:00Z`) - 86400000));

// 改定は元の条件を前日で閉じて新しい版を足す。過去の案件は元の条件のまま計算される。
export function reviseProductTerm(current: Data, productId: string, termId: string, newId: string, startDate: string, day: string): Data {
  const product = current.products.find(item => item.id === productId), source = product?.terms.find(item => item.id === termId); if (!product || !source || startDate <= source.startDate) return current;
  const terms = [...product.terms.map(item => item.id === termId ? { ...item, endDate: dayBefore(startDate) } : item), { ...source, id: newId, startDate, endDate: source.endDate && source.endDate >= startDate ? source.endDate : '' }];
  return { ...current, products: current.products.map(item => item.id === productId ? { ...item, terms, unitPrice: currentUnitPrice(terms, day), version: item.version + 1 } : item) };
}

export function deleteProductTerm(current: Data, productId: string, termId: string, day: string): Data {
  return { ...current, products: current.products.map(item => { if (item.id !== productId) return item; const terms = item.terms.filter(term => term.id !== termId); return { ...item, terms, unitPrice: currentUnitPrice(terms, day), version: item.version + 1 }; }) };
}

export const productInUse = (data: Pick<Data, 'deals'>, productId: string) => data.deals.some(deal => deal.productId === productId);

// 案件がある商材は履歴を守るため削除せず、停止だけできる。
export function deleteProduct(current: Data, productId: string): Data {
  if (productInUse(current, productId)) return current;
  return { ...current, products: current.products.filter(item => item.id !== productId), salesTargets: current.salesTargets.filter(target => target.productId !== productId) };
}
