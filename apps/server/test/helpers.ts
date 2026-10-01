import { randomUUID } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import {
  analyzeRecording,
  encodeBlob,
  jumpTrial,
  renderScript,
  standProfile,
  withRest,
  type BlobCodec,
} from '@buildr/core';
import { ANALYSIS_VERSION, type ProfileInput, type TestInput } from '@buildr/shared';
import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { createServer, type Server } from '../src/server.ts';
import { MemoryBlobStore } from '../src/storage/blobStore.ts';

export const TEST_ENV = {
  NODE_ENV: 'test',
  SCRYPT_LOG_N: '10',
  LOGIN_MAX_ATTEMPTS: '5',
  DATA_DIR: '.data-test',
};

export interface TestServer extends Server {
  blobs: MemoryBlobStore;
}

/**
 * Standard: PGlite im Speicher. Mit `TEST_DATABASE_URL=postgres://…` läuft dieselbe Suite gegen echtes PostgreSQL
 * (je Test-Server eine frische Datenbank, die beim Schließen wieder gelöscht wird).
 */
export async function makeServer(env: Record<string, string> = {}): Promise<TestServer> {
  const blobs = new MemoryBlobStore();
  const base = process.env['TEST_DATABASE_URL'];
  if (!base) {
    const s = await createServer({ ...TEST_ENV, ...env }, { memory: true, blobs });
    return Object.assign(s, { blobs });
  }
  const name = `bf_test_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`create database ${name}`);
  const url = new URL(base);
  url.pathname = `/${name}`;
  const s = await createServer({ ...TEST_ENV, ...env, DATABASE_URL: url.toString() }, { blobs });
  const close = s.close;
  s.close = async () => {
    await close();
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  };
  return Object.assign(s, { blobs });
}

export interface Client {
  cookie: string;
  req(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<LightMyRequestResponse>;
  get(url: string): Promise<LightMyRequestResponse>;
  put(url: string, body?: unknown): Promise<LightMyRequestResponse>;
  post(url: string, body?: unknown): Promise<LightMyRequestResponse>;
  patch(url: string, body?: unknown): Promise<LightMyRequestResponse>;
  del(url: string): Promise<LightMyRequestResponse>;
  putBlob(url: string, bytes: Uint8Array, headers?: Record<string, string>): Promise<LightMyRequestResponse>;
}

export const PASSWORD = 'correct horse battery';

export function client(s: Server, cookie = ''): Client {
  const req: Client['req'] = (method, url, body, headers = {}) =>
    s.app.inject({
      method: method as 'GET',
      url,
      payload: body === undefined ? undefined : (body as object),
      headers: { ...(cookie ? { cookie } : {}), ...headers },
    });
  return {
    cookie,
    req,
    get: (u) => req('GET', u),
    put: (u, b) => req('PUT', u, b),
    post: (u, b) => req('POST', u, b),
    patch: (u, b) => req('PATCH', u, b),
    del: (u) => req('DELETE', u),
    putBlob: (u, bytes, headers = {}) =>
      s.app.inject({
        method: 'PUT',
        url: u,
        payload: Buffer.from(bytes),
        headers: { 'content-type': 'application/octet-stream', ...(cookie ? { cookie } : {}), ...headers },
      }),
  };
}

export const cookieOf = (res: LightMyRequestResponse): string => {
  const c = res.cookies.find((x) => x.name === 'bf_session');
  return c ? `${c.name}=${c.value}` : '';
};

/** Wizard: legt Organisation + Admin an und liefert den angemeldeten Client. */
export async function setupAdmin(s: Server, email = 'admin@example.test'): Promise<Client> {
  const res = await client(s).post('/api/auth/setup', {
    organization: 'Test Org',
    name: 'Admin',
    email,
    password: PASSWORD,
  });
  if (res.statusCode !== 201) throw new Error(`setup failed: ${res.statusCode} ${res.body}`);
  return client(s, cookieOf(res));
}

export async function login(s: Server, email: string, password = PASSWORD): Promise<Client> {
  const res = await client(s).post('/api/auth/login', { email, password });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return client(s, cookieOf(res));
}

/** Legt einen weiteren Nutzer an (als Admin) und meldet ihn an. */
export async function addUser(
  s: Server,
  admin: Client,
  email: string,
  role: 'admin' | 'tester' | 'viewer',
  extra: {
    groupScope?: 'all' | 'restricted';
    access?: Array<{ groupId: string; access: 'read' | 'write' }>;
  } = {},
): Promise<Client> {
  const res = await admin.post('/api/users', {
    email,
    name: email.split('@')[0],
    password: PASSWORD,
    role,
    ...extra,
  });
  if (res.statusCode !== 201) throw new Error(`add user failed: ${res.statusCode} ${res.body}`);
  return login(s, email);
}

export interface RefData {
  categoryId: string;
  groupIds: string[];
}

/** Zwei Gruppen in der Standardkategorie + eine weitere Kategorie anlegen. */
export async function makeGroups(admin: Client, names = ['U19', 'Profis']): Promise<RefData> {
  const categoryId = randomUUID();
  const r = await admin.put(`/api/reference/categories/${categoryId}`, { id: categoryId, name: 'Teams' });
  if (r.statusCode !== 200) throw new Error(r.body);
  const groupIds: string[] = [];
  for (const name of names) {
    const id = randomUUID();
    const g = await admin.put(`/api/reference/groups/${id}`, { id, categoryId, name });
    if (g.statusCode !== 200) throw new Error(g.body);
    groupIds.push(id);
  }
  return { categoryId, groupIds };
}

export const profileBody = (groupIds: string[], over: Partial<ProfileInput> = {}): ProfileInput => {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name: 'Test Athlet',
    dateOfBirth: '1998-04-02',
    sex: 'f',
    heightCm: 172,
    weightKg: 66,
    sport: 'Handball',
    email: null,
    notes: null,
    externalId: null,
    allowPhotoVideo: false,
    guardianConsent: false,
    healthConsentAt: now,
    groupIds,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
};

export const deflate: BlobCodec = { id: 1, compress: (b) => deflateRawSync(b), decompress: (b) => b };

export interface Upload {
  recordingId: string;
  blob: Uint8Array;
  test: TestInput;
}

/** Realistischer Upload: simulierte CMJs → Analyse des Kerns → Test-Dokument + BFB1-Blob. */
export async function buildUpload(
  profileId: string | null,
  opts: { jumps?: number; seed?: number; mass?: number } = {},
): Promise<Upload> {
  const mass = opts.mass ?? 78;
  const base = { mass };
  const profiles = [standProfile(mass, 1.5)];
  for (let i = 0; i < (opts.jumps ?? 2); i++)
    profiles.push(...withRest(base, jumpTrial({ ...base, jumpHeight: 0.3 + 0.03 * i }), 0.1, 2));
  const { trace } = renderScript(profiles, { hz: 1000, seed: opts.seed ?? 1, athlete: { bodyMass: mass } });
  const analysis = analyzeRecording(trace, { mode: 'cmj', bodyMassKg: mass });
  const recordingId = randomUUID();
  const blob = await encodeBlob(trace, deflate);
  const test: TestInput = {
    id: randomUUID(),
    profileId,
    sessionId: null,
    testType: 'cmj',
    detectedType: null,
    bodyMassKg: mass,
    externalLoadKg: 0,
    samplingHz: 1000,
    deviceSerial: 'SIM-1',
    createdAt: new Date().toISOString(),
    tagIds: [],
    conditions: {},
    recordingId,
    zeroOffsets: { left: 14.2, right: -9.7 },
    notes: null,
    analysisVersion: ANALYSIS_VERSION,
    reps: analysis.reps.map((r, i) => ({
      id: randomUUID(),
      index: i,
      startIdx: r.startIdx,
      endIdx: r.endIdx,
      included: true,
      type: r.type,
      confidence: r.confidence,
      side: r.side,
      events: r.events,
      metrics: r.metrics,
      warnings: r.warnings as TestInput['reps'][number]['warnings'],
    })),
  };
  return { recordingId, blob, test };
}

/** Lädt Blob + Test hoch und liefert den Test zurück. */
export async function uploadAll(c: Client, u: Upload): Promise<void> {
  const r = await c.putBlob(
    `/api/recordings/${u.recordingId}${u.test.profileId ? `?profileId=${u.test.profileId}` : ''}`,
    u.blob,
  );
  if (r.statusCode !== 201 && r.statusCode !== 200) throw new Error(`recording: ${r.statusCode} ${r.body}`);
  const t = await c.put(`/api/tests/${u.test.id}`, u.test);
  if (t.statusCode !== 201 && t.statusCode !== 200) throw new Error(`test: ${t.statusCode} ${t.body}`);
}
