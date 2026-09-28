'use client';

import { useEffect, useState } from 'react';
import { BarChart3, Check, Download, Lock, Pencil, Plus, ReceiptText, RotateCcw, Save, Trash2, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { monthLabel, shiftMonth, shortDate, today, yen, type CrmSession } from '@/lib/crm/model';
import {
  calculateMonthlyEntries, payRateForDate, reportStatusLabels, snapshotForMonth,
  type DailyReport, type MonthlySnapshot, type PerformanceItem, type RevenuePlan, type SnapshotEntry,
  type WorkforceData, type WorkforceMaster, type WorkforceProject, type WorkforceStaff,
} from '@/lib/workforce/model';
import './workforce.css';

type WorkforceView = 'dashboard' | 'reports' | 'staff' | 'masters' | 'monthly' | 'revenue';
const tabs: { id: WorkforceView; label: string }[] = [
  { id: 'dashboard', label: '稼働ダッシュボード' }, { id: 'reports', label: '日報承認' }, { id: 'staff', label: 'スタッフ管理' },
  { id: 'masters', label: 'マスタ管理' }, { id: 'monthly', label: '月次報酬' }, { id: 'revenue', label: '売上・粗利' },
];

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="wf-field"><span>{label}</span>{children}</label>;
const nameOf = (items: { id: string; name: string }[], id: string) => items.find(item => item.id === id)?.name || '未設定';
const currentMonth = () => today().slice(0, 7);
const statusTone = (status: DailyReport['status']) => status === 'approved' ? 'approved' : status === 'submitted' ? 'submitted' : status === 'returned' ? 'returned' : 'draft';

function Dashboard({ data, go }: { data: WorkforceData; go: (view: WorkforceView) => void }) {
  const day = today(), month = day.slice(0, 7), todayReports = data.reports.filter(report => report.date === day);
  const activeStaff = data.staff.filter(staff => staff.status === 'active');
  const approvedMonth = data.reports.filter(report => report.status === 'approved' && report.date.startsWith(month));
  const payout = calculateMonthlyEntries(data, month).reduce((sum, entry) => sum + entry.amount, 0);
  const pending = data.reports.filter(report => report.status === 'submitted').toSorted((a, b) => b.date.localeCompare(a.date));
  const chartDays = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.parse(`${day}T12:00:00Z`) - (13 - index) * 86400000).toISOString().slice(0, 10);
    return { date, approved: data.reports.filter(report => report.date === date && report.status === 'approved').length, waiting: data.reports.filter(report => report.date === date && report.status === 'submitted').length };
  });
  const max = Math.max(1, ...chartDays.map(row => row.approved + row.waiting));
  const payouts = calculateMonthlyEntries(data, month).toSorted((a, b) => b.amount - a.amount).slice(0, 5);
  const metrics = [
    ['本日の稼働人数', `${todayReports.length}人`, `在籍 ${activeStaff.length}人`],
    ['提出済み', `${todayReports.filter(report => report.status !== 'draft').length}件`, '本日の日報'],
    ['未提出', `${Math.max(0, activeStaff.length - todayReports.filter(report => report.status !== 'draft').length)}件`, '本日の対象者'],
    ['承認待ち', `${pending.length}件`, '全期間'],
    ['今月の総稼働日数', `${approvedMonth.length}日`, monthLabel(month)],
    ['支給予定総額', yen(payout), '承認済みのみ'],
  ];
  return <div className="wf-dashboard">
    <div className="wf-metrics">{metrics.map(([label, value, note], index) => <section key={label} className={`wf-metric wf-metric-${index}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></section>)}</div>
    <div className="wf-dashboard-grid"><section className="wf-panel wf-approval-queue"><div className="wf-panel-heading"><div><h2>日報承認待ち</h2><p>提出順に確認できます</p></div><button onClick={() => go('reports')}>すべて見る</button></div>
      <Table><TableHeader><TableRow><TableHead>提出日</TableHead><TableHead>スタッフ</TableHead><TableHead>所属会社</TableHead><TableHead>案件 / 現場</TableHead><TableHead>状態</TableHead></TableRow></TableHeader><TableBody>{pending.slice(0, 6).map(report => { const staff = data.staff.find(item => item.id === report.staffId); return <TableRow key={report.id} onClick={() => go('reports')} className="clickable"><TableCell>{shortDate(report.date)}</TableCell><TableCell><strong>{staff?.name}</strong></TableCell><TableCell>{nameOf(data.companies, staff?.companyId || '')}</TableCell><TableCell>{nameOf(data.projects, report.projectId)}<small>{nameOf(data.sites, report.siteId)}</small></TableCell><TableCell><span className="wf-status submitted">承認待ち</span></TableCell></TableRow>; })}</TableBody></Table>{!pending.length && <div className="wf-empty">承認待ちの日報はありません</div>}</section>
      <section className="wf-panel"><div className="wf-panel-heading"><div><h2>直近14日の稼働</h2><p>承認済みと承認待ち</p></div></div><div className="wf-bars">{chartDays.map(row => <div className="wf-bar-col" key={row.date}><div className="wf-bar-stack" title={`${row.date} 承認済${row.approved}件 / 待ち${row.waiting}件`}><i style={{ height: `${row.approved / max * 140}px` }}/><b style={{ height: `${row.waiting / max * 140}px` }}/></div><span>{Number(row.date.slice(8))}</span></div>)}</div><div className="wf-legend"><span><i/>承認済み</span><span><i/>承認待ち</span></div></section></div>
    <section className="wf-panel"><div className="wf-panel-heading"><div><h2>スタッフ別 支給予定</h2><p>{monthLabel(month)}・承認済み日報だけを集計</p></div><button onClick={() => go('monthly')}>月次報酬を見る</button></div><Table><TableHeader><TableRow><TableHead>スタッフ</TableHead><TableHead>所属会社</TableHead><TableHead>稼働日数</TableHead><TableHead>現在日給</TableHead><TableHead className="money">支給予定額</TableHead></TableRow></TableHeader><TableBody>{payouts.map(entry => { const staff = data.staff.find(item => item.id === entry.staffId); return <TableRow key={entry.staffId}><TableCell><strong>{staff?.name}</strong></TableCell><TableCell>{nameOf(data.companies, entry.companyId)}</TableCell><TableCell>{entry.days}日</TableCell><TableCell>{yen(payRateForDate(staff!, day)?.dailyRate || 0)}</TableCell><TableCell className="money strong-money">{yen(entry.amount)}</TableCell></TableRow>; })}</TableBody></Table></section>
  </div>;
}

function Reports({ data, save, session }: { data: WorkforceData; save: (next: WorkforceData, message: string) => Promise<void>; session: CrmSession }) {
  const [filter, setFilter] = useState<'all' | DailyReport['status']>('submitted'), [selected, setSelected] = useState<DailyReport | null>(null), [comment, setComment] = useState('');
  const rows = data.reports.filter(report => filter === 'all' || report.status === filter).toSorted((a, b) => b.date.localeCompare(a.date));
  const review = async (report: DailyReport, decision: 'approved' | 'returned') => {
    if (decision === 'returned' && !comment.trim()) return toast.error('差戻しコメントを入力してください');
    const nextReport = { ...report, status: decision, returnComment: decision === 'returned' ? comment.trim() : '', reviewedAt: new Date().toISOString(), reviewedBy: session.displayName };
    await save({ ...data, reports: data.reports.map(item => item.id === report.id ? nextReport : item) }, decision === 'approved' ? '日報を承認しました' : '日報を差し戻しました');
    setSelected(null); setComment('');
  };
  return <section className="wf-panel"><div className="wf-toolbar"><div className="wf-filter-tabs">{(['submitted', 'returned', 'approved', 'draft', 'all'] as const).map(value => <button className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{value === 'all' ? 'すべて' : reportStatusLabels[value]} <em>{data.reports.filter(report => value === 'all' || report.status === value).length}</em></button>)}</div></div>
    <Table><TableHeader><TableRow><TableHead>日付</TableHead><TableHead>スタッフ / 所属</TableHead><TableHead>案件 / 現場</TableHead><TableHead>稼働区分</TableHead><TableHead>成績</TableHead><TableHead className="money">交通費</TableHead><TableHead>状態</TableHead></TableRow></TableHeader><TableBody>{rows.map(report => { const staff = data.staff.find(item => item.id === report.staffId), performance = Object.entries(report.performance).map(([itemId, value]) => `${nameOf(data.performanceItems, itemId)} ${value}`).join(' / '); return <TableRow key={report.id} className="clickable" onClick={() => { setSelected(report); setComment(report.returnComment); }}><TableCell>{report.date}</TableCell><TableCell><strong>{staff?.name}</strong><small>{nameOf(data.companies, staff?.companyId || '')}</small></TableCell><TableCell><strong>{nameOf(data.projects, report.projectId)}</strong><small>{nameOf(data.sites, report.siteId)}</small></TableCell><TableCell>{nameOf(data.workTypes, report.workTypeId)}</TableCell><TableCell>{performance || '—'}</TableCell><TableCell className="money">{report.transportationCost ? yen(report.transportationCost) : '—'}</TableCell><TableCell><span className={`wf-status ${statusTone(report.status)}`}>{reportStatusLabels[report.status]}</span></TableCell></TableRow>; })}</TableBody></Table>{!rows.length && <div className="wf-empty">該当する日報はありません</div>}
    <Dialog open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)}><DialogContent className="wf-report-dialog">{selected && <><DialogHeader><DialogTitle>日報の確認</DialogTitle><DialogDescription>{selected.date} · {nameOf(data.staff, selected.staffId)}</DialogDescription></DialogHeader><div className="wf-report-summary"><div><span>所属会社</span><strong>{nameOf(data.companies, data.staff.find(item => item.id === selected.staffId)?.companyId || '')}</strong></div><div><span>案件</span><strong>{nameOf(data.projects, selected.projectId)}</strong></div><div><span>現場</span><strong>{nameOf(data.sites, selected.siteId)}</strong></div><div><span>稼働区分</span><strong>{nameOf(data.workTypes, selected.workTypeId)}</strong></div></div><section className="wf-detail-block"><h3>成績</h3>{Object.entries(selected.performance).map(([itemId, value]) => <div key={itemId}><span>{nameOf(data.performanceItems, itemId)}</span><strong>{value} {data.performanceItems.find(item => item.id === itemId)?.unit}</strong></div>)}</section><section className="wf-detail-block"><h3>振り返り</h3><p>{selected.reflection || '記載なし'}</p></section><section className="wf-detail-block wf-transport-detail"><h3><ReceiptText/>交通費申請</h3><div><span>申請額</span><strong>{yen(selected.transportationCost)}</strong></div><div><span>領収書</span>{selected.transportationReceipt ? <a href={selected.transportationReceipt} target="_blank" rel="noreferrer">{selected.transportationReceiptName || '領収書を表示'}</a> : <strong>添付なし</strong>}</div></section>{selected.returnComment && <section className="wf-return-note"><strong>前回の差戻しコメント</strong><p>{selected.returnComment}</p></section>}<Field label="差戻しコメント"><Textarea value={comment} onChange={event => setComment(event.target.value)} rows={3} placeholder="修正してほしい内容を具体的に入力"/></Field><DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>閉じる</Button><Button variant="outline" disabled={selected.status === 'approved'} onClick={() => void review(selected, 'returned')}><RotateCcw/>差戻し</Button><Button disabled={selected.status === 'approved'} onClick={() => void review(selected, 'approved')}><Check/>承認</Button></DialogFooter></>}</DialogContent></Dialog>
  </section>;
}

function Staff({ data, save }: { data: WorkforceData; save: (next: WorkforceData, message: string) => Promise<void> }) {
  const [selected, setSelected] = useState<WorkforceStaff | null>(null);
  const add = () => setSelected({ id: crypto.randomUUID(), userId: '', name: '', email: '', companyId: data.companies[0]?.id || '', employmentTypeId: data.employmentTypes[0]?.id || '', status: 'active', payRates: [{ id: crypto.randomUUID(), startDate: `${currentMonth()}-01`, endDate: '', dailyRate: 0 }] });
  const commit = async () => {
    if (!selected?.name.trim() || !selected.companyId || !selected.employmentTypeId) return toast.error('必須項目を入力してください');
    const exists = data.staff.some(item => item.id === selected.id), staff = exists ? data.staff.map(item => item.id === selected.id ? selected : item) : [selected, ...data.staff];
    await save({ ...data, staff }, exists ? 'スタッフ情報を更新しました' : 'スタッフを追加しました'); setSelected(null);
  };
  const remove = async (staff: WorkforceStaff) => {
    const reports = data.reports.filter(report => report.staffId === staff.id);
    if (!window.confirm(`${staff.name}を削除します。紐づく日報 ${reports.length}件も削除されます。よろしいですか？`)) return;
    const monthlySnapshots = data.monthlySnapshots.map(snapshot => ({ ...snapshot, entries: snapshot.entries.filter(entry => entry.staffId !== staff.id) })).filter(snapshot => snapshot.entries.length > 0);
    await save({ ...data, staff: data.staff.filter(item => item.id !== staff.id), reports: data.reports.filter(report => report.staffId !== staff.id), monthlySnapshots }, 'スタッフを削除しました');
  };
  return <section className="wf-panel"><div className="wf-toolbar"><div className="wf-summary"><strong>在籍 {data.staff.filter(item => item.status === 'active').length}名</strong><span>停止 {data.staff.filter(item => item.status === 'inactive').length}名</span></div><Button onClick={add}><Plus/>スタッフを追加</Button></div><Table><TableHeader><TableRow><TableHead>氏名</TableHead><TableHead>メール</TableHead><TableHead>所属会社</TableHead><TableHead>雇用区分</TableHead><TableHead>在籍状態</TableHead><TableHead>現在日給</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{data.staff.map(staff => <TableRow key={staff.id}><TableCell><strong>{staff.name}</strong></TableCell><TableCell>{staff.email || '—'}</TableCell><TableCell>{nameOf(data.companies, staff.companyId)}</TableCell><TableCell>{nameOf(data.employmentTypes, staff.employmentTypeId)}</TableCell><TableCell><span className={`wf-staff-state ${staff.status}`}>{staff.status === 'active' ? '在籍' : '停止'}</span></TableCell><TableCell className="money">{yen(payRateForDate(staff, today())?.dailyRate || 0)}</TableCell><TableCell><div className="wf-row-actions"><Button variant="outline" size="sm" onClick={() => setSelected(structuredClone(staff))}><Pencil/>編集</Button><Button variant="outline" size="sm" onClick={() => void remove(staff)}><Trash2/>削除</Button></div></TableCell></TableRow>)}</TableBody></Table>
    <Dialog open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)}><DialogContent className="wf-staff-dialog">{selected && <><DialogHeader><DialogTitle>{data.staff.some(item => item.id === selected.id) ? 'スタッフ情報を編集' : 'スタッフを追加'}</DialogTitle><DialogDescription>ログインアカウントと同じメールを設定してください。日給は日報の日付で自動判定します。</DialogDescription></DialogHeader><div className="wf-form-grid"><Field label="氏名"><Input value={selected.name} onChange={event => setSelected({ ...selected, name: event.target.value })}/></Field><Field label="メール"><Input type="email" value={selected.email} onChange={event => setSelected({ ...selected, email: event.target.value })}/></Field><Field label="所属会社"><NativeSelect value={selected.companyId} onChange={event => setSelected({ ...selected, companyId: event.target.value })}>{data.companies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></Field><Field label="雇用区分"><NativeSelect value={selected.employmentTypeId} onChange={event => setSelected({ ...selected, employmentTypeId: event.target.value })}>{data.employmentTypes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></Field><Field label="在籍状態"><NativeSelect value={selected.status} onChange={event => setSelected({ ...selected, status: event.target.value as WorkforceStaff['status'] })}><option value="active">在籍</option><option value="inactive">停止</option></NativeSelect></Field></div><div className="wf-rate-heading"><div><strong>日給の適用期間</strong><small>管理者限定</small></div><Button size="sm" variant="outline" onClick={() => setSelected({ ...selected, payRates: [...selected.payRates, { id: crypto.randomUUID(), startDate: `${currentMonth()}-01`, endDate: '', dailyRate: 0 }] })}><Plus/>期間を追加</Button></div><div className="wf-rate-list">{selected.payRates.map(rate => <div key={rate.id}><Input type="date" aria-label="適用開始日" value={rate.startDate} onChange={event => setSelected({ ...selected, payRates: selected.payRates.map(item => item.id === rate.id ? { ...item, startDate: event.target.value } : item) })}/><Input type="date" aria-label="適用終了日" value={rate.endDate} onChange={event => setSelected({ ...selected, payRates: selected.payRates.map(item => item.id === rate.id ? { ...item, endDate: event.target.value } : item) })}/><Input type="number" aria-label="基本日給" value={rate.dailyRate} onChange={event => setSelected({ ...selected, payRates: selected.payRates.map(item => item.id === rate.id ? { ...item, dailyRate: Number(event.target.value) || 0 } : item) })}/><button title="削除" disabled={selected.payRates.length === 1} onClick={() => setSelected({ ...selected, payRates: selected.payRates.filter(item => item.id !== rate.id) })}><X size={15}/></button></div>)}</div><DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>閉じる</Button><Button onClick={() => void commit()}><Save/>保存</Button></DialogFooter></>}</DialogContent></Dialog>
  </section>;
}

type MasterKind = 'companies' | 'employmentTypes' | 'projects' | 'sites' | 'workTypes' | 'performanceItems';
const masterLabels: Record<MasterKind, string> = { companies: '所属会社', employmentTypes: '雇用区分', projects: '案件種類', sites: '現場', workTypes: '稼働区分', performanceItems: '成績項目' };

function Masters({ data, save, initialKind }: { data: WorkforceData; save: (next: WorkforceData, message: string) => Promise<void>; initialKind: MasterKind }) {
  const [kind, setKind] = useState<MasterKind>(initialKind), [draft, setDraft] = useState<WorkforceData>(() => structuredClone(data));
  const rows = draft[kind] as (WorkforceMaster | WorkforceProject | PerformanceItem)[];
  const setRows = (next: typeof rows) => setDraft({ ...draft, [kind]: next });
  const patch = (rowId: string, change: Record<string, unknown>) => setRows(rows.map(row => row.id === rowId ? { ...row, ...change } : row));
  const add = () => {
    const base = { id: crypto.randomUUID(), code: `NEW${rows.length + 1}`, name: '新しい項目', active: true };
    const row = kind === 'projects' ? { ...base, clientName: '' } : kind === 'performanceItems' ? { ...base, projectId: draft.projects[0]?.id || '', unit: '件' } : base;
    setRows([...rows, row]);
  };
  const removeProject = (project: WorkforceProject) => {
    const reports = draft.reports.filter(report => report.projectId === project.id).length;
    const revenuePlans = draft.revenuePlans.filter(plan => plan.projectId === project.id).length;
    if (reports || revenuePlans) {
      toast.error(`${project.name}は日報${reports}件・売上${revenuePlans}件で使用中です。「使用中」をOFFにしてください。`);
      return;
    }
    if (!window.confirm(`${project.name}を案件種類から削除します。よろしいですか？`)) return;
    setDraft(current => ({
      ...current,
      projects: current.projects.filter(item => item.id !== project.id),
      performanceItems: current.performanceItems.filter(item => item.projectId !== project.id),
    }));
  };
  const tableClass = kind === 'projects' ? 'is-projects' : kind === 'performanceItems' ? 'is-performance-items' : '';
  return <div className="wf-master-layout"><aside className="wf-master-nav">{(Object.keys(masterLabels) as MasterKind[]).map(item => <button className={kind === item ? 'active' : ''} key={item} onClick={() => setKind(item)}>{masterLabels[item]}<span>{draft[item].length}</span></button>)}</aside><section className="wf-panel"><div className="wf-toolbar"><div className="wf-summary"><strong>{masterLabels[kind]}</strong><span>{kind === 'projects' ? '必要な種類を追加し、使わない種類は停止または削除できます' : 'コード変更なしで追加・更新できます'}</span></div><Button onClick={add}><Plus/>追加</Button></div><div className={`wf-master-table ${tableClass}`}><div className="wf-master-head"><span>コード</span><span>名称</span>{kind === 'projects' && <span>取引先</span>}{kind === 'performanceItems' && <><span>対象案件</span><span>単位</span></>}<span>使用中</span>{kind === 'projects' && <span>操作</span>}</div>{rows.map(row => <div className="wf-master-row" key={row.id}><Input value={row.code} onChange={event => patch(row.id, { code: event.target.value })}/><Input value={row.name} onChange={event => patch(row.id, { name: event.target.value })}/>{kind === 'projects' && <Input value={(row as WorkforceProject).clientName} onChange={event => patch(row.id, { clientName: event.target.value })}/>} {kind === 'performanceItems' && <><NativeSelect value={(row as PerformanceItem).projectId} onChange={event => patch(row.id, { projectId: event.target.value })}>{draft.projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</NativeSelect><Input value={(row as PerformanceItem).unit} onChange={event => patch(row.id, { unit: event.target.value })}/></>}<Checkbox checked={row.active} onCheckedChange={value => patch(row.id, { active: value === true })}/>{kind === 'projects' && <Button size="sm" variant="outline" aria-label={`${row.name}を削除`} onClick={() => removeProject(row as WorkforceProject)}><Trash2/>削除</Button>}</div>)}</div><div className="wf-savebar"><span>{kind === 'projects' ? '使用中の種類は履歴保護のため削除できません。停止すると新しい日報の選択肢から外れます。' : '名称変更は既存の日報にも反映されます。IDは内部で固定されます。'}</span><Button onClick={() => void save(draft, `${masterLabels[kind]}を保存しました`)}><Save/>変更を保存</Button></div></section></div>;
}

function Monthly({ data, save, finalizedBy }: { data: WorkforceData; save: (next: WorkforceData, message: string) => Promise<void>; finalizedBy: string }) {
  const [month, setMonth] = useState(currentMonth()), existing = snapshotForMonth(data, month);
  const [draftEntries, setDraftEntries] = useState<SnapshotEntry[]>(() => existing?.entries || calculateMonthlyEntries(data, month));
  const selectMonth = (nextMonth: string) => { const snapshot = snapshotForMonth(data, nextMonth); setMonth(nextMonth); setDraftEntries(snapshot?.entries || calculateMonthlyEntries(data, nextMonth)); };
  const totalDays = draftEntries.reduce((sum, entry) => sum + entry.days, 0), total = draftEntries.reduce((sum, entry) => sum + entry.amount, 0), finalized = existing?.status === 'finalized';
  const finalize = async () => {
    const snapshot: MonthlySnapshot = { id: existing?.id || crypto.randomUUID(), month, status: 'finalized', finalizedAt: new Date().toISOString(), finalizedBy, entries: draftEntries, version: (existing?.version || 0) + 1 };
    await save({ ...data, monthlySnapshots: [...data.monthlySnapshots.filter(item => item.month !== month), snapshot] }, '月次報酬を確定しました');
  };
  const unlock = async () => {
    if (!existing) return;
    await save({ ...data, monthlySnapshots: data.monthlySnapshots.map(item => item.month === month ? { ...item, status: 'draft', version: item.version + 1 } : item) }, '明示的な修正モードへ切り替えました');
  };
  const updateAdjustment = (staffId: string, adjustment: number) => setDraftEntries(entries => entries.map(entry => entry.staffId === staffId ? { ...entry, adjustment, amount: entry.baseAmount + entry.transportationAmount + adjustment } : entry));
  const exportCsv = () => {
    const rows = [['対象月','スタッフ','所属会社','承認済み稼働日数','基本額','交通費','調整額','支給額','単価内訳'], ...draftEntries.map(entry => { const staff = data.staff.find(item => item.id === entry.staffId); return [month, staff?.name || '', nameOf(data.companies, entry.companyId), String(entry.days), String(entry.baseAmount), String(entry.transportationAmount), String(entry.adjustment), String(entry.amount), entry.rateBreakdown.map(rate => `${rate.dailyRate}円×${rate.days}日`).join(' / ')]; })];
    const csv = `\uFEFF${rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `月次報酬_${month}.csv`; anchor.click(); URL.revokeObjectURL(url); toast.success('CSVを出力しました');
  };
  return <div className="wf-monthly"><div className="wf-monthly-toolbar"><div><Field label="対象月"><Input type="month" value={month} onChange={event => selectMonth(event.target.value)}/></Field></div><div className={`wf-lock-state ${finalized ? 'locked' : ''}`}>{finalized ? <><Lock/>確定済み · v{existing?.version}</> : '編集中'}</div><Button variant="outline" onClick={exportCsv}><Download/>CSV出力</Button>{finalized ? <Button onClick={() => void unlock()}><RotateCcw/>修正を開始</Button> : <Button onClick={() => void finalize()}><Lock/>月次確定</Button>}</div><div className="wf-monthly-summary"><div><span>承認済み稼働日数</span><strong>{totalDays}日</strong></div><div><span>対象スタッフ</span><strong>{draftEntries.length}名</strong></div><div><span>支給予定総額</span><strong>{yen(total)}</strong></div></div><section className="wf-panel"><Table><TableHeader><TableRow><TableHead>スタッフ / 所属</TableHead><TableHead>日数</TableHead><TableHead>単価内訳</TableHead><TableHead className="money">基本額</TableHead><TableHead className="money">交通費</TableHead><TableHead className="money">明示的な調整</TableHead><TableHead className="money">支給額</TableHead></TableRow></TableHeader><TableBody>{draftEntries.map(entry => { const staff = data.staff.find(item => item.id === entry.staffId); return <TableRow key={entry.staffId}><TableCell><strong>{staff?.name}</strong><small>{nameOf(data.companies, entry.companyId)}</small></TableCell><TableCell>{entry.days}日</TableCell><TableCell>{entry.rateBreakdown.map(rate => <small key={rate.dailyRate}>{yen(rate.dailyRate)} × {rate.days}日</small>)}</TableCell><TableCell className="money">{yen(entry.baseAmount)}</TableCell><TableCell className="money">{yen(entry.transportationAmount)}</TableCell><TableCell className="money"><Input disabled={finalized} type="number" value={entry.adjustment} onChange={event => updateAdjustment(entry.staffId, Number(event.target.value) || 0)}/></TableCell><TableCell className="money strong-money">{yen(entry.amount)}</TableCell></TableRow>; })}</TableBody></Table>{!draftEntries.length && <div className="wf-empty">この月の承認済み日報はありません</div>}</section><p className="wf-note">月次確定後は、日報や日給マスタを変更しても確定スナップショットは変わりません。「修正を開始」を押した場合だけ再編集できます。</p></div>;
}

function Revenue({ data, save, manageProjectTypes }: { data: WorkforceData; save: (next: WorkforceData, message: string) => Promise<void>; manageProjectTypes: () => void }) {
  const [month, setMonth] = useState(currentMonth()), [plans, setPlans] = useState<RevenuePlan[]>(() => structuredClone(data.revenuePlans));
  const rows = plans.filter(plan => plan.month === month), revenue = rows.reduce((sum, row) => sum + row.revenue, 0), cost = rows.reduce((sum, row) => sum + row.cost, 0);
  const selectableProjects = data.projects.filter(project => project.active || rows.some(plan => plan.projectId === project.id));
  const patch = (id: string, change: Partial<RevenuePlan>) => setPlans(current => current.map(plan => plan.id === id ? { ...plan, ...change } : plan));
  const firstActiveProject = data.projects.find(project => project.active)?.id || '';
  return <div className="wf-revenue"><div className="wf-revenue-head"><Field label="売上計上月"><Input type="month" value={month} onChange={event => setMonth(event.target.value)}/></Field><div><span>売上</span><strong>{yen(revenue)}</strong></div><div><span>原価</span><strong>{yen(cost)}</strong></div><div><span>粗利</span><strong>{yen(revenue - cost)}</strong><small>{revenue ? `${Math.round((revenue - cost) / revenue * 100)}%` : '—'}</small></div></div><div className="wf-revenue-payment">入金予定：{monthLabel(shiftMonth(month, 1))}末（月末締め・翌月末入金）</div><section className="wf-panel"><div className="wf-toolbar"><div className="wf-summary"><strong>案件別 売上・粗利</strong><span>この月の実績は翌月のメインダッシュボードへ合算されます</span></div><div className="wf-toolbar-actions"><Button variant="outline" onClick={manageProjectTypes}><Pencil/>案件種類を管理</Button><Button disabled={!firstActiveProject} onClick={() => setPlans([...plans, { id: crypto.randomUUID(), month, projectId: firstActiveProject, revenue: 0, cost: 0, note: '' }])}><Plus/>案件を追加</Button></div></div><div className="wf-revenue-table"><div className="wf-revenue-row head"><span>案件種類</span><span>売上</span><span>原価</span><span>粗利</span><span>メモ</span></div>{rows.map(plan => <div className="wf-revenue-row" key={plan.id}><NativeSelect value={plan.projectId} onChange={event => patch(plan.id, { projectId: event.target.value })}>{selectableProjects.map(project => <option value={project.id} key={project.id}>{project.name}{project.active ? '' : '（停止中）'}</option>)}</NativeSelect><Input type="number" value={plan.revenue} onChange={event => patch(plan.id, { revenue: Number(event.target.value) || 0 })}/><Input type="number" value={plan.cost} onChange={event => patch(plan.id, { cost: Number(event.target.value) || 0 })}/><strong>{yen(plan.revenue - plan.cost)}</strong><Input value={plan.note} onChange={event => patch(plan.id, { note: event.target.value })}/></div>)}</div><div className="wf-savebar"><span>{firstActiveProject ? '売上月を基準に翌月末の入金予定へ自動集計します。' : '先に案件種類を1件以上追加してください。'}</span><Button onClick={() => void save({ ...data, revenuePlans: plans }, '売上・粗利を保存しました')}><Save/>保存</Button></div></section></div>;
}

export function WorkforceModule({ session, onDataChange }: { session: CrmSession; onDataChange?: (data: WorkforceData) => void }) {
  const [data, setData] = useState<WorkforceData | null>(null), [view, setView] = useState<WorkforceView>('dashboard'), [masterKind, setMasterKind] = useState<MasterKind>('companies'), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  useEffect(() => { let active = true; void (async () => { try { const response = await fetch('/api/workforce', { cache: 'no-store' }), body = await response.json() as { data?: WorkforceData; error?: string }; if (!response.ok || !body.data) throw new Error(body.error || 'load failed'); if (active) { setData(body.data); onDataChange?.(body.data); } } catch (error) { toast.error(error instanceof Error ? error.message : '稼働データを読み込めませんでした'); } finally { if (active) setLoading(false); } })(); return () => { active = false; }; }, [onDataChange]);
  const save = async (next: WorkforceData, message: string) => { setSaving(true); try { const response = await fetch('/api/workforce', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) }), body = await response.json() as { data?: WorkforceData; error?: string }; if (!response.ok || !body.data) throw new Error(body.error || '保存できませんでした'); setData(body.data); onDataChange?.(body.data); toast.success(message); } catch (error) { toast.error(error instanceof Error ? error.message : '保存できませんでした'); } finally { setSaving(false); } };
  const pending = data?.reports.filter(report => report.status === 'submitted').length || 0;
  if (loading) return <div className="wf-loading"><BarChart3/><strong>稼働・報酬データを読み込んでいます</strong></div>;
  if (!data) return <div className="wf-empty">稼働・報酬データを読み込めませんでした</div>;
  const content = view === 'dashboard' ? <Dashboard data={data} go={setView}/> : view === 'reports' ? <Reports data={data} save={save} session={session}/> : view === 'staff' ? <Staff data={data} save={save}/> : view === 'masters' ? <Masters key={`${data.updatedAt}-${masterKind}`} data={data} save={save} initialKind={masterKind}/> : view === 'monthly' ? <Monthly key={data.updatedAt} data={data} save={save} finalizedBy={session.displayName}/> : <Revenue key={data.updatedAt} data={data} save={save} manageProjectTypes={() => { setMasterKind('projects'); setView('masters'); }}/>;
  return <div className="wf-module"><div className="wf-module-heading"><div><h1>稼働・報酬</h1><p>通信現場スタッフの日報、稼働状況、月次報酬を管理します。</p></div><div className="wf-module-state"><Users size={15}/>管理者専用{saving && <span>保存中…</span>}</div></div><nav className="wf-tabs">{tabs.map(tab => <button className={view === tab.id ? 'active' : ''} key={tab.id} onClick={() => setView(tab.id)}>{tab.label}{tab.id === 'reports' && pending > 0 && <em>{pending}</em>}</button>)}</nav>{content}</div>;
}
