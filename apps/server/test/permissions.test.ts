import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allowedGroupIds, can, canAccessGroups, type Principal } from '../src/auth/permissions.ts';
import { FileBlobStore } from '../src/storage/blobStore.ts';
import {
  buildUpload,
  addUser,
  makeGroups,
  makeServer,
  profileBody,
  setupAdmin,
  uploadAll,
  type Client,
  type RefData,
  type TestServer,
} from './helpers.ts';

const principal = (over: Partial<Principal>): Principal => ({
  id: 'u',
  orgId: 'o',
  email: 'e',
  name: 'n',
  role: 'tester',
  groupScope: 'all',
  access: new Map(),
  ...over,
});

describe('Rechte-Matrix (rein)', () => {
  it('Rollen', () => {
    expect(can({ role: 'admin' }, 'user.manage')).toBe(true);
    expect(can({ role: 'tester' }, 'user.manage')).toBe(false);
    expect(can({ role: 'tester' }, 'test.write')).toBe(true);
    expect(can({ role: 'tester' }, 'profile.delete')).toBe(false);
    expect(can({ role: 'viewer' }, 'test.write')).toBe(false);
    expect(can({ role: 'viewer' }, 'profile.write')).toBe(false);
    expect(can({ role: 'viewer' }, 'test.read')).toBe(true);
  });
  it('Gruppen-Scoping', () => {
    const all = principal({});
    expect(canAccessGroups(all, ['g1'], 'write')).toBe(true);
    expect(allowedGroupIds(all, 'read')).toBeNull();
    const r = principal({
      groupScope: 'restricted',
      access: new Map([
        ['g1', 'read'],
        ['g2', 'write'],
      ]),
    });
    expect(canAccessGroups(r, ['g1'], 'read')).toBe(true);
    expect(canAccessGroups(r, ['g1'], 'write')).toBe(false);
    expect(canAccessGroups(r, ['g1', 'g2'], 'write')).toBe(true);
    expect(canAccessGroups(r, ['g3'], 'read')).toBe(false);
    expect(allowedGroupIds(r, 'write')).toEqual(['g2']);
    expect(allowedGroupIds(r, 'read')?.sort()).toEqual(['g1', 'g2']);
  });
});

describe('Rollen und Gruppen-Scoping über die API', () => {
  let s: TestServer;
  let admin: Client;
  let ref: RefData;
  let tester: Client;
  let viewer: Client;
  let scoped: Client;
  let profileA: string; // Gruppe 0
  let profileB: string; // Gruppe 1
  let testA: string;
  let testB: string;
  beforeAll(async () => {
    s = await makeServer();
    admin = await setupAdmin(s);
    ref = await makeGroups(admin);
    tester = await addUser(s, admin, 'tester@example.test', 'tester');
    viewer = await addUser(s, admin, 'viewer@example.test', 'viewer');
    // eingeschränkter Tester: Gruppe 0 schreiben, Gruppe 1 nur lesen
    scoped = await addUser(s, admin, 'scoped@example.test', 'tester', {
      groupScope: 'restricted',
      access: [{ groupId: ref.groupIds[0]!, access: 'write' }],
    });
    const a = profileBody([ref.groupIds[0]!], { name: 'Anna A' });
    const b = profileBody([ref.groupIds[1]!], { name: 'Ben B' });
    profileA = a.id;
    profileB = b.id;
    await admin.put(`/api/profiles/${a.id}`, a);
    await admin.put(`/api/profiles/${b.id}`, b);
    const u = await buildUpload(a.id, { jumps: 1 });
    testA = u.test.id;
    await uploadAll(admin, u);
    const ub = await buildUpload(b.id, { jumps: 1, seed: 5 });
    testB = ub.test.id;
    await uploadAll(admin, ub);
  });
  afterAll(() => s.close());

  it('Viewer darf lesen, aber nichts schreiben oder löschen', async () => {
    expect((await viewer.get('/api/profiles')).json()).toHaveLength(2);
    expect((await viewer.get(`/api/tests/${testA}`)).statusCode).toBe(200);
    const p = profileBody([ref.groupIds[0]!]);
    expect((await viewer.put(`/api/profiles/${p.id}`, p)).statusCode).toBe(403);
    expect((await viewer.patch(`/api/tests/${testA}`, { notes: 'x' })).statusCode).toBe(403);
    expect((await viewer.del(`/api/tests/${testA}`)).statusCode).toBe(403);
    const u = await buildUpload(profileA, { jumps: 1 });
    expect((await viewer.putBlob(`/api/recordings/${u.recordingId}`, u.blob)).statusCode).toBe(403);
    expect((await viewer.get('/api/audit')).statusCode).toBe(403);
    expect((await viewer.get('/api/users')).statusCode).toBe(403);
  });

  it('Tester: Profile/Tests schreiben ja; Nutzer verwalten, Profil löschen, Test löschen, Gruppen ändern nein; Tags ja', async () => {
    const p = profileBody([ref.groupIds[0]!], { name: 'Tester-Profil' });
    expect((await tester.put(`/api/profiles/${p.id}`, p)).statusCode).toBe(201);
    expect((await tester.del(`/api/profiles/${p.id}`)).statusCode).toBe(403);
    expect((await tester.del(`/api/tests/${testA}`)).statusCode).toBe(403);
    expect((await tester.get('/api/users')).statusCode).toBe(403);
    const cat = randomUUID();
    expect((await tester.put(`/api/reference/categories/${cat}`, { id: cat, name: 'x' })).statusCode).toBe(
      403,
    );
    const tt = randomUUID();
    expect((await tester.put(`/api/reference/tag-types/${tt}`, { id: tt, name: 'Phase' })).statusCode).toBe(
      200,
    );
    const u = await buildUpload(p.id, { jumps: 1 });
    await uploadAll(tester, u);
  });

  it('Eingeschränkter Nutzer sieht nur seine Gruppen (Profile, Tests, Referenzdaten, Sync)', async () => {
    const names = ((await scoped.get('/api/profiles')).json() as Array<{ name: string }>).map((p) => p.name);
    expect(names).toContain('Anna A');
    expect(names).not.toContain('Ben B');
    expect((await scoped.get(`/api/profiles/${profileB}`)).statusCode).toBe(404);
    expect((await scoped.get(`/api/tests/${testA}`)).statusCode).toBe(200);
    const tests = (await scoped.get('/api/tests')).json() as Array<{ id: string; profileId: string }>;
    expect(tests.map((t) => t.id)).toContain(testA);
    expect(tests.map((t) => t.id)).not.toContain(testB);
    expect((await scoped.get(`/api/tests/${testB}`)).statusCode).toBe(404);
    expect((await admin.get(`/api/tests/${testB}`)).statusCode).toBe(200);
    const ref2 = (await scoped.get('/api/reference')).json();
    expect(ref2.groups.map((g: { id: string }) => g.id)).toEqual([ref.groupIds[0]]);
    const pull = (await scoped.get('/api/sync/pull?since=0')).json();
    const pulled = pull.profiles.map((p: { id: string }) => p.id);
    expect(pulled).toContain(profileA);
    expect(pulled).not.toContain(profileB);
    expect(pull.groups.map((g: { id: string }) => g.id)).toEqual([ref.groupIds[0]]);
  });

  it('Eingeschränkter Nutzer: Schreiben nur in Schreibgruppen; fremde Gruppen bleiben unangetastet', async () => {
    const ok = profileBody([ref.groupIds[0]!], { name: 'Scoped neu' });
    expect((await scoped.put(`/api/profiles/${ok.id}`, ok)).statusCode).toBe(201);
    const bad = profileBody([ref.groupIds[1]!], { name: 'Scoped fremd' });
    expect((await scoped.put(`/api/profiles/${bad.id}`, bad)).statusCode).toBe(403);
    // fremdes Profil überschreiben/löschen/Tests hochladen → 404
    const hij = {
      ...profileBody([ref.groupIds[0]!]),
      id: profileB,
      name: 'Hijack',
      updatedAt: new Date(Date.now() + 60_000).toISOString(),
    };
    expect((await scoped.put(`/api/profiles/${profileB}`, hij)).statusCode).toBe(404);
    const u = await buildUpload(profileB, { jumps: 1 });
    expect(
      (await scoped.putBlob(`/api/recordings/${u.recordingId}?profileId=${profileB}`, u.blob)).statusCode,
    ).toBe(404);
    // Profil in Gruppe 0 + 1 (von Admin): der eingeschränkte Nutzer darf Gruppe 1 weder entfernen noch hinzufügen
    const both = profileBody([ref.groupIds[0]!, ref.groupIds[1]!], { name: 'Beide' });
    await admin.put(`/api/profiles/${both.id}`, both);
    const edited = {
      ...both,
      name: 'Beide (geändert)',
      groupIds: [ref.groupIds[0]!],
      updatedAt: new Date(Date.now() + 5_000).toISOString(),
    };
    const r = await scoped.put(`/api/profiles/${both.id}`, edited);
    expect(r.statusCode).toBe(200);
    expect(((await admin.get(`/api/profiles/${both.id}`)).json().groupIds as string[]).sort()).toEqual(
      [ref.groupIds[0]!, ref.groupIds[1]!].sort(),
    );
  });

  it('Letzter Admin kann nicht deaktiviert oder herabgestuft werden; Rollenwechsel beendet Sitzungen', async () => {
    const me = (await admin.get('/api/auth/me')).json();
    expect((await admin.patch(`/api/users/${me.id}`, { role: 'viewer' })).json().error).toBe('last_admin');
    expect((await admin.patch(`/api/users/${me.id}`, { active: false })).json().error).toBe('last_admin');
    const t = (await tester.get('/api/auth/me')).json();
    expect((await admin.patch(`/api/users/${t.id}`, { role: 'viewer' })).statusCode).toBe(200);
    expect((await tester.get('/api/auth/me')).statusCode).toBe(401);
  });
});

describe('Dateispeicher', () => {
  it('Schlüssel dürfen den Wurzelordner nicht verlassen', async () => {
    const store = new FileBlobStore(`${process.cwd()}/.data-test/blobs-${randomUUID()}`);
    await store.put('org/a.bfb', new Uint8Array([1, 2, 3]));
    expect(Array.from((await store.get('org/a.bfb'))!)).toEqual([1, 2, 3]);
    expect(await store.exists('org/b.bfb')).toBe(false);
    await expect(store.put('../escape.bin', new Uint8Array([1]))).rejects.toThrow(/invalid blob key/);
    await expect(store.get('org/../../etc/passwd')).rejects.toThrow(/invalid blob key/);
    await store.delete('org/a.bfb');
    expect(await store.get('org/a.bfb')).toBeNull();
  });
});
