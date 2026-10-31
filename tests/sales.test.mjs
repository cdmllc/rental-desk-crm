import assert from 'node:assert/strict';
import test from 'node:test';
import { applySalesTerms, chargebackDeadline, chargebackRate, dealPay, expectedPaymentDate, deleteProduct, deleteProductTerm, mergeSalesMaster, monthlyResults, netPrice, payRateFor, productsForStaff, reviseProductTerm, saveProductTerm, termForDate } from '../lib/crm/sales.ts';

const term = (over = {}) => ({ id: 't', startDate: '2026-09-01', endDate: '', grossPrice: 25000, deduction: 5000, basePrice: null, payment: { monthOffset: 1, day: 'end', businessDays: 5 }, chargeback: [{ untilMonth: 6, rate: 1 }], achievement: '', chargebackNote: '', source: '', note: '', ...over });
const settings = { roleRates: { rookie: 30, player: 45, manager: 50, lead: 60 }, statuses: [] };
const statuses = [{ id: 'a', label: 'a', kind: 'active' }, { id: 'x', label: 'x', kind: 'cancelled' }];
const product = (over = {}) => ({ id: 'p', category: 'lifeline', name: '電気', statuses, terms: [term()], manualPrice: false, unitPrice: 20000, costUnitPrice: 0, active: true, version: 1, ...over });
const deal = (over = {}) => ({ id: 'd', productId: 'p', assigneeUserId: 'u', status: 'a', pricingMode: 'realEstate', unitPrice: 0, quantity: 1, payRate: 0, termId: '', achievedDate: '', cancelledDate: '', applicationDate: '2026-11-03', paid: false, paymentDate: '', paymentMonth: '', ...over });
const roles = [{ id: 'r', userId: 'u', role: 'manager', startDate: '2026-01-01', endDate: '' }];

test('翌月末から5営業日後を土日を除いて計算する', () => assert.equal(expectedPaymentDate(term(), '2026-11-10'), '2027-01-07'));
test('翌々月15日を計算する', () => assert.equal(expectedPaymentDate(term({ payment: { monthOffset: 2, day: 15, businessDays: 0 } }), '2026-12-01'), '2027-02-15'));
test('入金条件がなければ空にする', () => assert.equal(expectedPaymentDate(term({ payment: null }), '2026-11-10'), ''));
test('つばさの段階戻入', () => {
  const t = term({ chargeback: [{ untilMonth: 8, rate: .5 }, { untilMonth: 4, rate: 1 }, { untilMonth: 12, rate: .25 }] });
  assert.equal(chargebackRate(t, '2026-11-15', '2027-02-28'), 1);
  assert.equal(chargebackRate(t, '2026-11-15', '2027-03-01'), .5);
  assert.equal(chargebackRate(t, '2026-11-15', '2027-10-31'), .25);
  assert.equal(chargebackRate(t, '2026-11-15', '2027-11-01'), 0);
  assert.equal(chargebackDeadline(t, '2026-11-15'), '2027-10-31');
});
test('適用期間で条件を選ぶ', () => {
  const p = product({ terms: [term({ id: 'old', endDate: '2026-09-30', grossPrice: 70000 }), term({ id: 'new', startDate: '2026-10-01', grossPrice: 60000, deduction: 1000 })] });
  assert.equal(termForDate(p, '2026-09-30').id, 'old'); assert.equal(termForDate(p, '2026-10-01').id, 'new');
});
test('マネージャーは2万円で1万円', () => {
  const data = { products: [product()], salesRoles: roles, settings };
  const next = applySalesTerms(deal(), data);
  assert.equal(next.unitPrice, 20000); assert.equal(next.payRate, 50); assert.equal(dealPay(next), 10000); assert.equal(next.pricingMode, 'master');
});
test('端数は四捨五入', () => assert.equal(dealPay({ unitPrice: 33333, quantity: 1, payRate: 45 }), 15000));
test('確定後は条件や役職が変わっても動かない', () => {
  const first = applySalesTerms(deal({ achievedDate: '2026-11-10' }), { products: [product()], salesRoles: roles, settings });
  const later = applySalesTerms(first, { products: [product({ terms: [term({ grossPrice: 99999 })] })], salesRoles: [{ ...roles[0], role: 'lead' }], settings });
  assert.equal(later.unitPrice, 20000); assert.equal(later.payRate, 50); assert.equal(later.paymentDate, '2027-01-07'); assert.equal(later.paymentMonth, '2027-01');
});
test('使用量で単価を変えた案件を上書きしない', () => {
  const data = { products: [product()], salesRoles: roles, settings };
  const first = applySalesTerms(deal(), data);
  assert.equal(applySalesTerms({ ...first, unitPrice: 88888 }, data).unitPrice, 88888);
});
test('都度入力の商材は入力した単価を使う', () => {
  const next = applySalesTerms(deal({ unitPrice: 12000 }), { products: [product({ manualPrice: true, terms: [] })], salesRoles: roles, settings });
  assert.equal(next.unitPrice, 12000); assert.equal(dealPay(next), 6000);
});
test('条件のない既存商材は変更しない', () => {
  const original = deal({ pricingMode: 'realEstate' });
  assert.equal(applySalesTerms(original, { products: [product({ terms: [] })], salesRoles: roles, settings }), original);
});
test('役職がなければ報酬率は0', () => assert.equal(payRateFor({ salesRoles: [], settings }, 'u', '2026-11-01'), 0));
test('月次実績はキャンセルを除いて獲得と確定を分ける', () => {
  const [row] = monthlyResults({ products: [product()], settings, salesTargets: [], deals: [deal({ unitPrice: 20000 }), deal({ id: 'e', status: 'x', unitPrice: 20000 }), deal({ id: 'f', applicationDate: '2026-10-20', achievedDate: '2026-11-02', unitPrice: 20000 })] }, '2026-11');
  assert.equal(row.acquired, 1); assert.equal(row.confirmed, 1); assert.equal(row.acquiredRevenue, 20000);
});
test('取り込みは同名の既存商材を上書きし目標の商材IDを読み替える', () => {
  const current = { products: [product({ id: 'old-id', name: 'ニフティ電気', terms: [], statuses })], salesTargets: [{ id: 'x', month: '2026-11', productId: 'old-id', minimum: 9, standard: 9, stretch: 9 }] };
  const next = mergeSalesMaster(current, { products: [{ id: 'sale-nifty', category: 'lifeline', name: 'ニフティ電気', manualPrice: false, terms: [term({ grossPrice: 18000, deduction: 0 })] }, { id: 'sale-cc', category: 'lifeline', name: 'CC', manualPrice: true, terms: [] }], targets: [{ id: 'y', month: '2026-11', productId: 'sale-nifty', minimum: 3, standard: 5, stretch: 6 }] }, () => statuses, '2026-11-01');
  assert.equal(next.products.length, 2); assert.equal(next.products[0].id, 'old-id'); assert.equal(next.products[0].unitPrice, 18000); assert.equal(next.products[1].manualPrice, true);
  assert.deepEqual(next.salesTargets.map(t => [t.productId, t.standard]), [['old-id', 5]]);
});
test('基準額は単価と別に手入力でき、空なら単価－控除', () => {
  assert.equal(netPrice(term()), 20000);
  assert.equal(netPrice(term({ basePrice: 22000 })), 22000);
  assert.equal(netPrice(term({ basePrice: 0 })), 0);
});
test('基準額の変更は確定前の案件だけに反映する', () => {
  const data = { products: [product()], salesRoles: roles, settings, salesTargets: [], deals: [deal({ termId: 't', unitPrice: 20000 }), deal({ id: 'done', termId: 't', unitPrice: 20000, achievedDate: '2026-11-02' }), deal({ id: 'hand', termId: 't', unitPrice: 88888 }), deal({ id: 'paid', termId: 't', unitPrice: 20000, paid: true })] };
  const next = saveProductTerm(data, 'p', { name: '電気', manualPrice: false }, term({ basePrice: 15000 }), '2026-11-01');
  assert.deepEqual(next.deals.map(item => item.unitPrice), [15000, 20000, 88888, 20000]);
  assert.equal(next.products[0].unitPrice, 15000);
});
test('改定は元の条件を前日で閉じる', () => {
  const data = { products: [product()], deals: [] };
  const next = reviseProductTerm(data, 'p', 't', 'n', '2026-12-01', '2026-12-05');
  assert.deepEqual(next.products[0].terms.map(item => [item.id, item.startDate, item.endDate]), [['t', '2026-09-01', '2026-11-30'], ['n', '2026-12-01', '']]);
  assert.equal(reviseProductTerm(data, 'p', 't', 'n', '2026-09-01', '2026-12-05'), data);
});
test('案件のある商材は削除できず、ない商材は目標ごと消える', () => {
  const data = { products: [product(), product({ id: 'q' })], deals: [deal()], salesTargets: [{ id: 'a', productId: 'p' }, { id: 'b', productId: 'q' }] };
  assert.equal(deleteProduct(data, 'p'), data);
  const next = deleteProduct(data, 'q');
  assert.deepEqual(next.products.map(item => item.id), ['p']); assert.deepEqual(next.salesTargets.map(item => item.id), ['a']);
});
test('条件の削除で商材の単価を現在の条件に合わせる', () => {
  const data = { products: [product({ terms: [term({ id: 'a', grossPrice: 30000, deduction: 0 }), term({ id: 'b', startDate: '2026-10-01', grossPrice: 10000, deduction: 0 })] })], deals: [] };
  assert.equal(deleteProductTerm(data, 'p', 'b', '2026-11-01').products[0].unitPrice, 30000);
});
test('担当者には条件の詳細を渡さず基準額だけ渡す', () => {
  const [staff] = productsForStaff([product({ costUnitPrice: 500, terms: [term({ note: '秘密', source: '原本', achievement: '条件', chargebackNote: '戻入' })] })]);
  const [t] = staff.terms;
  assert.equal(t.grossPrice, 20000); assert.equal(t.deduction, 0); assert.equal(t.payment, null); assert.deepEqual(t.chargeback, []);
  assert.deepEqual([t.note, t.source, t.achievement, t.chargebackNote], ['', '', '', '']); assert.equal(staff.costUnitPrice, 0);
  assert.equal(applySalesTerms(deal(), { products: [staff], salesRoles: roles, settings }).unitPrice, 20000);
});
