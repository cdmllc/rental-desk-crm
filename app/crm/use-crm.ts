'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dataSchema, type Data } from '@/lib/crm/model';
import { sampleData } from '@/lib/crm/seed';

type SaveState = '読込中' | '保存済み' | '保存中' | '未保存';
const localKey = 'rental-desk-crm-v1';

export function useCrm() {
  const [data, setData] = useState<Data>(() => sampleData());
  const [saveState, setSaveState] = useState<SaveState>('読込中');
  const hydrated = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      fetch('/api/crm', { cache: 'no-store' }).then(async r => {
        if (!r.ok) throw new Error('remote unavailable');
        return dataSchema.parse(await r.json());
      }),
      Promise.resolve(localStorage.getItem(localKey)).then(raw => raw ? dataSchema.parse(JSON.parse(raw)) : null),
    ]).then(([remote, local]) => {
      if (!active) return;
      if (remote.status === 'fulfilled') setData(remote.value);
      else if (local.status === 'fulfilled' && local.value) setData(local.value);
      hydrated.current = true;
      setSaveState('保存済み');
    });
    return () => { active = false; };
  }, []);

  const update = useCallback((change: (current: Data) => Data) => {
    setData(current => {
      const next = change(current);
      if (hydrated.current) {
        localStorage.setItem(localKey, JSON.stringify(next));
        setSaveState('未保存');
      }
      return next;
    });
  }, []);

  const save = useCallback(async (next = data) => {
    setSaveState('保存中');
    localStorage.setItem(localKey, JSON.stringify(next));
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

  return { data, update, save, saveState };
}
