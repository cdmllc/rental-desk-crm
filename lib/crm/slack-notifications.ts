import { env } from 'cloudflare:workers';
import { dataSchema, type Data, type Task } from './model';
import { listUsers } from './auth';
import { sampleData } from './seed';

const workspace = 'primary';
const tokyoTimeZone = 'Asia/Tokyo';

export const slackNotificationTypes = ['day-before-0900', 'due-day-1200', 'overdue-1600'] as const;
export type SlackNotificationType = (typeof slackNotificationTypes)[number];

type RuntimeEnvironment = {
  DB?: D1Database;
  SLACK_WEBHOOK_URL?: string;
  SLACK_CHANNEL?: string;
  SLACK_CRON_SECRET?: string;
  SLACK_NOTIFICATIONS_ENABLED?: string;
  CRM_BASE_URL?: string;
};

export type SlackNotificationHistory = {
  id: string;
  taskId: string;
  taskTitle: string;
  notificationType: SlackNotificationType;
  recipientName: string;
  status: 'pending' | 'sent' | 'failed';
  error: string;
  sentAt: number | null;
  createdAt: number;
};

export type SlackNotificationConfig = {
  enabled: boolean;
  webhookConfigured: boolean;
  cronSecretConfigured: boolean;
  channel: string;
  baseUrl: string;
};

type NotificationCandidate = {
  task: Task;
  type: SlackNotificationType;
  assigneeName: string;
  assigneeSlackUserId: string;
  adminMentions: string[];
  customerName: string;
  dealLabel: string;
};

function runtimeEnvironment(): RuntimeEnvironment {
  return env as unknown as RuntimeEnvironment;
}

function database() {
  const db = runtimeEnvironment().DB;
  if (!db) throw new Error('Database binding unavailable');
  return db;
}

export function slackNotificationConfig(): SlackNotificationConfig {
  const runtime = runtimeEnvironment();
  const webhookConfigured = Boolean(runtime.SLACK_WEBHOOK_URL?.trim());
  const cronSecretConfigured = Boolean(runtime.SLACK_CRON_SECRET?.trim());
  return {
    enabled: webhookConfigured && runtime.SLACK_NOTIFICATIONS_ENABLED !== 'false',
    webhookConfigured,
    cronSecretConfigured,
    channel: runtime.SLACK_CHANNEL?.trim() || '',
    baseUrl: runtime.CRM_BASE_URL?.trim() || 'https://crm.cdm-lifesupport.com/',
  };
}

export function verifySlackCronSecret(value: string | null) {
  const expected = runtimeEnvironment().SLACK_CRON_SECRET?.trim();
  if (!expected || !value) return false;
  const supplied = value.startsWith('Bearer ') ? value.slice(7) : value;
  if (supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < supplied.length; index += 1) difference |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

async function ensureNotificationSchema() {
  await database().batch([
    database().prepare(`CREATE TABLE IF NOT EXISTS crm_task_notification_log (
      id TEXT PRIMARY KEY NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      task_id TEXT NOT NULL,
      task_title TEXT NOT NULL,
      due_date TEXT NOT NULL,
      notification_type TEXT NOT NULL,
      recipient_user_id TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','sent','failed')),
      response_code INTEGER,
      error TEXT NOT NULL DEFAULT '',
      sent_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    database().prepare('CREATE INDEX IF NOT EXISTS crm_task_notification_task_idx ON crm_task_notification_log(task_id)'),
  ]);
}

async function readCrmData(): Promise<Data> {
  await database().prepare(`CREATE TABLE IF NOT EXISTS crm_state (
    workspace_id TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  const row = await database().prepare('SELECT data FROM crm_state WHERE workspace_id=?').bind(workspace).first<{ data: string }>();
  return row ? dataSchema.parse(JSON.parse(row.data)) : sampleData();
}

function tokyoParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tokyoTimeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
  return { date: `${value('year')}-${value('month')}-${value('day')}`, hour: Number(value('hour')) };
}

function shiftDate(date: string, offset: number) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

export function notificationTypeForTime(now: Date): SlackNotificationType | null {
  const hour = tokyoParts(now).hour;
  return hour === 9 ? 'day-before-0900' : hour === 12 ? 'due-day-1200' : hour === 16 ? 'overdue-1600' : null;
}

function tasksForType(data: Data, type: SlackNotificationType, today: string) {
  const dueDate = type === 'day-before-0900' ? shiftDate(today, 1) : today;
  return data.tasks.filter(task => !task.done && task.dueDate === dueDate);
}

async function candidatesForType(data: Data, type: SlackNotificationType, today: string): Promise<NotificationCandidate[]> {
  const users = await listUsers();
  const admins = users.filter(user => user.active && user.role === 'admin');
  return tasksForType(data, type, today).map(task => {
    const assignee = users.find(user => user.id === task.assigneeUserId);
    const deal = data.deals.find(item => item.id === task.dealId);
    const customer = data.customers.find(item => item.id === deal?.customerId);
    return {
      task,
      type,
      assigneeName: assignee?.displayName || task.owner || '担当者未設定',
      assigneeSlackUserId: assignee?.slackUserId || '',
      adminMentions: type === 'overdue-1600' ? admins.map(user => user.slackUserId).filter(Boolean) : [],
      customerName: customer?.name || '顧客未設定',
      dealLabel: deal ? `${deal.property || data.products.find(product => product.id === deal.productId)?.name || '案件'} ${deal.room}`.trim() : '案件未設定',
    };
  });
}

function notificationTitle(type: SlackNotificationType) {
  if (type === 'day-before-0900') return '⏰ 期限前日のお知らせ';
  if (type === 'due-day-1200') return '📌 本日が期限のタスク';
  return '🚨 16:00時点で未完了のタスク';
}

function slackPayload(candidate: NotificationCandidate, config: SlackNotificationConfig) {
  const assignee = candidate.assigneeSlackUserId ? `<@${candidate.assigneeSlackUserId}>` : `*${candidate.assigneeName}*`;
  const escalation = candidate.type === 'overdue-1600'
    ? `\n管理者確認: ${candidate.adminMentions.length ? candidate.adminMentions.map(id => `<@${id}>`).join(' ') : '管理者（Slack ID未設定）'}`
    : '';
  const text = `${notificationTitle(candidate.type)}\n${assignee} ${candidate.task.title}\n期限: ${candidate.task.dueDate}\n顧客・案件: ${candidate.customerName} / ${candidate.dealLabel}${escalation}`;
  return {
    ...(config.channel ? { channel: config.channel } : {}),
    text,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: notificationTitle(candidate.type), emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `${assignee}\n*${candidate.task.title}*\n期限: ${candidate.task.dueDate}\n顧客・案件: ${candidate.customerName} / ${candidate.dealLabel}${escalation}` } },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'CRMでタスクを確認' }, url: config.baseUrl }] },
    ],
  };
}

function validWebhookUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'hooks.slack.com' || url.hostname === 'hooks.slack-gov.com');
  } catch { return false; }
}

async function sendSlack(candidate: NotificationCandidate, config: SlackNotificationConfig) {
  const webhook = runtimeEnvironment().SLACK_WEBHOOK_URL?.trim() || '';
  if (!validWebhookUrl(webhook)) throw new Error('Slack Webhook URLが無効です');
  const response = await fetch(webhook, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(slackPayload(candidate, config)),
  });
  if (!response.ok) throw new Error(`Slack送信に失敗しました (${response.status})`);
  return response.status;
}

async function claimNotification(candidate: NotificationCandidate) {
  await ensureNotificationSchema();
  const key = `${candidate.task.id}:${candidate.task.dueDate}:${candidate.type}`;
  const now = Date.now();
  const existing = await database().prepare('SELECT status,updated_at FROM crm_task_notification_log WHERE dedupe_key=?').bind(key).first<{ status: string; updated_at: number }>();
  if (existing?.status === 'sent' || existing?.status === 'pending' && existing.updated_at > now - 10 * 60 * 1000) return null;
  if (existing) {
    const result = await database().prepare("UPDATE crm_task_notification_log SET status='pending',error='',updated_at=? WHERE dedupe_key=? AND status='failed'").bind(now, key).run();
    return result.meta.changes ? key : null;
  }
  try {
    await database().prepare(`INSERT INTO crm_task_notification_log
      (id,dedupe_key,task_id,task_title,due_date,notification_type,recipient_user_id,recipient_name,status,response_code,error,sent_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,'pending',NULL,'',NULL,?,?)`)
      .bind(crypto.randomUUID(), key, candidate.task.id, candidate.task.title, candidate.task.dueDate, candidate.type, candidate.task.assigneeUserId, candidate.assigneeName, now, now).run();
    return key;
  } catch { return null; }
}

export async function processSlackTaskNotifications(now = new Date(), forcedType?: SlackNotificationType) {
  const config = slackNotificationConfig();
  if (!config.enabled) return { ok: false, reason: 'Slack通知は未設定または無効です', type: forcedType || notificationTypeForTime(now), candidates: 0, sent: 0, skipped: 0, failed: 0 };
  const type = forcedType || notificationTypeForTime(now);
  if (!type) return { ok: true, reason: '現在時刻は通知対象外です', type: null, candidates: 0, sent: 0, skipped: 0, failed: 0 };
  const today = tokyoParts(now).date, data = await readCrmData(), candidates = await candidatesForType(data, type, today);
  let sent = 0, skipped = 0, failed = 0;
  for (const candidate of candidates) {
    const key = await claimNotification(candidate);
    if (!key) { skipped += 1; continue; }
    try {
      const responseCode = await sendSlack(candidate, config), timestamp = Date.now();
      await database().prepare("UPDATE crm_task_notification_log SET status='sent',response_code=?,sent_at=?,updated_at=? WHERE dedupe_key=?").bind(responseCode, timestamp, timestamp, key).run();
      sent += 1;
    } catch (error) {
      await database().prepare("UPDATE crm_task_notification_log SET status='failed',error=?,updated_at=? WHERE dedupe_key=?").bind(error instanceof Error ? error.message : '送信失敗', Date.now(), key).run();
      failed += 1;
    }
  }
  return { ok: failed === 0, reason: '', type, candidates: candidates.length, sent, skipped, failed };
}

export async function previewSlackTaskNotifications(now = new Date()) {
  const today = tokyoParts(now).date, data = await readCrmData();
  const entries = await Promise.all(slackNotificationTypes.map(async type => ({ type, count: (await candidatesForType(data, type, today)).length })));
  return { date: today, entries };
}

export async function sendSlackTestMessage(actorName: string) {
  const config = slackNotificationConfig(), webhook = runtimeEnvironment().SLACK_WEBHOOK_URL?.trim() || '';
  if (!config.enabled || !validWebhookUrl(webhook)) throw new Error('Slack Webhookが設定されていません');
  const response = await fetch(webhook, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...(config.channel ? { channel: config.channel } : {}), text: `✅ CRMシステムのSlack通知テストに成功しました。実行者: ${actorName}` }),
  });
  if (!response.ok) throw new Error(`Slack送信に失敗しました (${response.status})`);
  return { ok: true };
}

export async function listSlackNotificationHistory(limit = 50): Promise<SlackNotificationHistory[]> {
  await ensureNotificationSchema();
  const result = await database().prepare(`SELECT id,task_id,task_title,notification_type,recipient_name,status,error,sent_at,created_at
    FROM crm_task_notification_log ORDER BY created_at DESC LIMIT ?`).bind(Math.min(Math.max(limit, 1), 200)).all<{
      id: string; task_id: string; task_title: string; notification_type: SlackNotificationType; recipient_name: string;
      status: SlackNotificationHistory['status']; error: string; sent_at: number | null; created_at: number;
    }>();
  return (result.results || []).map(row => ({
    id: row.id, taskId: row.task_id, taskTitle: row.task_title, notificationType: row.notification_type,
    recipientName: row.recipient_name, status: row.status, error: row.error, sentAt: row.sent_at, createdAt: row.created_at,
  }));
}
