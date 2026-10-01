import type { GroupDTO, ProfileDTO, TestRecord } from '@buildr/shared';
import { ApiError, NetworkError, api as defaultApi, type Api } from '../api/client.ts';
import { sessionResultsCsv } from '../session/export.ts';
import { localRepo } from '../offline/repo.ts';
import { serverMode } from './services.ts';

export interface PersonExport {
  format: 'buildr-force-person-export';
  version: 1;
  exportedAt: string;
  /** `server`: Serverstand + lokal noch nicht hochgeladene Tests · `local`: nur Gerätedaten (lokaler Modus oder offline) */
  source: 'server' | 'local';
  profile: ProfileDTO;
  groups: Array<{ id: string; name: string }>;
  tests: TestRecord[];
  /** Bei Servermodus: Verweise auf Roh-Aufnahmen (BFB1) und Protokollauszug; lokal leer */
  recordings: unknown[];
  sessions: unknown[];
  auditEvents: unknown[];
}

interface ServerExport {
  profile: ProfileDTO;
  groups: Array<{ id: string; name: string }>;
  tests: TestRecord[];
  recordings: unknown[];
  sessions: unknown[];
  auditEvents: unknown[];
}

/**
 * Auskunft/Datenübertragbarkeit (Art. 15/20 DSGVO) für eine Person: bevorzugt die Serverauskunft, ergänzt um lokal noch nicht
 * hochgeladene Tests. Ohne Server (lokaler Modus, offline) werden die Gerätedaten exportiert – das Ergebnis nennt die `source`.
 */
export async function buildPersonExport(
  profile: ProfileDTO,
  groups: ReadonlyArray<GroupDTO>,
  deps: { api?: Api; online?: boolean } = {},
): Promise<PersonExport> {
  const api = deps.api ?? defaultApi;
  const local = await localRepo.tests.byProfile(profile.id);
  const base = {
    format: 'buildr-force-person-export' as const,
    version: 1 as const,
    exportedAt: new Date().toISOString(),
  };
  const localGroups = groups
    .filter((g) => profile.groupIds.includes(g.id))
    .map((g) => ({ id: g.id, name: g.name }));
  if (serverMode() && deps.online !== false) {
    try {
      const s = await api.get<ServerExport>(`/api/profiles/${profile.id}/export`);
      const known = new Set(s.tests.map((t) => t.id));
      const pending = local.filter((t) => !known.has(t.id));
      return {
        ...base,
        source: 'server',
        profile: s.profile ?? profile,
        groups: s.groups,
        tests: [...s.tests, ...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        recordings: s.recordings,
        sessions: s.sessions,
        auditEvents: s.auditEvents,
      };
    } catch (e) {
      // offline oder Profil serverseitig (noch) unbekannt: Gerätedaten
      if (!(e instanceof NetworkError) && !(e instanceof ApiError && (e.status === 404 || e.status === 403)))
        throw e;
    }
  }
  return {
    ...base,
    source: 'local',
    profile,
    groups: localGroups,
    tests: [...local].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    recordings: [],
    sessions: [],
    auditEvents: [],
  };
}

/** Kennzahlen aller Wiederholungen der Person als CSV (Excel-tauglich). */
export function personResultsCsv(exp: PersonExport, lang: 'de' | 'en'): string {
  return sessionResultsCsv(exp.tests, new Map([[exp.profile.id, exp.profile]]), lang);
}

export const personExportFilename = (profile: ProfileDTO, ext: 'json' | 'csv'): string => {
  const slug = profile.name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `export-${slug || profile.id.slice(0, 8)}.${ext}`;
};
