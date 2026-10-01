import { decodeBlob, type ForceTrace } from '@buildr/core';
import type { TestRecord } from '@buildr/shared';
import { useQuery } from '@tanstack/react-query';
import { ApiError, NetworkError, api } from '../api/client.ts';
import { useRepoVersion } from '../offline/events.ts';
import { localRepo } from '../offline/repo.ts';
import { useAuth } from '../state/auth.ts';
import { BROWSER_CODEC } from '../sync/blob.ts';

export interface TestFilter {
  profileId?: string;
  sessionId?: string;
  testType?: string;
  /** ISO-Zeitpunkte (einschließlich) */
  from?: string;
  to?: string;
  groupIds?: string[];
}

export interface TestsResult {
  tests: TestRecord[];
  /** Server war nicht erreichbar → nur lokale Tests */
  offline: boolean;
}

const PAGE = 500;
const MAX_PAGES = 20;

function matches(t: TestRecord, f: TestFilter, groupOf: Map<string, string[]>): boolean {
  if (f.profileId && t.profileId !== f.profileId) return false;
  if (f.sessionId && t.sessionId !== f.sessionId) return false;
  if (f.testType && t.testType !== f.testType) return false;
  if (f.from && t.createdAt < f.from) return false;
  if (f.to && t.createdAt > f.to) return false;
  if (f.groupIds?.length) {
    const g = t.profileId ? (groupOf.get(t.profileId) ?? []) : [];
    if (!g.some((x) => f.groupIds!.includes(x))) return false;
  }
  return true;
}

/** Tests vom Server (seitenweise) und lokal vorhandene (z. B. noch nicht hochgeladene) zusammenführen; lokal gewinnt je ID. */
export async function loadTests(filter: TestFilter, authed: boolean): Promise<TestsResult> {
  const profiles = await localRepo.profiles.list();
  const groupOf = new Map(profiles.map((p) => [p.id, p.groupIds]));
  const byId = new Map<string, TestRecord>();
  let offline = false;
  if (authed) {
    try {
      const qs = new URLSearchParams();
      if (filter.profileId) qs.set('profileId', filter.profileId);
      if (filter.sessionId) qs.set('sessionId', filter.sessionId);
      if (filter.testType) qs.set('testType', filter.testType);
      if (filter.from) qs.set('from', filter.from);
      if (filter.to) qs.set('to', filter.to);
      if (filter.groupIds?.length) qs.set('groupIds', filter.groupIds.join(','));
      qs.set('limit', String(PAGE));
      for (let page = 0; page < MAX_PAGES; page++) {
        qs.set('offset', String(page * PAGE));
        const chunk = await api.get<TestRecord[]>(`/api/tests?${qs}`);
        for (const t of chunk) byId.set(t.id, t);
        if (chunk.length < PAGE) break;
      }
    } catch (e) {
      if (e instanceof NetworkError) offline = true;
      else if (!(e instanceof ApiError && e.status === 403)) throw e;
    }
  }
  for (const t of await localRepo.tests.list())
    if (matches(t, filter, groupOf)) byId.set(t.id, { ...(byId.get(t.id) ?? t), ...t });
  const tests = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { tests, offline };
}

/** Tests für Hub-Seiten (Verlauf, Listen, Berichte): lädt bei lokalen Änderungen und Filteränderung neu. */
export function useTests(filter: TestFilter, enabled = true) {
  const authed = useAuth((s) => s.status === 'authenticated');
  const version = useRepoVersion();
  const q = useQuery({
    queryKey: ['tests', filter, authed, version],
    queryFn: () => loadTests(filter, authed),
    enabled,
    staleTime: 10_000,
  });
  return {
    tests: q.data?.tests ?? [],
    offline: q.data?.offline ?? false,
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  };
}

/** Ein Test: lokal (auch nicht hochgeladen) oder vom Server. */
export async function loadTest(
  id: string,
  authed: boolean,
): Promise<{ test: TestRecord | null; offline: boolean }> {
  const local = await localRepo.tests.get(id);
  if (local) return { test: local, offline: false };
  if (!authed) return { test: null, offline: false };
  try {
    return { test: await api.get<TestRecord>(`/api/tests/${id}`), offline: false };
  } catch (e) {
    if (e instanceof NetworkError) return { test: null, offline: true };
    if (e instanceof ApiError && (e.status === 404 || e.status === 403))
      return { test: null, offline: false };
    throw e;
  }
}

export function useTest(id: string) {
  const authed = useAuth((s) => s.status === 'authenticated');
  const version = useRepoVersion();
  const q = useQuery({
    queryKey: ['test', id, authed, version],
    queryFn: () => loadTest(id, authed),
    staleTime: 5_000,
  });
  return {
    test: q.data?.test ?? null,
    offline: q.data?.offline ?? false,
    loading: q.isLoading,
    refetch: q.refetch,
  };
}

/** Roh-Aufnahme eines Tests (lokal oder vom Server, BFB1 dekodiert). */
export async function loadRecordingTrace(recordingId: string, authed: boolean): Promise<ForceTrace | null> {
  const local = await localRepo.recordings.get(recordingId);
  if (local)
    return {
      hz: local.hz,
      left: local.left,
      right: local.right,
      copX: local.copX,
      copY: local.copY,
      breaks: local.breaks,
    };
  if (!authed) return null;
  try {
    const bytes = await api.getBlob(`/api/recordings/${recordingId}`);
    return await decodeBlob(bytes, [BROWSER_CODEC]);
  } catch {
    return null;
  }
}
