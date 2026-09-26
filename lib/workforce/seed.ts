import type { WorkforceData } from './model';

export function sampleWorkforceData(): WorkforceData {
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
  return { companies, employmentTypes, projects, sites, workTypes, performanceItems, staff: [], reports: [], monthlySnapshots: [], revenuePlans: [], updatedAt: new Date().toISOString() };
}

const sampleStaffIds = new Set(Array.from({ length: 8 }, (_, index) => `staff-${index + 1}`));
const sampleRevenueIds = new Set(['revenue-1', 'revenue-2']);

export function removeSampleWorkforceData(data: WorkforceData): WorkforceData {
  const staff = data.staff.filter(item => !sampleStaffIds.has(item.id));
  const reports = data.reports.filter(report => !sampleStaffIds.has(report.staffId) && !/^report--?\d+-\d+$/.test(report.id));
  const monthlySnapshots = data.monthlySnapshots.map(snapshot => ({ ...snapshot, entries: snapshot.entries.filter(entry => !sampleStaffIds.has(entry.staffId)) })).filter(snapshot => snapshot.entries.length > 0);
  const revenuePlans = data.revenuePlans.filter(plan => !sampleRevenueIds.has(plan.id));
  return { ...data, staff, reports, monthlySnapshots, revenuePlans };
}
