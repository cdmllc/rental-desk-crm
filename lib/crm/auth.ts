import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { DEFAULT_ADMIN_USER_ID, DEMO_AGENT_USER_ID, type AccessRequest, type CrmSession, type CrmUser, type UserRole } from './model';
import { crmAccessLevels, workforceAccessLevels, type CrmAccess, type WorkforceAccess } from '@/lib/workforce/model';

const SESSION_COOKIE = 'cdm_crm_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
// Cloudflare Workers currently caps PBKDF2 at 100,000 iterations.
const PBKDF2_ITERATIONS = 100_000;
const ADMIN_EMAIL = 'ceo@cdm-lifesupport.com';

// These are one-time bootstrap hashes. Both seeded accounts must change their password after first login.
const BOOTSTRAP_USERS = [
  { id: DEFAULT_ADMIN_USER_ID, email: ADMIN_EMAIL, displayName: 'CDM 管理者', role: 'admin' as const, crmAccess: 'admin' as const, workforceAccess: 'admin' as const, salt: '1FLw0frHFiuwKgp3T2LIOA', hash: 'UrGNU6YRveuSGZ1Fj75-bgsESivP4E6vGWYeJQdmMXg' },
  { id: DEMO_AGENT_USER_ID, email: 'agent.demo@cdm-lifesupport.com', displayName: '佐々木（担当者）', role: 'agent' as const, crmAccess: 'own' as const, workforceAccess: 'none' as const, salt: 'dJzMIv4sYqqogu3BYuTbyw', hash: 'FPqteJLWOH7tfhdhw9OcBFqqA0B9voHAiyGAnuxgZp4' },
];

type UserRow = {
  id: string; email: string; display_name: string; role: UserRole; crm_access: CrmAccess; workforce_access: WorkforceAccess; password_salt: string; password_hash: string;
  must_change_password: number; active: number; failed_attempts: number; locked_until: number; created_at: number; updated_at: number;
};
type AccessRequestRow = {
  id: string; email: string; display_name: string; password_salt: string; password_hash: string;
  status: AccessRequest['status']; requested_at: number; reviewed_at: number | null; reviewed_by: string | null;
};

function database() {
  if (!env.DB) throw new Error('Database binding unavailable');
  return env.DB;
}

export async function ensureAuthSchema() {
  const db = database();
  const now = Date.now();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','agent')),
      crm_access TEXT NOT NULL DEFAULT 'own',
      workforce_access TEXT NOT NULL DEFAULT 'none',
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES crm_users(id) ON DELETE CASCADE
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS crm_sessions_token_idx ON crm_sessions(token_hash)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_access_requests (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      requested_at INTEGER NOT NULL,
      reviewed_at INTEGER,
      reviewed_by TEXT
    )`),
  ]);
  const columns = await db.prepare('PRAGMA table_info(crm_users)').all<{ name: string }>();
  const names = new Set((columns.results || []).map(column => column.name));
  const addedCrmAccess = !names.has('crm_access'), addedWorkforceAccess = !names.has('workforce_access');
  if (addedCrmAccess) await db.prepare("ALTER TABLE crm_users ADD COLUMN crm_access TEXT NOT NULL DEFAULT 'own'").run();
  if (addedWorkforceAccess) await db.prepare("ALTER TABLE crm_users ADD COLUMN workforce_access TEXT NOT NULL DEFAULT 'none'").run();
  if (addedCrmAccess) await db.prepare("UPDATE crm_users SET crm_access=CASE WHEN role='admin' THEN 'admin' ELSE 'own' END").run();
  if (addedWorkforceAccess) await db.prepare("UPDATE crm_users SET workforce_access=CASE WHEN role='admin' THEN 'admin' ELSE 'none' END").run();
  await db.batch([
    ...BOOTSTRAP_USERS.map(user => db.prepare(`INSERT OR IGNORE INTO crm_users
      (id,email,display_name,role,crm_access,workforce_access,password_salt,password_hash,must_change_password,active,failed_attempts,locked_until,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,1,1,0,0,?,?)`).bind(user.id, user.email, user.displayName, user.role, user.crmAccess, user.workforceAccess, user.salt, user.hash, now, now)),
    ...BOOTSTRAP_USERS.map(user => db.prepare(`UPDATE crm_users SET password_salt=?, password_hash=?, updated_at=?
      WHERE id=? AND must_change_password=1 AND created_at=updated_at`).bind(user.salt, user.hash, now, user.id)),
  ]);
}

export function publicUser(row: UserRow): CrmUser {
  return {
    id: row.id, email: row.email, displayName: row.display_name, role: row.role,
    crmAccess: row.crm_access || (row.role === 'admin' ? 'admin' : 'own'), workforceAccess: row.workforce_access || (row.role === 'admin' ? 'admin' : 'none'),
    active: row.active === 1, mustChangePassword: row.must_change_password === 1,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function sessionFromRow(row: UserRow): CrmSession {
  return {
    userId: row.id, email: row.email, displayName: row.display_name, role: row.role,
    isAdmin: row.role === 'admin', crmAccess: row.crm_access || (row.role === 'admin' ? 'admin' : 'own'), workforceAccess: row.workforce_access || (row.role === 'admin' ? 'admin' : 'none'), mustChangePassword: row.must_change_password === 1,
  };
}

export async function currentCrmSession(): Promise<CrmSession | null> {
  await ensureAuthSchema();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    const row = await database().prepare(`SELECT u.* FROM crm_sessions s JOIN crm_users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`).bind(await sha256(token), Date.now()).first<UserRow>();
    if (row) return sessionFromRow(row);
  }

  const chatGPTUser = await getChatGPTUser();
  if (chatGPTUser?.email.toLowerCase() === ADMIN_EMAIL) {
    const row = await findUserByEmail(ADMIN_EMAIL);
    if (row) return sessionFromRow(row);
  }
  return null;
}

export async function requireCrmSession(): Promise<CrmSession> {
  const session = await currentCrmSession();
  if (!session) throw new AuthError('ログインが必要です', 401);
  if (session.mustChangePassword) throw new AuthError('初期パスワードを変更してください', 403, 'PASSWORD_CHANGE_REQUIRED');
  return session;
}

export async function authenticate(email: string, password: string): Promise<{ session: CrmSession; token: string }> {
  await ensureAuthSchema();
  const row = await findUserByEmail(email.trim().toLowerCase());
  const now = Date.now();
  if (!row || !row.active || row.locked_until > now || !(await verifyPassword(password, row.password_salt, row.password_hash))) {
    if (row && row.active) {
      const attempts = row.failed_attempts + 1;
      const lockedUntil = attempts >= 5 ? now + 15 * 60 * 1000 : 0;
      await database().prepare('UPDATE crm_users SET failed_attempts=?, locked_until=?, updated_at=? WHERE id=?').bind(attempts >= 5 ? 0 : attempts, lockedUntil, now, row.id).run();
    }
    throw new AuthError('メールアドレスまたはパスワードが違います', 401);
  }
  await database().prepare('UPDATE crm_users SET failed_attempts=0, locked_until=0, updated_at=? WHERE id=?').bind(now, row.id).run();
  const token = randomToken(32);
  await database().prepare('DELETE FROM crm_sessions WHERE expires_at<=?').bind(now).run();
  await database().prepare('INSERT INTO crm_sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)')
    .bind(crypto.randomUUID(), row.id, await sha256(token), now + SESSION_TTL_SECONDS * 1000, now).run();
  return { session: sessionFromRow(row), token };
}

export async function changeOwnPassword(session: CrmSession, currentPassword: string, nextPassword: string) {
  const row = await database().prepare('SELECT * FROM crm_users WHERE id=? AND active=1').bind(session.userId).first<UserRow>();
  if (!row || !(await verifyPassword(currentPassword, row.password_salt, row.password_hash))) throw new AuthError('現在のパスワードが違います', 400);
  validatePassword(nextPassword);
  const password = await createPasswordRecord(nextPassword);
  await database().prepare('UPDATE crm_users SET password_salt=?, password_hash=?, must_change_password=0, failed_attempts=0, locked_until=0, updated_at=? WHERE id=?')
    .bind(password.salt, password.hash, Date.now(), session.userId).run();
}

export async function listUsers(): Promise<CrmUser[]> {
  await ensureAuthSchema();
  const result = await database().prepare('SELECT * FROM crm_users ORDER BY active DESC, role ASC, display_name ASC').all<UserRow>();
  return (result.results || []).map(publicUser);
}

export async function createUser(input: { email: string; displayName: string; role: UserRole; crmAccess?: CrmAccess; workforceAccess?: WorkforceAccess; initialPassword: string }): Promise<CrmUser> {
  validatePassword(input.initialPassword);
  const password = await createPasswordRecord(input.initialPassword);
  const id = crypto.randomUUID(), now = Date.now();
  try {
    await database().prepare(`INSERT INTO crm_users
      (id,email,display_name,role,crm_access,workforce_access,password_salt,password_hash,must_change_password,active,failed_attempts,locked_until,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,1,1,0,0,?,?)`).bind(id, input.email.trim().toLowerCase(), input.displayName.trim(), input.role, input.crmAccess || (input.role === 'admin' ? 'admin' : 'own'), input.workforceAccess || (input.role === 'admin' ? 'admin' : 'none'), password.salt, password.hash, now, now).run();
  } catch { throw new AuthError('このメールアドレスは登録済みです', 409); }
  const row = await database().prepare('SELECT * FROM crm_users WHERE id=?').bind(id).first<UserRow>();
  if (!row) throw new Error('User creation failed');
  return publicUser(row);
}

export async function updateUser(actor: CrmSession, input: { id: string; displayName?: string; role?: UserRole; crmAccess?: CrmAccess; workforceAccess?: WorkforceAccess; active?: boolean; initialPassword?: string }): Promise<CrmUser> {
  if (actor.userId === input.id && (input.role === 'agent' || input.active === false)) throw new AuthError('自分自身の管理者権限は停止できません', 400);
  const current = await database().prepare('SELECT * FROM crm_users WHERE id=?').bind(input.id).first<UserRow>();
  if (!current) throw new AuthError('担当者が見つかりません', 404);
  let salt = current.password_salt, hash = current.password_hash, mustChange = current.must_change_password;
  if (input.initialPassword) {
    validatePassword(input.initialPassword);
    const password = await createPasswordRecord(input.initialPassword);
    salt = password.salt; hash = password.hash; mustChange = 1;
    await database().prepare('DELETE FROM crm_sessions WHERE user_id=?').bind(input.id).run();
  }
  if (input.crmAccess && !crmAccessLevels.includes(input.crmAccess) || input.workforceAccess && !workforceAccessLevels.includes(input.workforceAccess)) throw new AuthError('権限設定を確認してください', 400);
  await database().prepare(`UPDATE crm_users SET display_name=?, role=?, crm_access=?, workforce_access=?, active=?, password_salt=?, password_hash=?, must_change_password=?, updated_at=? WHERE id=?`)
    .bind(input.displayName?.trim() || current.display_name, input.role || current.role, input.crmAccess || current.crm_access, input.workforceAccess || current.workforce_access, input.active === undefined ? current.active : Number(input.active), salt, hash, mustChange, Date.now(), input.id).run();
  const row = await database().prepare('SELECT * FROM crm_users WHERE id=?').bind(input.id).first<UserRow>();
  if (!row) throw new Error('User update failed');
  return publicUser(row);
}

export async function submitAccessRequest(input: { email: string; displayName: string; password: string }): Promise<AccessRequest> {
  await ensureAuthSchema();
  validatePassword(input.password);
  const email = input.email.trim().toLowerCase(), displayName = input.displayName.trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || !displayName) throw new AuthError('氏名とメールアドレスを確認してください', 400);
  if (await findUserByEmail(email)) throw new AuthError('このメールアドレスは登録済みです', 409);
  const existing = await database().prepare('SELECT * FROM crm_access_requests WHERE email=? COLLATE NOCASE').bind(email).first<AccessRequestRow>();
  const password = await createPasswordRecord(input.password), now = Date.now(), id = existing?.id || crypto.randomUUID();
  await database().prepare(`INSERT INTO crm_access_requests
    (id,email,display_name,password_salt,password_hash,status,requested_at,reviewed_at,reviewed_by)
    VALUES (?,?,?,?,?,'pending',?,NULL,NULL)
    ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name,password_salt=excluded.password_salt,password_hash=excluded.password_hash,status='pending',requested_at=excluded.requested_at,reviewed_at=NULL,reviewed_by=NULL`)
    .bind(id, email, displayName, password.salt, password.hash, now).run();
  return { id, email, displayName, status: 'pending', requestedAt: now, reviewedAt: null };
}

export async function listAccessRequests(): Promise<AccessRequest[]> {
  await ensureAuthSchema();
  const result = await database().prepare("SELECT * FROM crm_access_requests WHERE status='pending' ORDER BY requested_at ASC").all<AccessRequestRow>();
  return (result.results || []).map(row => ({ id: row.id, email: row.email, displayName: row.display_name, status: row.status, requestedAt: row.requested_at, reviewedAt: row.reviewed_at }));
}

export async function reviewAccessRequest(actor: CrmSession, id: string, decision: 'approve' | 'reject'): Promise<{ request: AccessRequest; user?: CrmUser }> {
  const request = await database().prepare("SELECT * FROM crm_access_requests WHERE id=? AND status='pending'").bind(id).first<AccessRequestRow>();
  if (!request) throw new AuthError('承認待ちの申請が見つかりません', 404);
  const now = Date.now();
  if (decision === 'reject') {
    await database().prepare("UPDATE crm_access_requests SET status='rejected',reviewed_at=?,reviewed_by=? WHERE id=?").bind(now, actor.userId, id).run();
    return { request: { id, email: request.email, displayName: request.display_name, status: 'rejected', requestedAt: request.requested_at, reviewedAt: now } };
  }
  if (await findUserByEmail(request.email)) throw new AuthError('このメールアドレスはすでに登録済みです', 409);
  const userId = crypto.randomUUID();
  await database().batch([
    database().prepare(`INSERT INTO crm_users
      (id,email,display_name,role,crm_access,workforce_access,password_salt,password_hash,must_change_password,active,failed_attempts,locked_until,created_at,updated_at)
      VALUES (?,?,?,'agent','own','none',?,?,0,1,0,0,?,?)`).bind(userId, request.email, request.display_name, request.password_salt, request.password_hash, now, now),
    database().prepare("UPDATE crm_access_requests SET status='approved',reviewed_at=?,reviewed_by=? WHERE id=?").bind(now, actor.userId, id),
  ]);
  const user = await database().prepare('SELECT * FROM crm_users WHERE id=?').bind(userId).first<UserRow>();
  if (!user) throw new Error('User approval failed');
  return { request: { id, email: request.email, displayName: request.display_name, status: 'approved', requestedAt: request.requested_at, reviewedAt: now }, user: publicUser(user) };
}

export async function revokeSession(token: string | undefined) {
  if (token) await database().prepare('DELETE FROM crm_sessions WHERE token_hash=?').bind(await sha256(token)).run();
}

export function sessionCookie(token: string) {
  return { name: SESSION_COOKIE, value: token, options: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: SESSION_TTL_SECONDS } };
}

export function clearSessionCookie() {
  return { name: SESSION_COOKIE, value: '', options: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 0 } };
}

export class AuthError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message); }
}

async function findUserByEmail(email: string) {
  return database().prepare('SELECT * FROM crm_users WHERE email=? COLLATE NOCASE').bind(email).first<UserRow>();
}

function validatePassword(value: string) {
  if (value.length < 10 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) throw new AuthError('パスワードは英字と数字を含む10文字以上にしてください', 400);
}

async function createPasswordRecord(password: string) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = base64url(saltBytes);
  return { salt, hash: await derivePassword(password, salt) };
}

async function verifyPassword(password: string, salt: string, expected: string) {
  const actual = await derivePassword(password, salt);
  if (actual.length !== expected.length) return false;
  let result = 0;
  for (let index = 0; index < actual.length; index += 1) result |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return result === 0;
}

async function derivePassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromBase64url(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return base64url(new Uint8Array(bits));
}

async function sha256(value: string) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

function randomToken(length: number) { return base64url(crypto.getRandomValues(new Uint8Array(length))); }
function base64url(value: Uint8Array) { return btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
function fromBase64url(value: string) { const normalized = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '='); return Uint8Array.from(atob(normalized), character => character.charCodeAt(0)); }
