import { Data, Deal, DEFAULT_ADMIN_USER_ID, DEMO_AGENT_USER_ID, defaultProducts, defaultStatuses, shiftMonth, today } from './model';

export function sampleData(): Data {
  const day = today(), month = day.slice(0, 7), next = shiftMonth(month, 1), previous = shiftMonth(month, -1);
  const relative = (offset: number) => new Date(Date.parse(`${day}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  const names = ['田中 太郎', '佐藤 美咲', '鈴木 健太', '高橋 彩花', '伊藤 翔太', '渡辺 結衣', '山本 直樹', '中村 遥'];
  const customers = names.map((name, index) => ({
    id: `sample-c${index}`, version: 1, name, phone: `090-0000-${String(index + 1).padStart(4, '0')}`,
    email: `sample${index + 1}@example.com`, line: `sample_${index + 1}`, owner: index % 2 ? '佐々木' : '山田',
    ownerEmail: index % 2 ? 'agent.demo@cdm-lifesupport.com' : 'ceo@cdm-lifesupport.com', ownerUserId: '',
    assigneeUserId: index % 2 ? DEMO_AGENT_USER_ID : DEFAULT_ADMIN_USER_ID, note: '顧客の希望条件や連絡履歴をここで共有できます。',
  }));
  const properties = ['パークレジデンス恵比寿', 'リバーサイド目黒', 'グランメゾン中目黒', 'ルミエール三軒茶屋', 'ブランシェ代々木', 'アーバンコート渋谷', 'コンフォリア学芸大学', 'サンハイツ自由が丘'];
  const stages: Deal['status'][] = ['審査中', '内見予定', '契約手続中', '物件提案中', '申込準備', '入居待ち', '完了', '保留'];
  const actions = ['収入証明を回収', '内見前日のご連絡', '契約書の内容確認', '希望条件に合う物件を提案', '申込書・本人確認書類を回収', '鍵の受け渡しを調整', '入金の確認', '引越し時期の確認'];
  const deals: Deal[] = customers.map((customer, index) => ({
    id: `sample-d${index}`, version: 1, customerId: customer.id, assigneeUserId: customer.assigneeUserId, status: stages[index], category: 'real-estate', productId: 'product-rental', pricingMode: 'realEstate', unitPrice: 0, costUnitPrice: 0, quantity: 1,
    property: properties[index], room: ['502', '301', '802', '205', '403', '601', '302', '101'][index], rent: [100000, 125000, 138000, 95000, 110000, 152000, 88000, 98000][index], commonFee: 8000,
    management: index % 2 ? '東京リビング管理' : 'シティプロパティ', viewingDate: relative(index - 8), applicationDate: index % 2 ? '' : relative(-4),
    contractDate: index === 2 || index === 5 ? `${month}-20` : index === 6 ? `${previous}-22` : '', moveInDate: index === 5 ? `${next}-01` : '',
    action: actions[index], dueDate: relative(index === 0 ? -1 : index === 2 ? 0 : index + 1), brokerage: [110000, 137500, 151800, 104500, 121000, 167200, 96800, 107800][index],
    adMode: index === 2 ? 'amount' : 'rate', adBase: [100000, 125000, 138000, 95000, 110000, 152000, 88000, 98000][index], adRate: index === 0 ? 200 : 100,
    adAmount: 200000, other: 0, partnerRate: 20, paymentMonth: index === 2 || index === 5 ? month : index === 6 ? previous : next,
    paymentDate: index === 2 || index === 5 ? `${month}-28` : index === 6 ? `${previous}-28` : `${next}-28`, paidDate: index === 6 ? `${previous}-28` : '', paid: index === 6,
    documents: ['申込書', '本人確認書類', '収入証明'].map((name, documentIndex) => ({ id: `doc${documentIndex}`, name, done: index === 0 ? documentIndex < 2 : index === 4 ? false : true })),
    note: '日程と次回対応を案件単位で共有できます。', history: [{ at: `${day}T09:00:00+09:00`, text: '案件を作成' }],
  }));
  return {
    customers,
    deals,
    tasks: [
      { id: 'sample-t0', version: 1, dealId: deals[0].id, assigneeUserId: DEFAULT_ADMIN_USER_ID, title: '田中様へ収入証明の提出を依頼', dueDate: relative(-1), owner: '山田', done: false },
      { id: 'sample-t1', version: 1, dealId: deals[2].id, assigneeUserId: DEFAULT_ADMIN_USER_ID, title: '契約書類の最終チェック', dueDate: day, owner: '山田', done: false },
      { id: 'sample-t2', version: 1, dealId: deals[1].id, assigneeUserId: DEMO_AGENT_USER_ID, title: '内見の集合場所をご案内', dueDate: relative(1), owner: '佐々木', done: false },
      { id: 'sample-t3', version: 1, dealId: deals[5].id, assigneeUserId: DEMO_AGENT_USER_ID, title: '鍵の受け渡し日時を確定', dueDate: relative(3), owner: '佐々木', done: false },
    ],
    products: defaultProducts.map(product => ({ ...product })),
    settings: { id: 'default', version: 1, partnerRate: 20, statuses: defaultStatuses.map(status => ({ ...status })) },
  };
}
