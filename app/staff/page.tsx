'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Check, ChevronRight, ClipboardList, CircleUserRound, Clock3, Home, KeyRound, LogOut, Send, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { calculateMonthlyEntries, payRateForDate, reportStatusLabels, snapshotForMonth, type DailyReport, type WorkforceData } from '@/lib/workforce/model';
import { monthLabel, shortDate, today, yen, type CrmSession } from '@/lib/crm/model';
import { Toaster, toast } from 'sonner';
import './staff.css';

type PortalView = 'home' | 'reports' | 'pay' | 'account';
type Payload = { data: WorkforceData; session: CrmSession };

const nameOf = (rows: { id: string; name: string }[], id: string) => rows.find(row => row.id === id)?.name || '未設定';
const tone = (status: DailyReport['status']) => `sp-status ${status}`;

function Brand() {
  return <div className="sp-brand"><span className="sp-logo"/><div><strong>CDM STAFF</strong><small>稼働レポート</small></div></div>;
}

function Login({ onLogin }: { onLogin: (session: CrmSession) => void }) {
  const router = useRouter();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const body = await response.json() as { session?: CrmSession; error?: string };
      if (!response.ok || !body.session) throw new Error(body.error || 'ログインできませんでした');
      onLogin(body.session);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'ログインできませんでした'); }
    finally { setLoading(false); }
  };
  return <main className="sp-auth"><section><Brand/><div className="sp-auth-copy"><h1>スタッフログイン</h1><p>日報の提出と報酬予定をスマートフォンから確認できます。</p></div><form onSubmit={submit}><label><span>メールアドレス</span><Input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required/></label><label><span>パスワード</span><Input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required/></label>{error && <p className="sp-error">{error}</p>}<Button type="submit" disabled={loading || !email || !password}>{loading ? '確認中…' : 'ログイン'}</Button></form><button className="sp-auth-link" onClick={() => router.push('/')}>アカウントをお持ちでない方は利用申請</button></section></main>;
}

function ChangePassword({ done }: { done: () => void }) {
  const [currentPassword, setCurrentPassword] = useState(''), [nextPassword, setNextPassword] = useState(''), [confirm, setConfirm] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (nextPassword !== confirm) return setError('確認用パスワードが一致しません');
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword: nextPassword }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || '変更できませんでした');
      done();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '変更できませんでした'); }
    finally { setLoading(false); }
  };
  return <main className="sp-auth"><section><Brand/><div className="sp-auth-copy"><KeyRound/><h1>初期パスワードを変更</h1><p>英字と数字を含む10文字以上で設定してください。</p></div><form onSubmit={submit}><label><span>現在のパスワード</span><Input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required/></label><label><span>新しいパスワード</span><Input type="password" value={nextPassword} onChange={event => setNextPassword(event.target.value)} required/></label><label><span>確認</span><Input type="password" value={confirm} onChange={event => setConfirm(event.target.value)} required/></label>{error && <p className="sp-error">{error}</p>}<Button type="submit" disabled={loading || nextPassword.length < 10}>{loading ? '変更中…' : '変更して開始'}</Button></form></section></main>;
}

function HomeView({ data, openReport, go }: { data: WorkforceData; openReport: (report?: DailyReport) => void; go: (view: PortalView) => void }) {
  const staff = data.staff[0], day = today(), month = day.slice(0, 7), todayReport = data.reports.find(report => report.date === day);
  const monthReports = data.reports.filter(report => report.date.startsWith(month));
  const approved = monthReports.filter(report => report.status === 'approved');
  const pay = calculateMonthlyEntries(data, month)[0]?.amount || 0;
  const recent = data.reports.toSorted((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  return <><section className="sp-hero"><p>おつかれさまです</p><h1>{staff.name}さん</h1><span>{new Date(`${day}T12:00:00`).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</span></section>
    <button className={`sp-today-card ${todayReport ? 'has-report' : ''}`} onClick={() => openReport(todayReport)}><div>{todayReport ? <Check/> : <ClipboardList/>}<span><small>本日の日報</small><strong>{todayReport ? reportStatusLabels[todayReport.status] : 'まだ提出されていません'}</strong></span></div><ChevronRight/></button>
    <div className="sp-metrics"><section><CalendarDays/><span>今月の承認済み</span><strong>{approved.length}<small>日</small></strong></section><section><WalletCards/><span>支給予定</span><strong>{yen(pay)}</strong></section></div>
    <section className="sp-section"><div className="sp-section-title"><div><h2>最近の日報</h2><p>提出状況を確認できます</p></div><button onClick={() => go('reports')}>すべて見る</button></div><div className="sp-report-list">{recent.map(report => <button key={report.id} onClick={() => openReport(report)}><time>{shortDate(report.date)}</time><span><strong>{nameOf(data.projects, report.projectId)}</strong><small>{nameOf(data.sites, report.siteId)}</small></span><em className={tone(report.status)}>{reportStatusLabels[report.status]}</em><ChevronRight/></button>)}{!recent.length && <p className="sp-empty">まだ日報がありません</p>}</div></section></>;
}

function ReportsView({ data, openReport }: { data: WorkforceData; openReport: (report?: DailyReport) => void }) {
  const [filter, setFilter] = useState<'all' | DailyReport['status']>('all');
  const rows = data.reports.filter(report => filter === 'all' || report.status === filter).toSorted((a, b) => b.date.localeCompare(a.date));
  return <><div className="sp-page-head"><div><h1>日報</h1><p>下書きと差戻しは編集できます</p></div><Button onClick={() => openReport()}><ClipboardList/>新規作成</Button></div><div className="sp-filter">{(['all', 'draft', 'submitted', 'returned', 'approved'] as const).map(value => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{value === 'all' ? 'すべて' : reportStatusLabels[value]}</button>)}</div><section className="sp-section sp-list-page"><div className="sp-report-list">{rows.map(report => <button key={report.id} onClick={() => openReport(report)}><time>{shortDate(report.date)}</time><span><strong>{nameOf(data.projects, report.projectId)}</strong><small>{nameOf(data.sites, report.siteId)}</small></span><em className={tone(report.status)}>{reportStatusLabels[report.status]}</em><ChevronRight/></button>)}{!rows.length && <p className="sp-empty">該当する日報はありません</p>}</div></section></>;
}

function PayView({ data }: { data: WorkforceData }) {
  const [month, setMonth] = useState(today().slice(0, 7)), staff = data.staff[0];
  const snapshot = snapshotForMonth(data, month), finalEntry = snapshot?.entries.find(entry => entry.staffId === staff.id), draftEntry = calculateMonthlyEntries(data, month)[0];
  const entry = finalEntry || draftEntry, finalized = snapshot?.status === 'finalized';
  return <><div className="sp-page-head"><div><h1>報酬</h1><p>承認済み日報を基に集計</p></div></div><label className="sp-month"><span>対象月</span><Input type="month" value={month} onChange={event => setMonth(event.target.value)}/></label><section className="sp-pay-card"><span>{monthLabel(month)} 支給額</span><strong>{yen(entry?.amount || 0)}</strong><em>{finalized ? `確定済み v${snapshot?.version}` : '予定額'}</em><div><p><span>承認済み稼働</span><strong>{entry?.days || 0}日</strong></p><p><span>基本額</span><strong>{yen(entry?.baseAmount || 0)}</strong></p><p><span>調整額</span><strong>{yen(entry?.adjustment || 0)}</strong></p></div></section><section className="sp-section"><div className="sp-section-title"><div><h2>単価内訳</h2><p>日報の日付に適用された日給</p></div></div><div className="sp-breakdown">{entry?.rateBreakdown.map(row => <div key={`${row.dailyRate}-${row.dates[0]}`}><span>{yen(row.dailyRate)} × {row.days}日</span><strong>{yen(row.amount)}</strong></div>)}{!entry && <p className="sp-empty">この月の承認済み日報はありません</p>}</div></section></>;
}

function AccountView({ data, session, logout, openCrm }: { data: WorkforceData; session: CrmSession; logout: () => void; openCrm: () => void }) {
  const staff = data.staff[0], rate = payRateForDate(staff, today());
  return <><div className="sp-page-head"><div><h1>アカウント</h1><p>登録されているスタッフ情報</p></div></div><section className="sp-profile"><span>{staff.name.slice(0, 1)}</span><h2>{staff.name}</h2><p>{staff.email}</p></section><section className="sp-section sp-account-list"><div><span>所属会社</span><strong>{nameOf(data.companies, staff.companyId)}</strong></div><div><span>雇用区分</span><strong>{nameOf(data.employmentTypes, staff.employmentTypeId)}</strong></div><div><span>現在の日給</span><strong>{yen(rate?.dailyRate || 0)}</strong></div><div><span>ログインID</span><strong>{session.email}</strong></div></section>{session.crmAccess !== 'none' && <Button className="sp-open-crm" onClick={openCrm}><Home/>CRM画面を開く</Button>}<Button className="sp-logout" variant="outline" onClick={logout}><LogOut/>ログアウト</Button></>;
}

function ReportEditor({ data, report, close, saved }: { data: WorkforceData; report: DailyReport | null; close: () => void; saved: (data: WorkforceData) => void }) {
  const staff = data.staff[0], editable = !report || report.status === 'draft' || report.status === 'returned';
  const firstProject = data.projects.find(item => item.active)?.id || '';
  const [draft, setDraft] = useState<DailyReport>(() => report ? structuredClone(report) : { id: crypto.randomUUID(), date: today(), staffId: staff.id, projectId: firstProject, siteId: data.sites.find(item => item.active)?.id || '', workTypeId: data.workTypes.find(item => item.active)?.id || '', performance: {}, reflection: '', status: 'draft', returnComment: '', submittedAt: '', reviewedAt: '', reviewedBy: '' });
  const [saving, setSaving] = useState(false);
  const items = data.performanceItems.filter(item => item.active && item.projectId === draft.projectId);
  const patch = <K extends keyof DailyReport>(key: K, value: DailyReport[K]) => setDraft(current => ({ ...current, [key]: value }));
  const save = async (status: 'draft' | 'submitted') => {
    setSaving(true);
    try {
      const response = await fetch('/api/staff', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report: { ...draft, status } }) });
      const body = await response.json() as { data?: WorkforceData; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error || '日報を保存できませんでした');
      saved(body.data); toast.success(status === 'submitted' ? '日報を提出しました' : '下書きを保存しました'); close();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : '日報を保存できませんでした'); }
    finally { setSaving(false); }
  };
  return <div className="sp-editor"><header><button onClick={close}>閉じる</button><strong>{report ? `${shortDate(report.date)}の日報` : '日報を作成'}</strong><span/></header><main>{report?.returnComment && <section className="sp-return"><strong>差戻しコメント</strong><p>{report.returnComment}</p></section>}<div className="sp-form"><label><span>稼働日</span><Input disabled={!editable} type="date" max={today()} value={draft.date} onChange={event => patch('date', event.target.value)}/></label><label><span>案件</span><NativeSelect disabled={!editable} value={draft.projectId} onChange={event => setDraft({ ...draft, projectId: event.target.value, performance: {} })}>{data.projects.filter(item => item.active).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</NativeSelect></label><label><span>現場</span><NativeSelect disabled={!editable} value={draft.siteId} onChange={event => patch('siteId', event.target.value)}>{data.sites.filter(item => item.active).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</NativeSelect></label><label><span>稼働区分</span><NativeSelect disabled={!editable} value={draft.workTypeId} onChange={event => patch('workTypeId', event.target.value)}>{data.workTypes.filter(item => item.active).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</NativeSelect></label>{items.length > 0 && <fieldset><legend>成績</legend>{items.map(item => <label key={item.id}><span>{item.name}（{item.unit}）</span><Input disabled={!editable} type="number" min="0" value={draft.performance[item.id] || 0} onChange={event => patch('performance', { ...draft.performance, [item.id]: Number(event.target.value) || 0 })}/></label>)}</fieldset>}<label><span>振り返り・共有事項</span><Textarea disabled={!editable} rows={6} value={draft.reflection} onChange={event => patch('reflection', event.target.value)} placeholder="今日の成果、課題、引き継ぎ事項を入力"/></label></div>{editable ? <div className="sp-editor-actions"><Button variant="outline" disabled={saving} onClick={() => void save('draft')}>下書き保存</Button><Button disabled={saving || !draft.date || !draft.projectId || !draft.siteId || !draft.workTypeId} onClick={() => void save('submitted')}><Send/>提出する</Button></div> : <div className="sp-readonly"><Clock3/>提出後は管理者の確認が完了するまで編集できません。</div>}</main></div>;
}

export default function StaffPortal() {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null), [session, setSession] = useState<CrmSession | null>(null), [loading, setLoading] = useState(true), [view, setView] = useState<PortalView>('home'), [editor, setEditor] = useState<DailyReport | null | undefined>(undefined), [loadError, setLoadError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });
      if (!sessionResponse.ok) { setSession(null); setPayload(null); return; }
      const sessionBody = await sessionResponse.json() as { session: CrmSession }; setSession(sessionBody.session);
      if (sessionBody.session.mustChangePassword) return;
      const response = await fetch('/api/staff', { cache: 'no-store' }), body = await response.json() as Payload & { error?: string };
      if (!response.ok || !body.data) throw new Error(body.error || 'スタッフ情報を読み込めませんでした');
      setPayload({ data: body.data, session: body.session });
    } catch (failure) { setLoadError(failure instanceof Error ? failure.message : 'スタッフ情報を読み込めませんでした'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); setPayload(null); setSession(null); };
  const title = useMemo(() => ({ home: 'ホーム', reports: '日報', pay: '報酬', account: 'アカウント' })[view], [view]);
  if (loading) return <main className="sp-loading"><Brand/><span/><p>読み込んでいます</p></main>;
  if (!session) return <Login onLogin={next => { setSession(next); if (!next.mustChangePassword) void load(); }}/ >;
  if (session.mustChangePassword) return <ChangePassword done={() => void load()}/>;
  if (!payload) return <main className="sp-auth"><section><Brand/><div className="sp-auth-copy"><h1>スタッフ画面を開けません</h1><p>{loadError || '管理者にスタッフ権限と登録メールアドレスを確認してもらってください。'}</p></div><Button onClick={() => void load()}>再読み込み</Button><Button variant="outline" onClick={() => void logout()}>ログアウト</Button></section></main>;
  const content = view === 'home' ? <HomeView data={payload.data} openReport={setEditor} go={setView}/> : view === 'reports' ? <ReportsView data={payload.data} openReport={setEditor}/> : view === 'pay' ? <PayView data={payload.data}/> : <AccountView data={payload.data} session={session} logout={() => void logout()} openCrm={() => router.push('/')}/>;
  return <div className="sp-shell"><header className="sp-header"><Brand/><span>{title}</span></header><main className="sp-main">{content}</main><nav className="sp-bottom-nav">{([{ id: 'home', label: 'ホーム', icon: Home }, { id: 'reports', label: '日報', icon: ClipboardList }, { id: 'pay', label: '報酬', icon: WalletCards }, { id: 'account', label: 'アカウント', icon: CircleUserRound }] as const).map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><item.icon/><span>{item.label}</span>{item.id === 'reports' && payload.data.reports.some(report => report.status === 'returned') && <em/>}</button>)}</nav>{editor !== undefined && <ReportEditor key={editor?.id || 'new'} data={payload.data} report={editor || null} close={() => setEditor(undefined)} saved={data => setPayload({ ...payload, data })}/>}<Toaster richColors position="top-center"/></div>;
}
