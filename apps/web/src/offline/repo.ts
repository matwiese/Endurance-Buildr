import type {
  CategoryDTO,
  GroupDTO,
  ProfileDTO,
  RecordingRecord,
  TagDTO,
  TagTypeDTO,
  TestRecord,
} from '@buildr/shared';
import { getDb, type OutboxItem, type OutboxKind } from './db.ts';

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
    },
    async remove(id: string): Promise<void> {
      await (await getDb()).delete('profiles', id);
    },
    async replaceAll(list: ProfileDTO[]): Promise<void> {
      const db = await getDb();
      const tx = db.transaction('profiles', 'readwrite');
      await tx.store.clear();
      for (const p of list) await tx.store.put(p);
      await tx.done;
    },
  },
  categories: {
    async list(): Promise<CategoryDTO[]> {
      return (await getDb()).getAll('categories');
    },
    async put(c: CategoryDTO): Promise<void> {
      await (await getDb()).put('categories', c);
    },
  },
  groups: {
    async list(): Promise<GroupDTO[]> {
      return (await getDb()).getAll('groups');
    },
    async put(g: GroupDTO): Promise<void> {
      await (await getDb()).put('groups', g);
    },
  },
  tagTypes: {
    async list(): Promise<TagTypeDTO[]> {
      return (await getDb()).getAll('tagTypes');
    },
    async put(t: TagTypeDTO): Promise<void> {
      await (await getDb()).put('tagTypes', t);
    },
  },
  tags: {
    async list(): Promise<TagDTO[]> {
      return (await getDb()).getAll('tags');
    },
    async put(t: TagDTO): Promise<void> {
      await (await getDb()).put('tags', t);
    },
  },
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
    },
    async remove(id: string): Promise<void> {
      await (await getDb()).delete('tests', id);
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
  kv: {
    async get<T>(key: string): Promise<T | undefined> {
      return (await (await getDb()).get('kv', key)) as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      await (await getDb()).put('kv', value, key);
    },
  },
};
