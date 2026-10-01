import type {
  CategoryDTO,
  GroupDTO,
  ProfileDTO,
  RecordingRecord,
  SessionDTO,
  TagDTO,
  TagTypeDTO,
  TestRecord,
} from '@buildr/shared';
import { getDb, type OutboxItem, type OutboxKind } from './db.ts';
import { repoEvents } from './events.ts';

type SimpleStoreName = 'categories' | 'groups' | 'tagTypes' | 'tags';

/** Einfacher Speicher für Stammdaten mit `id`-Schlüssel. */
function simpleStore<T extends { id: string }>(name: SimpleStoreName) {
  return {
    async list(): Promise<T[]> {
      return (await (await getDb()).getAll(name)) as unknown as T[];
    },
    async get(id: string): Promise<T | undefined> {
      return (await (await getDb()).get(name, id)) as unknown as T | undefined;
    },
    async put(v: T): Promise<void> {
      await (await getDb()).put(name, v as never);
      repoEvents.bump();
    },
    async remove(id: string): Promise<void> {
      await (await getDb()).delete(name, id);
      repoEvents.bump();
    },
    async replaceAll(list: T[]): Promise<void> {
      const tx = (await getDb()).transaction(name, 'readwrite');
      await tx.store.clear();
      for (const v of list) await tx.store.put(v as never);
      await tx.done;
      repoEvents.bump();
    },
  };
}

/** Lokale Datenschicht (IndexedDB). Die Sync-Schicht (M5) spiegelt sie mit dem Server. */
export const localRepo = {
  profiles: {
    async list(): Promise<ProfileDTO[]> {
      return (await getDb()).getAll('profiles');
    },
    async get(id: string): Promise<ProfileDTO | undefined> {
      return (await getDb()).get('profiles', id);
    },
    async put(p: ProfileDTO): Promise<void> {
      await (await getDb()).put('profiles', p);
      repoEvents.bump();
    },
    async remove(id: string): Promise<void> {
      await (await getDb()).delete('profiles', id);
      repoEvents.bump();
    },
    async replaceAll(list: ProfileDTO[]): Promise<void> {
      const db = await getDb();
      const tx = db.transaction('profiles', 'readwrite');
      await tx.store.clear();
      for (const p of list) await tx.store.put(p);
      await tx.done;
      repoEvents.bump();
    },
  },
  categories: simpleStore<CategoryDTO>('categories'),
  groups: simpleStore<GroupDTO>('groups'),
  tagTypes: simpleStore<TagTypeDTO>('tagTypes'),
  tags: simpleStore<TagDTO>('tags'),
  tests: {
    async list(): Promise<TestRecord[]> {
      const all = await (await getDb()).getAll('tests');
      return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async byProfile(profileId: string): Promise<TestRecord[]> {
      const all = await (await getDb()).getAllFromIndex('tests', 'byProfile', profileId);
      return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async get(id: string): Promise<TestRecord | undefined> {
      return (await getDb()).get('tests', id);
    },
    async put(t: TestRecord): Promise<void> {
      await (await getDb()).put('tests', t);
      repoEvents.bump();
    },
    async remove(id: string): Promise<void> {
      await (await getDb()).delete('tests', id);
      repoEvents.bump();
    },
  },
  recordings: {
    async get(id: string): Promise<RecordingRecord | undefined> {
      return (await getDb()).get('recordings', id);
    },
    async put(r: RecordingRecord): Promise<void> {
      await (await getDb()).put('recordings', r);
    },
    async remove(id: string): Promise<void> {
      await (await getDb()).delete('recordings', id);
    },
  },
  sessions: {
    async list(): Promise<SessionDTO[]> {
      const all = await (await getDb()).getAll('sessions');
      return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async get(id: string): Promise<SessionDTO | undefined> {
      return (await getDb()).get('sessions', id);
    },
    async put(s: SessionDTO): Promise<void> {
      await (await getDb()).put('sessions', s);
      repoEvents.bump();
    },
    async remove(id: string): Promise<void> {
      await (await getDb()).delete('sessions', id);
      repoEvents.bump();
    },
  },
  outbox: {
    async add(kind: OutboxKind, entityId: string): Promise<void> {
      const db = await getDb();
      // idempotent: gleicher Eintrag nicht doppelt
      const all = await db.getAll('outbox');
      if (all.some((o) => o.kind === kind && o.entityId === entityId)) return;
      await db.add('outbox', { kind, entityId, attempts: 0, nextAttemptAt: 0, createdAt: Date.now() });
    },
    async list(): Promise<OutboxItem[]> {
      return (await getDb()).getAll('outbox');
    },
    async count(): Promise<number> {
      return (await getDb()).count('outbox');
    },
    async update(item: OutboxItem): Promise<void> {
      await (await getDb()).put('outbox', item);
    },
    async remove(id: number): Promise<void> {
      await (await getDb()).delete('outbox', id);
    },
  },
  /**
   * Beim Abmelden/Kontowechsel: Zwischenspeicher leeren, aber nichts Ungesendetes verlieren
   * (Tests/Aufnahmen mit offenem Upload sowie Profile mit offener Änderung bleiben).
   */
  async wipeCaches(): Promise<void> {
    const db = await getDb();
    const outbox = await db.getAll('outbox');
    const pendingTests = new Set(outbox.filter((o) => o.kind === 'test').map((o) => o.entityId));
    const pendingProfiles = new Set(outbox.filter((o) => o.kind === 'profile').map((o) => o.entityId));
    const pendingSessions = new Set(outbox.filter((o) => o.kind === 'session').map((o) => o.entityId));
    const keepRecordings = new Set<string>();
    for (const t of await db.getAll('tests')) {
      if (pendingTests.has(t.id)) keepRecordings.add(t.recordingId);
      else await db.delete('tests', t.id);
    }
    for (const r of await db.getAllKeys('recordings'))
      if (!keepRecordings.has(r)) await db.delete('recordings', r);
    for (const p of await db.getAll('profiles'))
      if (!pendingProfiles.has(p.id)) await db.delete('profiles', p.id);
    for (const id of await db.getAllKeys('sessions'))
      if (!pendingSessions.has(id)) await db.delete('sessions', id);
    for (const store of ['categories', 'groups', 'tagTypes', 'tags'] as const) await db.clear(store);
    await db.delete('kv', 'syncCursor');
    repoEvents.bump();
  },
  kv: {
    async get<T>(key: string): Promise<T | undefined> {
      return (await (await getDb()).get('kv', key)) as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      await (await getDb()).put('kv', value, key);
    },
  },
};
