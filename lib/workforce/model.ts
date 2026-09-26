import { z } from 'zod';

const id = z.string().min(1).max(100);
const label = z.string().trim().min(1).max(100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const money = z.number().int().min(-1000000000).max(1000000000);

export const workforceAccessLevels = ['admin', 'staff', 'none'] as const;
export const crmAccessLevels = ['admin', 'own', 'none'] as const;
export type WorkforceAccess = (typeof workforceAccessLevels)[number];
export type CrmAccess = (typeof crmAccessLevels)[number];

const masterSchema = z.object({ id, code: z.string().trim().min(1).max(30), name: label, active: z.boolean() });
const projectSchema = masterSchema.extend({ clientName: z.string().max(100).default('') });
const performanceItemSchema = masterSchema.extend({ projectId: id, unit: z.string().max(20).default('件') });
const payRateSchema = z.object({ id, startDate: date, endDate: z.union([z.literal(''), date]), dailyRate: money.min(0) });

export const workforceStaffSchema = z.object({
  id, userId: z.string().max(100).default(''), name: label,
  email: z.union([z.literal(''), z.string().email()]), companyId: id, employmentTypeId: id,
  status: z.enum(['active', 'inactive']), payRates: z.array(payRateSchema).max(100),
});

export const dailyReportSchema = z.object({
  id, date, staffId: id, projectId: id, siteId: id, workTypeId: id,
  performance: z.record(z.string(), z.number().min(0).max(1000000)), reflection: z.string().max(5000),
  status: z.enum(['draft', 'submitted', 'approved', 'returned']), returnComment: z.string().max(2000),
  submittedAt: z.string().max(100), reviewedAt: z.string().max(100), reviewedBy: z.string().max(100),
});

const rateBreakdownSchema = z.object({ dailyRate: money.min(0), days: z.number().min(0).max(100), amount: money, dates: z.array(date) });
const snapshotEntrySchema = z.object({
  staffId: id, companyId: id, days: z.number().min(0).max(100), baseAmount: money,
  adjustment: money.default(0), amount: money, note: z.string().max(1000).default(''), rateBreakdown: z.array(rateBreakdownSchema),
});
export const monthlySnapshotSchema = z.object({
  id, month, status: z.enum(['draft', 'finalized']), finalizedAt: z.string().max(100), finalizedBy: z.string().max(100),
  entries: z.array(snapshotEntrySchema), version: z.number().int().min(1),
});

export const revenuePlanSchema = z.object({ id, month, projectId: id, revenue: money.min(0), cost: money.min(0), note: z.string().max(1000) });

export const workforceDataSchema = z.object({
  companies: z.array(masterSchema).max(500), employmentTypes: z.array(masterSchema).max(500),
  projects: z.array(projectSchema).max(500), sites: z.array(masterSchema).max(1000), workTypes: z.array(masterSchema).max(500),
  performanceItems: z.array(performanceItemSchema).max(2000), staff: z.array(workforceStaffSchema).max(5000),
  reports: z.array(dailyReportSchema).max(100000), monthlySnapshots: z.array(monthlySnapshotSchema).max(1200),
  revenuePlans: z.array(revenuePlanSchema).max(10000), updatedAt: z.string().max(100),
});

export type WorkforceMaster = z.infer<typeof masterSchema>;
export type WorkforceProject = z.infer<typeof projectSchema>;
export type PerformanceItem = z.infer<typeof performanceItemSchema>;
export type WorkforceStaff = z.infer<typeof workforceStaffSchema>;
export type DailyReport = z.infer<typeof dailyReportSchema>;
export type MonthlySnapshot = z.infer<typeof monthlySnapshotSchema>;
export type SnapshotEntry = z.infer<typeof snapshotEntrySchema>;
export type RevenuePlan = z.infer<typeof revenuePlanSchema>;
export type WorkforceData = z.infer<typeof workforceDataSchema>;

export const reportStatusLabels: Record<DailyReport['status'], string> = {
  draft: '下書き', submitted: '承認待ち', approved: '承認済み', returned: '差戻し',
};

export function payRateForDate(staff: WorkforceStaff, targetDate: string) {
  return staff.payRates
    .filter(rate => rate.startDate <= targetDate && (!rate.endDate || rate.endDate >= targetDate))
    .toSorted((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

export function calculateMonthlyEntries(data: WorkforceData, targetMonth: string): SnapshotEntry[] {
  return data.staff.map(staff => {
    const reports = data.reports.filter(report => report.staffId === staff.id && report.status === 'approved' && report.date.startsWith(targetMonth));
    const groups = new Map<number, string[]>();
    reports.forEach(report => {
      const rate = payRateForDate(staff, report.date)?.dailyRate || 0;
      groups.set(rate, [...(groups.get(rate) || []), report.date]);
    });
    const rateBreakdown = Array.from(groups.entries()).map(([dailyRate, dates]) => ({ dailyRate, days: dates.length, amount: dailyRate * dates.length, dates: dates.toSorted() }));
    const baseAmount = rateBreakdown.reduce((sum, row) => sum + row.amount, 0);
    return { staffId: staff.id, companyId: staff.companyId, days: reports.length, baseAmount, adjustment: 0, amount: baseAmount, note: '', rateBreakdown };
  }).filter(entry => entry.days > 0);
}

export function snapshotForMonth(data: WorkforceData, targetMonth: string) {
  return data.monthlySnapshots.find(snapshot => snapshot.month === targetMonth);
}

