import { today } from '@/lib/crm/model';
import type { DailyReport, WorkforceData, WorkforceStaff } from './model';

export function sampleWorkforceData(): WorkforceData {
  const day = today(), month = day.slice(0, 7);
  const relative = (offset: number) => new Date(Date.parse(`${day}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  const companies = [
    { id: 'company-cdm', code: 'CDM', name: 'CDM合同会社', active: true },
    { id: 'company-east', code: 'EAST', name: 'イーストパートナーズ', active: true },
    { id: 'company-link', code: 'LINK', name: 'リンクスタッフ', active: true },
  ];
  const employmentTypes = [
    { id: 'employment-direct', code: 'DIRECT', name: '直接雇用', active: true },
    { id: 'employment-partner', code: 'PARTNER', name: '業務委託', active: true },
  ];
  const projects = [
    { id: 'project-fiber', code: 'FIBER', name: '光回線販売', clientName: '通信キャリアA', active: true },
    { id: 'project-mobile', code: 'MOBILE', name: '携帯販売応援', clientName: '通信キャリアB', active: true },
    { id: 'project-event', code: 'EVENT', name: '催事販売', clientName: '販売代理店C', active: true },
  ];
  const sites = [
    { id: 'site-shinjuku', code: 'SHINJUKU', name: '新宿西口店', active: true },
    { id: 'site-yokohama', code: 'YOKOHAMA', name: '横浜みなとみらい店', active: true },
    { id: 'site-omiya', code: 'OMIYA', name: '大宮駅前店', active: true },
    { id: 'site-kashiwa', code: 'KASHIWA', name: '柏モール催事場', active: true },
  ];
  const workTypes = [
    { id: 'work-normal', code: 'NORMAL', name: '通常稼働', active: true },
    { id: 'work-training', code: 'TRAINING', name: '研修', active: true },
    { id: 'work-support', code: 'SUPPORT', name: '応援稼働', active: true },
  ];
  const performanceItems = [
    { id: 'perf-fiber-lead', code: 'LEAD', name: '着座数', projectId: 'project-fiber', unit: '件', active: true },
    { id: 'perf-fiber-order', code: 'ORDER', name: '成約数', projectId: 'project-fiber', unit: '件', active: true },
    { id: 'perf-mobile-order', code: 'ORDER', name: '契約数', projectId: 'project-mobile', unit: '件', active: true },
    { id: 'perf-event-contact', code: 'CONTACT', name: '声掛け数', projectId: 'project-event', unit: '件', active: true },
  ];
  const staffSource = [
    ['staff-1', '山田 大輔', 'd.yamada@example.com', 'company-cdm', 'employment-direct', 14000],
    ['staff-2', '佐藤 健一', 'k.sato@example.com', 'company-cdm', 'employment-direct', 13500],
    ['staff-3', '鈴木 翔太', 's.suzuki@example.com', 'company-east', 'employment-partner', 13000],
    ['staff-4', '高橋 美咲', 'm.takahashi@example.com', 'company-east', 'employment-partner', 12500],
    ['staff-5', '田中 真一', 's.tanaka@example.com', 'company-link', 'employment-partner', 12000],
    ['staff-6', '伊藤 彩', 'a.ito@example.com', 'company-link', 'employment-partner', 12000],
    ['staff-7', '渡辺 直樹', 'n.watanabe@example.com', 'company-cdm', 'employment-direct', 13500],
    ['staff-8', '中村 遥', 'h.nakamura@example.com', 'company-link', 'employment-partner', 12500],
  ] as const;
  const staff: WorkforceStaff[] = staffSource.map(([id, name, email, companyId, employmentTypeId, dailyRate], index) => ({
    id, userId: '', name, email, companyId, employmentTypeId, status: index === 7 ? 'inactive' : 'active',
    payRates: [{ id: `${id}-rate-1`, startDate: `${month}-01`, endDate: '', dailyRate }],
  }));
  const reports: DailyReport[] = [];
  for (let offset = -18; offset <= 0; offset += 1) {
    if (new Date(`${relative(offset)}T12:00:00`).getDay() === 0) continue;
    staff.slice(0, 7).forEach((person, index) => {
      if ((Math.abs(offset) + index) % 5 === 0) return;
      const status: DailyReport['status'] = offset === 0 ? index < 3 ? 'approved' : index < 5 ? 'submitted' : 'draft' : offset === -1 && index === 2 ? 'returned' : 'approved';
      const projectId = projects[(index + Math.abs(offset)) % projects.length].id;
      const item = performanceItems.find(candidate => candidate.projectId === projectId);
      reports.push({
        id: `report-${offset}-${index}`, date: relative(offset), staffId: person.id, projectId,
        siteId: sites[(index + Math.abs(offset)) % sites.length].id, workTypeId: index === 6 ? 'work-support' : 'work-normal',
        performance: item ? { [item.id]: Math.max(1, 8 - index) } : {}, reflection: index % 2 ? 'お客様への声掛け数を増やし、次回提案につなげます。' : '成約導線を整理し、チーム内で成功事例を共有しました。',
        status, returnComment: status === 'returned' ? '成績数値と振り返りを追記してください。' : '',
        submittedAt: status === 'draft' ? '' : `${relative(offset)}T19:00:00+09:00`, reviewedAt: status === 'approved' ? `${relative(offset)}T20:00:00+09:00` : '', reviewedBy: status === 'approved' ? 'CDM 管理者' : '',
      });
    });
  }
  return { companies, employmentTypes, projects, sites, workTypes, performanceItems, staff, reports, monthlySnapshots: [], revenuePlans: [
    { id: 'revenue-1', month, projectId: 'project-fiber', revenue: 3200000, cost: 1880000, note: '運用開始時の計画値' },
    { id: 'revenue-2', month, projectId: 'project-mobile', revenue: 2100000, cost: 1260000, note: '運用開始時の計画値' },
  ], updatedAt: new Date().toISOString() };
}

