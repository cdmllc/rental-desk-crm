'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dataSchema, emptyData, type CrmPayload, type CrmSession, type Data } from '@/lib/crm/model';

type SaveState = '読込中' | '保存済み' | '保存中' | '未保存' | '読込エラー';

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
  const hydrated = useRef(false);

  useEffect(() => {
    let active = true;
    fetch('/api/crm', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('remote unavailable');
        return parsePayload(await response.json());
      })
      .then(payload => {
        if (!active) return;
        setData(payload.data);
        setSession(payload.session);
        hydrated.current = true;
        setReady(true);
        setSaveState('保存済み');
      })
      .catch(() => { if (active) setSaveState('読込エラー'); });
    return () => { active = false; };
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
    } catch {
      setSaveState('未保存');
      return false;
    }
  }, [data]);

  useEffect(() => {
    if (!hydrated.current || saveState !== '未保存') return;
    const timer = window.setTimeout(() => { void save(data); }, 700);
    return () => window.clearTimeout(timer);
  }, [data, save, saveState]);

  return { data, session, update, save, saveState, ready };
}
