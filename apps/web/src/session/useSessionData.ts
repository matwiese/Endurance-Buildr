import type { ProfileDTO, SessionDTO, TestRecord } from '@buildr/shared';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../api/client.ts';
import { useRepoVersion } from '../offline/events.ts';
import { localRepo } from '../offline/repo.ts';
import { useAuth } from '../state/auth.ts';
import { syncEngine } from '../sync/index.ts';

export interface SessionData {
  loaded: boolean;
  session: SessionDTO | null;
  profiles: Map<string, ProfileDTO>;
  tests: TestRecord[];
}

/**
 * Session, Athleten und Tests der Session: aus der lokalen Datenschicht (live, auch offline). Mit `remote` (z. B. Beamer-Rangliste
 * auf einem zweiten Rechner) werden zusätzlich Session und Tests regelmäßig vom Server geholt und zusammengeführt.
 */
export function useSessionData(
  sessionId: string,
  opts: { remote?: boolean; pollMs?: number } = {},
): SessionData {
  const version = useRepoVersion();
  const authed = useAuth((s) => s.status === 'authenticated');
  const [local, setLocal] = useState<SessionData>({
    loaded: false,
    session: null,
    profiles: new Map(),
    tests: [],
  });
  const [remote, setRemote] = useState<{ session: SessionDTO | null; tests: TestRecord[] }>({
    session: null,
    tests: [],
  });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [session, profiles, tests] = await Promise.all([
        localRepo.sessions.get(sessionId),
        localRepo.profiles.list(),
        localRepo.tests.list(),
      ]);
      if (alive)
        setLocal({
          loaded: true,
          session: session ?? null,
          profiles: new Map(profiles.map((p) => [p.id, p])),
          tests: tests.filter((t) => t.sessionId === sessionId),
        });
    })();
    return () => {
      alive = false;
    };
  }, [sessionId, version]);

  useEffect(() => {
    if (!opts.remote || !authed) return;
    let alive = true;
    const pull = async () => {
      try {
        const [session, tests] = await Promise.all([
          api.get<SessionDTO>(`/api/sessions/${sessionId}`),
          api.get<TestRecord[]>(`/api/tests?sessionId=${sessionId}&limit=2000`),
        ]);
        if (alive) setRemote({ session, tests });
        void syncEngine.run(); // Stammdaten (Namen der Athleten) nachziehen
      } catch (e) {
        if (!(e instanceof ApiError) && alive) setRemote((r) => r); // Netzfehler: letzten Stand behalten
      }
    };
    void pull();
    const id = setInterval(() => void pull(), opts.pollMs ?? 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [sessionId, opts.remote, opts.pollMs, authed]);

  return useMemo(() => {
    // lokal zuerst (aktueller), Server ergänzt
    const byId = new Map<string, TestRecord>();
    for (const t of remote.tests) byId.set(t.id, t);
    for (const t of local.tests) byId.set(t.id, t);
    const l = local.session;
    const r = remote.session;
    const session = l && r ? (l.updatedAt >= r.updatedAt ? l : r) : (l ?? r);
    return { loaded: local.loaded, session, profiles: local.profiles, tests: [...byId.values()] };
  }, [local, remote]);
}
