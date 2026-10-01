// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { analyzeRecording } from '@buildr/core';
import type { ProfileDTO } from '@buildr/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApi, NetworkError } from '../src/api/client.ts';
import { BROWSER_CODEC } from '../src/sync/blob.ts';
import { SyncEngine } from '../src/sync/engine.ts';
import { resetDbForTests } from '../src/offline/db.ts';
import { localRepo } from '../src/offline/repo.ts';
import { createTagOffline } from '../src/hub/services.ts';
import { useAuth } from '../src/state/auth.ts';
import { useWorkflow } from '../src/state/workflow.ts';
import { createServer, type Server } from '../../server/src/server.ts';
import { MemoryBlobStore } from '../../server/src/storage/blobStore.ts';
import { makeRecording } from './fixtures.ts';

/**
 * End-to-End ohne Browser: echter Fastify-Server (PGlite im Speicher) hinter einem `fetch`-Shim, echte IndexedDB (fake-indexeddb),
 * echte Sync-Engine. Prüft Offline → Wiederverbinden → Upload, Idempotenz bei verlorener Antwort, Backoff und Fehlerklassen.
 */
interface Net {
  online: boolean;
  /** Anfragen, die der Server noch verarbeitet, deren Antwort aber verloren geht */
  dropResponseFor: RegExp | null;
  /** erzwungene Antwort-Codes (einmalig je Eintrag) */
  failWith: Array<{ re: RegExp; status: number }>;
  log: string[];
}

function makeFetch(server: Server, net: Net, jar: { cookie: string }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    net.log.push(`${method} ${url}`);
    if (!net.online) throw new TypeError('fetch failed');
    const forced = net.failWith.findIndex((f) => f.re.test(`${method} ${url}`));
    if (forced >= 0) {
      const f = net.failWith.splice(forced, 1)[0]!;
      return new Response(JSON.stringify({ error: 'forced' }), {
        status: f.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    if (jar.cookie) headers['cookie'] = jar.cookie;
    const body = init?.body;
    const res = await server.app.inject({
      method: method as 'GET',
      url,
      headers,
      payload:
        body === undefined || body === null
          ? undefined
          : typeof body === 'string'
            ? body
            : Buffer.from(body as Uint8Array),
    });
    const sc = res.cookies.find((c) => c.name === 'bf_session');
    if (sc) jar.cookie = `${sc.name}=${sc.value}`;
    if (net.dropResponseFor?.test(`${method} ${url}`)) throw new TypeError('connection reset');
    return new Response([204, 304].includes(res.statusCode) ? null : new Uint8Array(res.rawPayload), {
      status: res.statusCode,
      headers: res.headers as Record<string, string>,
    });
  }) as typeof fetch;
}

describe('Sync-Engine gegen echten Server', () => {
  let server: Server;
  const jar = { cookie: '' };
  const net: Net = { online: true, dropResponseFor: null, failWith: [], log: [] };
  let api: ReturnType<typeof createApi>;
  let engine: SyncEngine;
  let clock = 1_000_000;
  let groupId: string;

  const profile = (name: string): ProfileDTO => {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      name,
      dateOfBirth: null,
      sex: null,
      heightCm: null,
      weightKg: null,
      sport: null,
      email: null,
      notes: null,
      externalId: null,
      allowPhotoVideo: false,
      guardianConsent: false,
      healthConsentAt: now,
      groupIds: [groupId],
      createdAt: now,
      updatedAt: now,
    };
  };

  /** Zeichnet lokal einen Test auf (wie der Workflow) → Outbox. */
  const saveLocalTest = async (p: ProfileDTO | null, opts: { cmj?: number } = {}) => {
    const { recording, analysis } = makeRecording({
      cmj: opts.cmj ?? 2,
      seed: Math.floor(Math.random() * 1e6),
    });
    const wf = useWorkflow.getState();
    wf.resetAll();
    if (p) wf.setProfile(p);
    wf.finishRecording(recording, analysis);
    const saved = await wf.save();
    expect(saved.length).toBeGreaterThan(0);
    return saved;
  };

  /** wie saveLocalTest, aber behält die im Workflow gewählten Tags */
  const saveLocalTestKeepTags = async (p: ProfileDTO) => {
    const { recording, analysis } = makeRecording({ cmj: 1, seed: 77 });
    const wf = useWorkflow.getState();
    const tags = wf.tagIds;
    wf.setProfile(p);
    wf.finishRecording(recording, analysis);
    for (const t of tags) if (!useWorkflow.getState().tagIds.includes(t)) wf.toggleTag(t);
    return wf.save();
  };

  beforeAll(async () => {
    server = await createServer(
      { NODE_ENV: 'test', SCRYPT_LOG_N: '10', DATA_DIR: '.data-test' },
      { memory: true, blobs: new MemoryBlobStore() },
    );
    api = createApi({ fetch: makeFetch(server, net, jar) });
    await api.post('/api/auth/setup', {
      organization: 'Sync Org',
      name: 'Admin',
      email: 'a@sync.test',
      password: 'passwort-12345',
    });
  });
  afterAll(() => server.close());

  beforeEach(async () => {
    await resetDbForTests();
    net.online = true;
    net.dropResponseFor = null;
    net.failWith = [];
    net.log = [];
    clock += 10 * 60_000;
    engine = new SyncEngine({ api, repo: localRepo, codec: BROWSER_CODEC, now: () => clock });
  });

  it('Erster Abgleich: Stammdaten (Gruppen) kommen vom Server', async () => {
    const s = await engine.run();
    expect(s.lastSyncAt).not.toBeNull();
    expect(s.offline).toBe(false);
    const groups = await localRepo.groups.list();
    expect(groups.map((g) => g.name)).toContain('Alle Athleten');
    groupId = groups[0]!.id;
    expect(await localRepo.kv.get<number>('syncCursor')).toBeGreaterThan(0);
  });

  it('Offline aufnehmen → Warteschlange → nach Wiederverbinden Upload (Profil, Aufnahme, Tests)', async () => {
    await engine.run();
    groupId = (await localRepo.groups.list())[0]!.id;
    const p = profile('Offline Olga');
    await localRepo.profiles.put(p);
    await localRepo.outbox.add('profile', p.id);
    const saved = await saveLocalTest(p, { cmj: 2 });

    net.online = false;
    const off = await engine.run();
    expect(off.offline).toBe(true);
    expect(off.pending).toBe(1 + saved.length); // Profil + Test(s)
    expect((await localRepo.tests.get(saved[0]!.id))!.status).toBe('queued');
    expect((await api.get<ProfileDTO[]>('/api/profiles').catch(() => 'offline')) satisfies unknown).toBe(
      'offline',
    );

    net.online = true;
    const on = await engine.run();
    expect(on).toMatchObject({ offline: false, pending: 0, failed: 0, authRequired: false });
    expect((await localRepo.tests.get(saved[0]!.id))!.status).toBe('uploaded');
    // auf dem Server angekommen
    const srvTests = await api.get<Array<{ id: string; reps: unknown[] }>>(`/api/tests?profileId=${p.id}`);
    expect(srvTests.map((t) => t.id).sort()).toEqual(saved.map((t) => t.id).sort());
    expect((await api.get<ProfileDTO>(`/api/profiles/${p.id}`)).name).toBe('Offline Olga');
    const rec = await api.getBlob(`/api/recordings/${saved[0]!.recordingId}`);
    expect(rec.length).toBeGreaterThan(1000);
    expect(await localRepo.outbox.count()).toBe(0);
  });

  it('Verlorene Antwort: der Server hat gespeichert, der Client wiederholt → idempotent, keine Dubletten', async () => {
    await engine.run();
    groupId = (await localRepo.groups.list())[0]!.id;
    const p = profile('Retry Rita');
    await localRepo.profiles.put(p);
    await localRepo.outbox.add('profile', p.id);
    const saved = await saveLocalTest(p, { cmj: 1 });
    net.dropResponseFor = /PUT \/api\/tests\//;
    const first = await engine.run();
    expect(first.offline).toBe(true);
    expect((await localRepo.tests.get(saved[0]!.id))!.status).toBe('queued');
    // serverseitig ist der Test bereits da
    expect((await api.get<unknown[]>(`/api/tests?profileId=${p.id}`)).length).toBe(saved.length);
    net.dropResponseFor = null;
    const second = await engine.run();
    expect(second.pending).toBe(0);
    expect((await localRepo.tests.get(saved[0]!.id))!.status).toBe('uploaded');
    expect((await api.get<unknown[]>(`/api/tests?profileId=${p.id}`)).length).toBe(saved.length);
  });

  it('5xx/429: Backoff statt Verwerfen; später erfolgreich', async () => {
    await engine.run();
    groupId = (await localRepo.groups.list())[0]!.id;
    const p = profile('Backoff Bea');
    await localRepo.profiles.put(p);
    await localRepo.outbox.add('profile', p.id);
    await engine.run();
    const saved = await saveLocalTest(p, { cmj: 1 });
    net.failWith = [{ re: /PUT \/api\/tests\//, status: 503 }];
    const s1 = await engine.run();
    expect(s1.pending).toBe(saved.length);
    expect(s1.failed).toBe(0);
    const item = (await localRepo.outbox.list())[0]!;
    expect(item.attempts).toBe(1);
    expect(item.nextAttemptAt).toBeGreaterThan(clock);
    // sofortiger Wiederholungsversuch wird übersprungen (Backoff)
    net.log = [];
    await engine.run();
    expect(net.log.some((l) => l.startsWith('PUT /api/tests/'))).toBe(false);
    clock += 60_000;
    const s2 = await engine.run();
    expect(s2.pending).toBe(0);
  });

  it('Dauerhafter Fehler (4xx): als fehlgeschlagen markiert, nach Behebung per „Erneut versuchen“ gesendet', async () => {
    await engine.run();
    groupId = (await localRepo.groups.list())[0]!.id;
    // Test für ein Profil, das es serverseitig nicht gibt (nie hochgeladen) → 404
    const ghost = profile('Ghost Gina');
    await localRepo.profiles.put(ghost); // ohne Outbox-Eintrag
    const saved = await saveLocalTest(ghost, { cmj: 1 });
    const s = await engine.run();
    expect(s.failed).toBe(saved.length);
    expect((await localRepo.tests.get(saved[0]!.id))!.status).toBe('failed');
    expect((await localRepo.outbox.list())[0]!.lastError).toBe('not_found');
    // Behebung: Profil nachreichen
    await localRepo.outbox.add('profile', ghost.id);
    await engine.retryFailed();
    expect(engine.state).toMatchObject({ pending: 0, failed: 0 });
    expect((await localRepo.tests.get(saved[0]!.id))!.status).toBe('uploaded');
  });

  it('Sitzung abgelaufen (401): Warteschlange bleibt, authRequired wird gesetzt', async () => {
    await engine.run();
    groupId = (await localRepo.groups.list())[0]!.id;
    const p = profile('Session Sara');
    await localRepo.profiles.put(p);
    await localRepo.outbox.add('profile', p.id);
    const old = jar.cookie;
    jar.cookie = 'bf_session=ungueltig';
    const s = await engine.run();
    expect(s.authRequired).toBe(true);
    expect(s.pending).toBe(1);
    jar.cookie = old;
    expect((await engine.run()).pending).toBe(0);
  });

  it('Pull: fremde Änderungen/Löschungen kommen an, offene lokale Änderungen werden nicht überschrieben', async () => {
    await engine.run();
    groupId = (await localRepo.groups.list())[0]!.id;
    const a = profile('Anna Pull');
    const b = profile('Bernd Pull');
    for (const p of [a, b]) {
      await localRepo.profiles.put(p);
      await localRepo.outbox.add('profile', p.id);
    }
    await engine.run();
    // anderer Client ändert Anna und löscht Bernd
    await api.put(`/api/profiles/${a.id}`, {
      ...a,
      name: 'Anna Geändert',
      updatedAt: new Date(Date.now() + 5000).toISOString(),
    });
    await api.del(`/api/profiles/${b.id}`);
    // lokal gibt es eine offene Änderung an Anna, die älter ist → Server gewinnt (LWW), lokaler Stand wird ersetzt
    await localRepo.profiles.put({
      ...a,
      name: 'Anna Lokal',
      updatedAt: new Date(Date.now() - 5000).toISOString(),
    });
    await localRepo.outbox.add('profile', a.id);
    await engine.run();
    expect((await localRepo.profiles.get(a.id))!.name).toBe('Anna Geändert');
    expect(await localRepo.profiles.get(b.id)).toBeUndefined();
    expect(await localRepo.outbox.count()).toBe(0);
  });

  it('wipeCaches (Abmelden): hochgeladene Daten verschwinden lokal, Ungesendetes bleibt', async () => {
    await engine.run();
    groupId = (await localRepo.groups.list())[0]!.id;
    const p = profile('Wipe Willi');
    await localRepo.profiles.put(p);
    await localRepo.outbox.add('profile', p.id);
    const sent = await saveLocalTest(p, { cmj: 1 });
    await engine.run();
    expect((await localRepo.tests.get(sent[0]!.id))!.status).toBe('uploaded');
    net.online = false;
    const unsent = await saveLocalTest(p, { cmj: 1 });
    await localRepo.wipeCaches();
    expect(await localRepo.tests.get(sent[0]!.id)).toBeUndefined();
    expect(await localRepo.recordings.get(sent[0]!.recordingId)).toBeUndefined();
    expect(await localRepo.tests.get(unsent[0]!.id)).toBeDefined();
    expect(await localRepo.recordings.get(unsent[0]!.recordingId)).toBeDefined();
    expect(await localRepo.groups.list()).toEqual([]);
    expect(await localRepo.kv.get('syncCursor')).toBeUndefined();
  });

  it('Offline angelegte Tags: Typ + Tag landen auf dem Server, Tests mit Tags werden danach akzeptiert', async () => {
    useAuth.setState({ status: 'authenticated' });
    await engine.run();
    groupId = (await localRepo.groups.list())[0]!.id;
    const p = profile('Tag Tina');
    await localRepo.profiles.put(p);
    await localRepo.outbox.add('profile', p.id);
    const tag = (await createTagOffline('Phase', 'Vorsaison'))!;
    useWorkflow.getState().resetAll();
    useWorkflow.getState().toggleTag(tag.id);
    net.online = false;
    const saved = await saveLocalTestKeepTags(p);
    // lokale Tags überleben einen Vollabgleich, solange sie nicht hochgeladen sind
    net.online = true;
    await localRepo.kv.set('syncCursor', 0);
    expect((await engine.run()).pending).toBe(0);
    const ref = await api.get<{ tags: Array<{ id: string }>; tagTypes: Array<{ name: string }> }>(
      '/api/reference',
    );
    expect(ref.tags.map((t) => t.id)).toContain(tag.id);
    expect(ref.tagTypes.map((t) => t.name)).toContain('Phase');
    const srv = await api.get<Array<{ tagIds: string[] }>>(`/api/tests?profileId=${p.id}`);
    expect(srv[0]!.tagIds).toEqual([tag.id]);
    expect(saved.length).toBeGreaterThan(0);
  });

  it('Netzwerkfehler werden als NetworkError gemeldet', async () => {
    net.online = false;
    await expect(api.get('/api/health')).rejects.toBeInstanceOf(NetworkError);
    void analyzeRecording;
  });
});
