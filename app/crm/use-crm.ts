'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dataSchema, emptyData, type CrmPayload, type CrmSession, type Data } from '@/lib/crm/model';

type SaveState = '読込中' | '保存済み' | '保存中' | '未保存' | 'ログイン待ち' | '読込エラー';

function parsePayload(value: unknown): CrmPayload {
  const payload = value as { data?: unknown; session?: CrmSession };
  if (!payload.session?.email || !payload.session.userId) throw new Error('session unavailable');
  return { data: dataSchema.parse(payload.data), session: payload.session };
}

export function useCrm() {
  const [data, setData] = useState<Data>(() => emptyData());
  const [session, setSession] = useState<CrmSession | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('読込中');
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const hydrated = useRef(false);

  const load = useCallback(async () => {
    setReady(false);
    try {
      const response = await fetch('/api/crm', { cache: 'no-store' });
      const body = await response.json() as { error?: string; code?: string };
      if (!response.ok) {
        if (response.status === 401 || body.code === 'PASSWORD_CHANGE_REQUIRED') {
          setSaveState('ログイン待ち');
          setReady(true);
          return;
        }
        if (response.status === 403 && body.code === 'PASSWORD_CHANGE_REQUIRED') {
          const sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });
          if (sessionResponse.ok) setSession((await sessionResponse.json() as { session: CrmSession }).session);
          setSaveState('ログイン待ち');
          setReady(true);
          return;
        }
        if (response.status === 403 && body.code === 'CRM_ACCESS_DENIED') {
          const sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });
          if (!sessionResponse.ok) throw new Error('session unavailable');
          setSession((await sessionResponse.json() as { session: CrmSession }).session);
          setData(emptyData());
          hydrated.current = false;
          setSaveState('保存済み');
          setReady(true);
          return;
        }
        throw new Error(body.error || 'remote unavailable');
      }
      const payload = parsePayload(body);
      setData(payload.data);
      setSession(payload.session);
      hydrated.current = true;
      setReady(true);
      setSaveState('保存済み');
    } catch {
      setReady(true);
      setSaveState('読込エラー');
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const login = useCallback(async (email: string, password: string) => {
    setAuthLoading(true); setAuthError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const body = await response.json() as { error?: string; session?: CrmSession };
      if (!response.ok || !body.session) throw new Error(body.error || 'ログインできませんでした');
      setSession(body.session);
      if (!body.session.mustChangePassword) await load();
      return true;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'ログインできませんでした');
      return false;
    } finally { setAuthLoading(false); setReady(true); }
  }, [load]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setAuthLoading(true); setAuthError('');
    try {
      const response = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'パスワードを変更できませんでした');
      await load();
      return true;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'パスワードを変更できませんでした');
      return false;
    } finally { setAuthLoading(false); }
  }, [load]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    hydrated.current = false;
    setSession(null); setData(emptyData()); setSaveState('ログイン待ち'); setReady(true);
  }, []);

  const update = useCallback((change: (current: Data) => Data) => {
    setData(current => {
      const next = change(current);
      if (hydrated.current) setSaveState('未保存');
      return next;
    });
  }, []);

  const save = useCallback(async (next = data) => {
    if (!hydrated.current) return false;
    setSaveState('保存中');
    try {
      const response = await fetch('/api/crm', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error('save failed');
      setSaveState('保存済み');
      return true;
    } catch { setSaveState('未保存'); return false; }
  }, [data]);

  useEffect(() => {
    if (!hydrated.current || saveState !== '未保存') return;
    const timer = window.setTimeout(() => { void save(data); }, 700);
    return () => window.clearTimeout(timer);
  }, [data, save, saveState]);

  return { data, session, update, save, saveState, ready, authError, authLoading, login, changePassword, logout };
}
