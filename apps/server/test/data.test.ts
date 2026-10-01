import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allMetrics } from '@buildr/core';
import type { SyncPullDTO } from '@buildr/shared';
import { auditLog, metricDefinitions } from '../src/db/schema.ts';
import {
  addUser,
  buildUpload,
  client,
  makeGroups,
  makeServer,
  profileBody,
  setupAdmin,
  uploadAll,
  type Client,
  type RefData,
  type TestServer,
} from './helpers.ts';

describe('Stammdaten, Profile, Sync', () => {
  let s: TestServer;
  let admin: Client;
  let ref: RefData;
  beforeAll(async () => {
    s = await makeServer();
    admin = await setupAdmin(s);
    ref = await makeGroups(admin);
  });
  afterAll(() => s.close());

  it('Metrik-Definitionen stammen aus der Registry des Kerns', async () => {
    const rows = await s.handle.db.select().from(metricDefinitions);
    expect(rows.length).toBe(allMetrics().length);
    const api = (await admin.get('/api/metrics')).json() as Array<{ key: string; unit: string }>;
    expect(api.find((m) => m.key === 'jump_height_impmom')).toMatchObject({ unit: 'cm' });
  });

  it('Profil PUT ist idempotent; älterer Stand überschreibt nie einen neueren (LWW)', async () => {
    const p = profileBody([ref.groupIds[0]!]);
    const r1 = await admin.put(`/api/profiles/${p.id}`, p);
    expect(r1.statusCode).toBe(201);
    const r2 = await admin.put(`/api/profiles/${p.id}`, p);
    expect(r2.statusCode).toBe(200);
    expect(r2.json().applied).toBe(true);

    const newer = {
      ...p,
      name: 'Neuer Name',
      updatedAt: new Date(Date.parse(p.updatedAt) + 5000).toISOString(),
    };
    expect((await admin.put(`/api/profiles/${p.id}`, newer)).json().applied).toBe(true);
    const stale = await admin.put(`/api/profiles/${p.id}`, { ...p, name: 'Alter Name' });
    expect(stale.json()).toMatchObject({ applied: false, profile: { name: 'Neuer Name' } });
    expect((await admin.get(`/api/profiles/${p.id}`)).json().name).toBe('Neuer Name');
  });

  it('Profilregeln serverseitig: ≥ 1 Gruppe, Foto/Video unter 18 nur mit Einwilligung, fremde Gruppe, externalId eindeutig', async () => {
    const noGroup = await admin.put(`/api/profiles/${randomUUID()}`, {
      ...profileBody([]),
      id: randomUUID(),
    });
    expect(noGroup.statusCode).toBe(400);

    const minorBody = profileBody([ref.groupIds[0]!], {
      dateOfBirth: `${new Date().getFullYear() - 12}-01-01`,
      allowPhotoVideo: true,
      guardianConsent: false,
    });
    const minor = await admin.put(`/api/profiles/${minorBody.id}`, minorBody);
    expect(minor.statusCode).toBe(422);
    expect(minor.json().issues[0].code).toBe('photo_video_minor');
    const minorOk = { ...minorBody, guardianConsent: true };
    expect((await admin.put(`/api/profiles/${minorOk.id}`, minorOk)).statusCode).toBe(201);

    const unknown = profileBody([randomUUID()]);
    expect((await admin.put(`/api/profiles/${unknown.id}`, unknown)).json().error).toBe('unknown_group');

    const a = profileBody([ref.groupIds[0]!], { externalId: 'EXT-1' });
    const b = profileBody([ref.groupIds[0]!], { externalId: 'EXT-1' });
    expect((await admin.put(`/api/profiles/${a.id}`, a)).statusCode).toBe(201);
    expect((await admin.put(`/api/profiles/${b.id}`, b)).json().error).toBe('external_id_taken');
  });

  it('Suche und Gruppenfilter', async () => {
    const x = profileBody([ref.groupIds[1]!], { name: 'Zora Suchbar' });
    await admin.put(`/api/profiles/${x.id}`, x);
    const byName = (await admin.get('/api/profiles?q=suchbar')).json() as Array<{ name: string }>;
    expect(byName.map((p) => p.name)).toEqual(['Zora Suchbar']);
    const byGroup = (await admin.get(`/api/profiles?groupId=${ref.groupIds[1]}`)).json() as Array<{
      name: string;
    }>;
    expect(byGroup.map((p) => p.name)).toContain('Zora Suchbar');
    // Platzhalterzeichen in der Suche werden nicht als Muster interpretiert
    expect((await admin.get('/api/profiles?q=%25')).json()).toEqual([]);
  });

  it('Sync-Pull: Vollabgleich, Delta, Löschungen (Tombstones)', async () => {
    const full = (await admin.get('/api/sync/pull?since=0')).json() as SyncPullDTO;
    expect(full.full).toBe(true);
    expect(full.profiles.length).toBeGreaterThanOrEqual(3);
    expect(full.groups.length).toBeGreaterThanOrEqual(3);
    expect(full.cursor).toBeGreaterThan(0);

    // nach dem Cursor passiert nichts → leeres Delta (nur das Sicherheitsfenster kann Altes liefern)
    const quiet = (await admin.get(`/api/sync/pull?since=${full.cursor + 1000}`)).json() as SyncPullDTO;
    expect(quiet.profiles).toEqual([]);

    const p = profileBody([ref.groupIds[0]!], { name: 'Delta Person' });
    await admin.put(`/api/profiles/${p.id}`, p);
    const delta = (await admin.get(`/api/sync/pull?since=${full.cursor}`)).json() as SyncPullDTO;
    expect(delta.full).toBe(false);
    expect(delta.profiles.map((x) => x.name)).toContain('Delta Person');

    const del = await admin.del(`/api/profiles/${p.id}`);
    expect(del.statusCode).toBe(204);
    const after = (await admin.get(`/api/sync/pull?since=${delta.cursor}`)).json() as SyncPullDTO;
    expect(after.deleted).toContainEqual({ entity: 'profile', id: p.id });
    expect(after.profiles.map((x) => x.id)).not.toContain(p.id);
  });

  it('Kategorie löschen entfernt Gruppen (mit Tombstones); Tags/Tag-Typen', async () => {
    const catId = randomUUID();
    const gId = randomUUID();
    await admin.put(`/api/reference/categories/${catId}`, { id: catId, name: 'Temp' });
    await admin.put(`/api/reference/groups/${gId}`, { id: gId, categoryId: catId, name: 'Temp-Gruppe' });
    const before = (await admin.get('/api/sync/pull?since=0')).json() as SyncPullDTO;
    expect((await admin.del(`/api/reference/categories/${catId}`)).statusCode).toBe(204);
    const after = (await admin.get(`/api/sync/pull?since=${before.cursor}`)).json() as SyncPullDTO;
    expect(after.deleted).toEqual(
      expect.arrayContaining([
        { entity: 'category', id: catId },
        { entity: 'group', id: gId },
      ]),
    );

    const ttId = randomUUID();
    const tagId = randomUUID();
    expect(
      (await admin.put(`/api/reference/tag-types/${ttId}`, { id: ttId, name: 'Phase' })).statusCode,
    ).toBe(200);
    expect(
      (await admin.put(`/api/reference/tags/${tagId}`, { id: tagId, tagTypeId: ttId, name: 'Vorsaison' }))
        .statusCode,
    ).toBe(200);
    expect(
      (await admin.put(`/api/reference/tags/${randomUUID()}`, { id: tagId, tagTypeId: ttId, name: 'x' }))
        .statusCode,
    ).toBe(400);
    const r = (await admin.get('/api/reference')).json();
    expect(r.tags).toContainEqual({ id: tagId, tagTypeId: ttId, name: 'Vorsaison' });
  });
});

describe('Aufnahmen und Tests', () => {
  let s: TestServer;
  let admin: Client;
  let ref: RefData;
  let profileId: string;
  beforeAll(async () => {
    s = await makeServer();
    admin = await setupAdmin(s);
    ref = await makeGroups(admin);
    const p = profileBody([ref.groupIds[0]!]);
    profileId = p.id;
    await admin.put(`/api/profiles/${p.id}`, p);
  });
  afterAll(() => s.close());

  it('Roh-Aufnahme: Upload idempotent, Integritätsprüfung, Abruf liefert dieselben Bytes', async () => {
    const u = await buildUpload(profileId, { jumps: 1 });
    const url = `/api/recordings/${u.recordingId}?profileId=${profileId}`;
    const r1 = await admin.putBlob(url, u.blob);
    expect(r1.statusCode).toBe(201);
    expect((await admin.putBlob(url, u.blob)).json()).toEqual({ status: 'unchanged' });
    const other = await buildUpload(profileId, { jumps: 1, seed: 9 });
    expect((await admin.putBlob(url, other.blob)).statusCode).toBe(409);
    const got = await admin.get(`/api/recordings/${u.recordingId}`);
    expect(got.statusCode).toBe(200);
    expect(Buffer.from(got.rawPayload).equals(Buffer.from(u.blob))).toBe(true);

    // manipuliert: ein Byte im Payload gekippt → CRC-Fehler
    const bad = u.blob.slice();
    bad[bad.length - 7]! ^= 0x55;
    const badId = randomUUID();
    const rb = await admin.putBlob(`/api/recordings/${badId}`, bad);
    expect(rb.statusCode).toBe(422);
    expect(rb.json().error).toBe('blob_invalid');
    // falscher Transfer-Hash
    const rc = await admin.putBlob(`/api/recordings/${randomUUID()}`, u.blob, {
      'x-content-sha256': 'ab'.repeat(32),
    });
    expect(rc.json().error).toBe('checksum_mismatch');
    // kein BFB1
    expect(
      (
        await admin.putBlob(
          `/api/recordings/${randomUUID()}`,
          new TextEncoder().encode('hello world, not a blob'),
        )
      ).statusCode,
    ).toBe(422);
    // JSON statt Octet-Stream
    expect((await admin.put(`/api/recordings/${randomUUID()}`, { a: 1 })).statusCode).toBe(415);
  });

  it('Test-Upload: Metriken landen normalisiert in der DB, Abruf == Upload; PUT idempotent, Änderung → 409', async () => {
    const u = await buildUpload(profileId, { jumps: 2 });
    await uploadAll(admin, u);
    const again = await admin.put(`/api/tests/${u.test.id}`, u.test);
    expect(again.statusCode).toBe(200);
    expect(again.json().status).toBe('unchanged');
    expect((await admin.put(`/api/tests/${u.test.id}`, { ...u.test, notes: 'geändert' })).json().error).toBe(
      'test_exists',
    );

    const got = (await admin.get(`/api/tests/${u.test.id}`)).json();
    expect(got.status).toBe('uploaded');
    expect(got.reps).toHaveLength(u.test.reps.length);
    for (const [i, rep] of u.test.reps.entries()) {
      const g = got.reps[i];
      expect(g.id).toBe(rep.id);
      for (const [k, v] of Object.entries(rep.metrics)) {
        if (v === null) expect(g.metrics[k]).toBeUndefined();
        else expect(g.metrics[k]).toBeCloseTo(v, 9);
      }
      expect(g.events).toEqual(rep.events);
    }
    const list = (await admin.get(`/api/tests?profileId=${profileId}&testType=cmj`)).json() as unknown[];
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect((await admin.get(`/api/tests?profileId=${profileId}&testType=sj`)).json()).toEqual([]);
  });

  it('Test-Upload verlangt vorhandene Aufnahme, bekannte Tags/Profile, plausible Rep-Bereiche', async () => {
    const u = await buildUpload(profileId, { jumps: 1 });
    expect((await admin.put(`/api/tests/${u.test.id}`, u.test)).json().error).toBe('recording_missing');
    await admin.putBlob(`/api/recordings/${u.recordingId}?profileId=${profileId}`, u.blob);
    expect(
      (await admin.put(`/api/tests/${u.test.id}`, { ...u.test, tagIds: [randomUUID()] })).json().error,
    ).toBe('unknown_tag');
    expect(
      (await admin.put(`/api/tests/${u.test.id}`, { ...u.test, profileId: randomUUID() })).statusCode,
    ).toBe(404);
    const huge = { ...u.test, reps: u.test.reps.map((r) => ({ ...r, endIdx: 99_999_999 })) };
    expect((await admin.put(`/api/tests/${u.test.id}`, huge)).json().error).toBe('rep_out_of_range');
    // anderer Athlet für dieselbe Aufnahme
    const other = profileBody([ref.groupIds[0]!]);
    await admin.put(`/api/profiles/${other.id}`, other);
    expect(
      (await admin.put(`/api/tests/${u.test.id}`, { ...u.test, profileId: other.id })).json().error,
    ).toBe('recording_profile_mismatch');
    // unbekannte Metriken werden gemeldet statt abgelehnt
    const withUnknown = {
      ...u.test,
      reps: u.test.reps.map((r) => ({ ...r, metrics: { ...r.metrics, zukunfts_metrik: 1 } })),
    };
    const ok = await admin.put(`/api/tests/${u.test.id}`, withUnknown);
    expect(ok.statusCode).toBe(201);
    expect(ok.json().ignoredMetrics).toEqual(['zukunfts_metrik']);
  });

  it('Mehrere Tests teilen sich eine Aufnahme; Löschen entfernt Blob erst mit dem letzten Test', async () => {
    const u = await buildUpload(profileId, { jumps: 1 });
    await uploadAll(admin, u);
    const second = {
      ...u.test,
      id: randomUUID(),
      reps: u.test.reps.map((r) => ({ ...r, id: randomUUID() })),
      testType: 'sj' as const,
    };
    expect((await admin.put(`/api/tests/${second.id}`, second)).statusCode).toBe(201);
    const key = `${(await admin.get('/api/auth/me')).json().organization.id}/${u.recordingId}.bfb`;
    expect(await s.blobs.exists(key)).toBe(true);
    expect((await admin.del(`/api/tests/${u.test.id}`)).statusCode).toBe(204);
    expect(await s.blobs.exists(key)).toBe(true);
    expect((await admin.del(`/api/tests/${second.id}`)).statusCode).toBe(204);
    expect(await s.blobs.exists(key)).toBe(false);
    expect((await admin.get(`/api/recordings/${u.recordingId}`)).statusCode).toBe(404);
  });

  it('PATCH: Notiz, Tags, Rep ausschließen; alles im Audit-Log, ohne Messwerte', async () => {
    const tagType = randomUUID();
    const tag = randomUUID();
    await admin.put(`/api/reference/tag-types/${tagType}`, { id: tagType, name: 'Phase' });
    await admin.put(`/api/reference/tags/${tag}`, { id: tag, tagTypeId: tagType, name: 'Saison' });
    const u = await buildUpload(profileId, { jumps: 2 });
    await uploadAll(admin, u);
    const res = await admin.patch(`/api/tests/${u.test.id}`, {
      notes: 'Boden nass',
      tagIds: [tag],
      reps: [{ id: u.test.reps[0]!.id, included: false }],
    });
    expect(res.statusCode).toBe(200);
    const t = res.json();
    expect(t.notes).toBe('Boden nass');
    expect(t.tagIds).toEqual([tag]);
    expect(t.reps[0].included).toBe(false);
    expect(t.reps[1].included).toBe(true);

    const audit = (await admin.get('/api/audit?limit=500')).json() as Array<{
      action: string;
      details: unknown;
    }>;
    const actions = audit.map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'auth.setup',
        'profile.create',
        'test.create',
        'test.update',
        'recording.upload',
      ]),
    );
    const raw = JSON.stringify(audit);
    expect(raw).not.toMatch(/jump_height|Boden nass/);
    const rows = await s.handle.db.select().from(auditLog);
    expect(rows.every((r) => JSON.stringify(r.details ?? {}).length < 400)).toBe(true);
  });

  it('DSGVO-Löschung eines Profils entfernt Tests, Messwerte und Roh-Aufnahmen', async () => {
    const p = profileBody([ref.groupIds[0]!], { name: 'Löschkandidat' });
    await admin.put(`/api/profiles/${p.id}`, p);
    const u1 = await buildUpload(p.id, { jumps: 1, seed: 21 });
    const u2 = await buildUpload(p.id, { jumps: 1, seed: 22 });
    await uploadAll(admin, u1);
    await uploadAll(admin, u2);
    const orgId = (await admin.get('/api/auth/me')).json().organization.id;
    const keys = [u1, u2].map((u) => `${orgId}/${u.recordingId}.bfb`);
    for (const k of keys) expect(await s.blobs.exists(k)).toBe(true);
    const metricsBefore = await s.handle.db.$count((await import('../src/db/schema.ts')).repMetrics);

    expect((await admin.del(`/api/profiles/${p.id}`)).statusCode).toBe(204);
    for (const k of keys) expect(await s.blobs.exists(k)).toBe(false);
    expect((await admin.get(`/api/tests/${u1.test.id}`)).statusCode).toBe(404);
    expect((await admin.get(`/api/profiles/${p.id}`)).statusCode).toBe(404);
    const metricsAfter = await s.handle.db.$count((await import('../src/db/schema.ts')).repMetrics);
    expect(metricsAfter).toBeLessThan(metricsBefore);
    const audit = (await admin.get('/api/audit')).json() as Array<{ action: string; entityId: string }>;
    expect(audit.some((a) => a.action === 'profile.delete' && a.entityId === p.id)).toBe(true);
  });
});

describe('Mandantentrennung', () => {
  it('Organisation B sieht und verändert nichts von Organisation A', async () => {
    const s = await makeServer();
    const a = await setupAdmin(s, 'a@org-a.test');
    const refA = await makeGroups(a);
    const p = profileBody([refA.groupIds[0]!]);
    await a.put(`/api/profiles/${p.id}`, p);
    const u = await buildUpload(p.id, { jumps: 1 });
    await uploadAll(a, u);

    // zweite Organisation direkt anlegen (CLI-Pfad)
    const { createOrganizationWithAdmin } = await import('../src/routes/auth.ts');
    await createOrganizationWithAdmin(
      { config: s.config, db: s.handle.db, blobs: s.blobs, dbKind: 'pglite' },
      { organization: 'Org B', name: 'B', email: 'b@org-b.test', password: 'passwort-b-1234' },
    );
    const login = await client(s).post('/api/auth/login', {
      email: 'b@org-b.test',
      password: 'passwort-b-1234',
    });
    const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const b = client(s, cookie);

    expect((await b.get('/api/profiles')).json()).toEqual([]);
    expect((await b.get(`/api/profiles/${p.id}`)).statusCode).toBe(404);
    expect((await b.get(`/api/tests/${u.test.id}`)).statusCode).toBe(404);
    expect((await b.get(`/api/recordings/${u.recordingId}`)).statusCode).toBe(404);
    expect((await b.del(`/api/profiles/${p.id}`)).statusCode).toBe(404);
    const groupsB = (await b.get('/api/reference')).json().groups as Array<{ id: string }>;
    const hijack = {
      ...p,
      groupIds: [groupsB[0]!.id],
      name: 'Hijack',
      updatedAt: new Date(Date.now() + 60_000).toISOString(),
    };
    expect((await b.put(`/api/profiles/${p.id}`, hijack)).statusCode).toBe(404);
    expect((await a.get(`/api/profiles/${p.id}`)).json().name).toBe('Test Athlet');
    expect((await b.get('/api/tests')).json()).toEqual([]);
    expect(((await b.get('/api/reference')).json().groups as unknown[]).length).toBe(1); // nur eigene Standardgruppe
    expect(((await b.get('/api/sync/pull?since=0')).json() as SyncPullDTO).profiles).toEqual([]);
    expect((await b.get('/api/users')).json().map((x: { email: string }) => x.email)).toEqual([
      'b@org-b.test',
    ]);
    expect(
      (
        await b.put(`/api/reference/groups/${refA.groupIds[0]}`, {
          id: refA.groupIds[0],
          categoryId: refA.categoryId,
          name: 'x',
        })
      ).statusCode,
    ).toBe(422);
    await s.close();
  });
});

describe('Gruppensitzungen', () => {
  it('Sitzung anlegen (idempotent, LWW), Tests mit sessionId, Filter, Berechtigungen, Löschen lässt Tests bestehen', async () => {
    const s = await makeServer();
    const admin = await setupAdmin(s);
    const ref = await makeGroups(admin);
    const mk = (name: string, groupIds: string[]) => profileBody(groupIds, { name });
    const [a, b] = [mk('Anna', [ref.groupIds[0]!]), mk('Ben', [ref.groupIds[1]!])];
    for (const p of [a, b]) await admin.put(`/api/profiles/${p.id}`, p);
    const now = new Date().toISOString();
    const body = {
      id: randomUUID(),
      name: 'Montagstest',
      mode: 'cmj',
      externalLoadKg: 0,
      groupId: ref.groupIds[0]!,
      status: 'active',
      queue: [
        { profileId: a.id, status: 'waiting' },
        { profileId: b.id, status: 'waiting' },
      ],
      board: { metric: 'jump_height_impmom', testType: 'cmj', aggregate: 'best' },
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    };
    expect((await admin.put(`/api/sessions/${body.id}`, body)).statusCode).toBe(201);
    expect((await admin.put(`/api/sessions/${body.id}`, body)).statusCode).toBe(200);
    // älterer Stand überschreibt nicht
    const stale = await admin.put(`/api/sessions/${body.id}`, {
      ...body,
      name: 'Alt',
      updatedAt: new Date(Date.parse(now) - 5000).toISOString(),
    });
    expect(stale.json()).toMatchObject({ applied: false, session: { name: 'Montagstest' } });
    // Statuswechsel + neuere Version
    const paused = { ...body, status: 'paused', updatedAt: new Date(Date.parse(now) + 1000).toISOString() };
    expect((await admin.put(`/api/sessions/${body.id}`, paused)).json().session.status).toBe('paused');
    // unbekannte Athleten/Gruppe
    const ghost = { ...body, id: randomUUID(), queue: [{ profileId: randomUUID(), status: 'waiting' }] };
    expect((await admin.put(`/api/sessions/${ghost.id}`, ghost)).json().error).toBe('unknown_profile');
    const noGroup = { ...body, id: randomUUID(), groupId: randomUUID() };
    expect((await admin.put(`/api/sessions/${noGroup.id}`, noGroup)).json().error).toBe('unknown_group');
    expect((await admin.put(`/api/sessions/${randomUUID()}`, body)).statusCode).toBe(400);

    // Tests der Sitzung
    const u = await buildUpload(a.id, { jumps: 1 });
    u.test.sessionId = body.id;
    await uploadAll(admin, u);
    const bad = await buildUpload(a.id, { jumps: 1, seed: 5 });
    bad.test.sessionId = randomUUID();
    await admin.putBlob(`/api/recordings/${bad.recordingId}?profileId=${a.id}`, bad.blob);
    expect((await admin.put(`/api/tests/${bad.test.id}`, bad.test)).json().error).toBe('unknown_session');
    const inSession = (await admin.get(`/api/tests?sessionId=${body.id}`)).json() as Array<{
      id: string;
      sessionId: string;
    }>;
    expect(inSession.map((t) => t.id)).toEqual([u.test.id]);
    expect(inSession[0]!.sessionId).toBe(body.id);

    // Liste; Rollen
    expect(((await admin.get('/api/sessions')).json() as unknown[]).length).toBe(1);
    const viewer = await addUser(s, admin, 'v@example.test', 'viewer');
    expect((await viewer.get(`/api/sessions/${body.id}`)).statusCode).toBe(200);
    expect((await viewer.put(`/api/sessions/${body.id}`, paused)).statusCode).toBe(403);
    const scoped = await addUser(s, admin, 's@example.test', 'tester', {
      groupScope: 'restricted',
      access: [{ groupId: ref.groupIds[0]!, access: 'write' }],
    });
    expect((await scoped.get(`/api/sessions/${body.id}`)).statusCode).toBe(404); // fremde Sitzung
    const own = { ...body, id: randomUUID(), queue: [{ profileId: a.id, status: 'waiting' }] };
    expect((await scoped.put(`/api/sessions/${own.id}`, own)).statusCode).toBe(201);
    const withB = { ...body, id: randomUUID() }; // enthält Ben (Gruppe ohne Rechte)
    expect((await scoped.put(`/api/sessions/${withB.id}`, withB)).json().error).toBe('profile_forbidden');

    // Löschen: Tests bleiben, session_id wird leer
    expect((await admin.del(`/api/sessions/${body.id}`)).statusCode).toBe(204);
    expect((await admin.get(`/api/tests/${u.test.id}`)).json().sessionId).toBeNull();
    await s.close();
  });
});

describe('Normsets und Berichte', () => {
  it('Normset anlegen/ersetzen/löschen (nur Admin), Validierung, Mandantentrennung; Tests nach Gruppen filtern', async () => {
    const s = await makeServer();
    const admin = await setupAdmin(s);
    const tester = await addUser(s, admin, 't@example.test', 'tester');
    const row = {
      testType: 'cmj',
      metric: 'jump_height_impmom',
      sex: 'f',
      ageMin: 18,
      ageMax: 25,
      sport: null,
      n: 100,
      mean: 30,
      sd: 4,
      pct: { 10: 25, 50: 30, 90: 35 },
    };
    const id = randomUUID();
    const body = { id, name: 'Eigene Norm', description: 'Testdaten', rows: [row] };
    expect((await tester.put(`/api/norms/${id}`, body)).statusCode).toBe(403);
    expect((await admin.put(`/api/norms/${id}`, body)).statusCode).toBe(201);
    expect(
      (await admin.put(`/api/norms/${id}`, { ...body, rows: [row, { ...row, sex: 'm', mean: 35 }] })).json(),
    ).toMatchObject({ rowCount: 2 });
    const got = (await tester.get(`/api/norms/${id}`)).json();
    expect(got.rows).toHaveLength(2);
    expect(got.rows[0]).toMatchObject({
      testType: 'cmj',
      sex: 'f',
      mean: 30,
      sd: 4,
      pct: { 10: 25, 50: 30, 90: 35 },
    });
    expect((await tester.get('/api/norms')).json()).toMatchObject([{ id, name: 'Eigene Norm', rowCount: 2 }]);
    // Validierung
    expect(
      (await admin.put(`/api/norms/${id}`, { ...body, rows: [{ ...row, metric: 'gibt_es_nicht' }] })).json()
        .error,
    ).toBe('unknown_metric');
    expect(
      (await admin.put(`/api/norms/${id}`, { ...body, rows: [{ ...row, ageMin: 30, ageMax: 20 }] })).json()
        .error,
    ).toBe('age_range');
    expect((await admin.put(`/api/norms/${id}`, { ...body, rows: [{ ...row, sd: 0 }] })).statusCode).toBe(
      400,
    );
    expect((await admin.put(`/api/norms/${id}`, { ...body, rows: [] })).statusCode).toBe(400);
    // fremde Organisation
    const { createOrganizationWithAdmin } = await import('../src/routes/auth.ts');
    await createOrganizationWithAdmin(
      { config: s.config, db: s.handle.db, blobs: s.blobs, dbKind: 'pglite' },
      { organization: 'B', name: 'B', email: 'b@org-b.test', password: 'passwort-b-1234' },
    );
    const lb = await client(s).post('/api/auth/login', {
      email: 'b@org-b.test',
      password: 'passwort-b-1234',
    });
    const other = client(s, lb.cookies.map((c) => `${c.name}=${c.value}`).join('; '));
    expect((await other.get('/api/norms')).json()).toEqual([]);
    expect((await other.get(`/api/norms/${id}`)).statusCode).toBe(404);
    expect((await other.del(`/api/norms/${id}`)).statusCode).toBe(404);
    expect((await admin.del(`/api/norms/${id}`)).statusCode).toBe(204);
    expect((await admin.get(`/api/norms/${id}`)).statusCode).toBe(404);

    // Tests nach Gruppen filtern
    const ref = await makeGroups(admin);
    const a = profileBody([ref.groupIds[0]!], { name: 'Anna' });
    const b = profileBody([ref.groupIds[1]!], { name: 'Ben' });
    for (const p of [a, b]) await admin.put(`/api/profiles/${p.id}`, p);
    const ua = await buildUpload(a.id, { jumps: 1, seed: 1 });
    const ub = await buildUpload(b.id, { jumps: 1, seed: 2 });
    await uploadAll(admin, ua);
    await uploadAll(admin, ub);
    const byGroup = async (g: string) =>
      ((await admin.get(`/api/tests?groupIds=${g}&withReps=0`)).json() as Array<{ id: string }>).map(
        (t) => t.id,
      );
    expect(await byGroup(ref.groupIds[0]!)).toEqual([ua.test.id]);
    expect((await byGroup(`${ref.groupIds[0]},${ref.groupIds[1]}`)).sort()).toEqual(
      [ua.test.id, ub.test.id].sort(),
    );
    expect((await admin.get('/api/tests?groupIds=nicht-uuid')).statusCode).toBe(400);
    await s.close();
  });
});
