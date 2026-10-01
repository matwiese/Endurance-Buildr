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
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type OutboxKind = 'test' | 'profile' | 'delete-profile' | 'tag' | 'tagType' | 'session';

export interface OutboxItem {
  id?: number;
  kind: OutboxKind;
  /** ID der Entität (z. B. Test-ID) */
  entityId: string;
  attempts: number;
  /** frühester nächster Versuch (ms seit Epoche) */
  nextAttemptAt: number;
  lastError?: string;
  /** dauerhaft fehlgeschlagen (4xx): wird nicht automatisch wiederholt, nur über „Erneut versuchen“ */
  dead?: boolean;
  createdAt: number;
}

export interface BuildrDB extends DBSchema {
  profiles: { key: string; value: ProfileDTO; indexes: { byName: string } };
  categories: { key: string; value: CategoryDTO };
  groups: { key: string; value: GroupDTO };
  tagTypes: { key: string; value: TagTypeDTO };
  tags: { key: string; value: TagDTO };
  tests: { key: string; value: TestRecord; indexes: { byProfile: string; byCreated: string } };
  recordings: { key: string; value: RecordingRecord };
  sessions: { key: string; value: SessionDTO; indexes: { byCreated: string } };
  outbox: { key: number; value: OutboxItem; indexes: { byNext: number } };
  kv: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<BuildrDB>> | null = null;

export function getDb(name = 'buildr-force'): Promise<IDBPDatabase<BuildrDB>> {
  dbPromise ??= openDB<BuildrDB>(name, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion >= 1) {
        // v2: Gruppensitzungen
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('byCreated', 'createdAt');
        return;
      }
      const profiles = db.createObjectStore('profiles', { keyPath: 'id' });
      profiles.createIndex('byName', 'name');
      db.createObjectStore('categories', { keyPath: 'id' });
      db.createObjectStore('groups', { keyPath: 'id' });
      db.createObjectStore('tagTypes', { keyPath: 'id' });
      db.createObjectStore('tags', { keyPath: 'id' });
      const tests = db.createObjectStore('tests', { keyPath: 'id' });
      tests.createIndex('byProfile', 'profileId');
      tests.createIndex('byCreated', 'createdAt');
      db.createObjectStore('recordings', { keyPath: 'id' });
      const outbox = db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      outbox.createIndex('byNext', 'nextAttemptAt');
      db.createObjectStore('kv');
      const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
      sessions.createIndex('byCreated', 'createdAt');
    },
  });
  return dbPromise;
}

/** Nur für Tests: Datenbank schließen und Singleton zurücksetzen. */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) {
    const d = await dbPromise;
    d.close();
  }
  dbPromise = null;
  await new Promise<void>((res) => {
    const req = indexedDB.deleteDatabase('buildr-force');
    req.onsuccess = req.onerror = req.onblocked = () => res();
  });
}
