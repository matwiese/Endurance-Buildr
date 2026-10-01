import type { NormRow, NormSetDTO } from '@buildr/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, NetworkError, api } from '../api/client.ts';
import { useRepoVersion, repoEvents } from '../offline/events.ts';
import { localRepo } from '../offline/repo.ts';
import { useAuth } from '../state/auth.ts';
import { useSettings } from '../state/settings.ts';

export interface NormSetInfo {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  rowCount: number;
}

const LIST_KEY = 'norms:list';
const setKey = (id: string): string => `norms:set:${id}`;
const serverMode = (): boolean => useAuth.getState().status === 'authenticated';

/**
 * Normsets: mit Server maßgeblich dort gespeichert (Admin importiert), lokal zwischengespeichert für den Offline-Betrieb;
 * im lokalen Modus nur lokal (IndexedDB `kv`).
 */
export async function listNormSets(): Promise<{ sets: NormSetInfo[]; offline: boolean }> {
  if (serverMode()) {
    try {
      const sets = await api.get<NormSetInfo[]>('/api/norms');
      await localRepo.kv.set(LIST_KEY, sets);
      return { sets, offline: false };
    } catch (e) {
      if (!(e instanceof NetworkError)) throw e;
      return { sets: (await localRepo.kv.get<NormSetInfo[]>(LIST_KEY)) ?? [], offline: true };
    }
  }
  return { sets: (await localRepo.kv.get<NormSetInfo[]>(LIST_KEY)) ?? [], offline: false };
}

export async function loadNormSet(id: string): Promise<NormSetDTO | null> {
  if (serverMode()) {
    try {
      const set = await api.get<NormSetDTO>(`/api/norms/${id}`);
      await localRepo.kv.set(setKey(id), set);
      return set;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      if (!(e instanceof NetworkError)) throw e;
    }
  }
  return (await localRepo.kv.get<NormSetDTO>(setKey(id))) ?? null;
}

export type NormSaveResult = 'ok' | 'offline' | 'forbidden' | 'invalid';

export async function saveNormSet(set: {
  id: string;
  name: string;
  description: string | null;
  rows: NormRow[];
}): Promise<NormSaveResult> {
  if (serverMode()) {
    try {
      await api.put(`/api/norms/${set.id}`, set);
    } catch (e) {
      if (e instanceof NetworkError) return 'offline';
      if (e instanceof ApiError) return e.status === 403 ? 'forbidden' : 'invalid';
      return 'invalid';
    }
  }
  const now = new Date().toISOString();
  const dto: NormSetDTO = { ...set, createdAt: now, updatedAt: now };
  await localRepo.kv.set(setKey(set.id), dto);
  const list = ((await localRepo.kv.get<NormSetInfo[]>(LIST_KEY)) ?? []).filter((s) => s.id !== set.id);
  list.push({
    id: set.id,
    name: set.name,
    description: set.description,
    updatedAt: now,
    rowCount: set.rows.length,
  });
  await localRepo.kv.set(LIST_KEY, list);
  repoEvents.bump();
  return 'ok';
}

export async function deleteNormSet(id: string): Promise<NormSaveResult> {
  if (serverMode()) {
    try {
      await api.del(`/api/norms/${id}`);
    } catch (e) {
      if (e instanceof NetworkError) return 'offline';
      if (e instanceof ApiError) return e.status === 403 ? 'forbidden' : 'invalid';
      return 'invalid';
    }
  }
  const list = ((await localRepo.kv.get<NormSetInfo[]>(LIST_KEY)) ?? []).filter((s) => s.id !== id);
  await localRepo.kv.set(LIST_KEY, list);
  await localRepo.kv.set(setKey(id), undefined);
  if (useSettings.getState().normSetId === id) useSettings.getState().set({ normSetId: null });
  repoEvents.bump();
  return 'ok';
}

/** Liste der Normsets (lädt bei lokalen Änderungen neu). */
export function useNormSets(): {
  sets: NormSetInfo[];
  loaded: boolean;
  offline: boolean;
  reload: () => void;
} {
  const version = useRepoVersion();
  const [state, setState] = useState<{ sets: NormSetInfo[]; loaded: boolean; offline: boolean }>({
    sets: [],
    loaded: false,
    offline: false,
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    listNormSets()
      .then((r) => alive && setState({ ...r, loaded: true }))
      .catch(() => alive && setState((s) => ({ ...s, loaded: true })));
    return () => {
      alive = false;
    };
  }, [version, tick]);
  return { ...state, reload: useCallback(() => setTick((n) => n + 1), []) };
}

/** Zeilen des gewählten Normsets (Einstellung `normSetId`). */
export function useActiveNorms(): { rows: NormRow[]; set: NormSetDTO | null } {
  const id = useSettings((s) => s.normSetId);
  const [set, setSet] = useState<NormSetDTO | null>(null);
  useEffect(() => {
    let alive = true;
    if (!id) {
      setSet(null);
      return;
    }
    void loadNormSet(id).then((s) => alive && setSet(s));
    return () => {
      alive = false;
    };
  }, [id]);
  return { rows: set?.rows ?? [], set };
}
