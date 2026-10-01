import { encodeBlob, type BlobCodec } from '@buildr/core';
import type { ProfileDTO, SessionDTO, SyncPullDTO, TestRecord } from '@buildr/shared';
import { ApiError, NetworkError, type Api } from '../api/client.ts';
import type { OutboxItem } from '../offline/db.ts';
import type { localRepo } from '../offline/repo.ts';

export interface SyncState {
  running: boolean;
  /** offene Einträge, die noch gesendet werden (ohne endgültig fehlgeschlagene) */
  pending: number;
  /** endgültig fehlgeschlagen (manuell erneut versuchen) */
  failed: number;
  lastSyncAt: number | null;
  lastError: string | null;
  /** letzter Versuch scheiterte am Netz */
  offline: boolean;
  /** Sitzung abgelaufen/ungültig: Anmeldung nötig */
  authRequired: boolean;
}

export interface SyncDeps {
  api: Api;
  repo: typeof localRepo;
  codec: BlobCodec;
  now?: () => number;
}

const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 5 * 60_000;
const RETRIABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Reihenfolge der Abarbeitung: Stammdaten/Profile vor Tests (Fremdschlüssel), Löschungen zuletzt. */
const KIND_RANK: Record<OutboxItem['kind'], number> = {
  tagType: 0,
  tag: 0,
  profile: 1,
  session: 2,
  test: 3,
  'delete-profile': 4,
};

const stripStatus = (t: TestRecord): Omit<TestRecord, 'status'> => {
  const { status: _status, ...rest } = t;
  void _status;
  return rest;
};

/**
 * Offline-first-Abgleich: arbeitet die Outbox in Reihenfolge ab (Profile vor Tests), lädt Aufnahmen idempotent hoch und holt
 * danach Stammdaten (Pull). Fehlerklassen: Netz/5xx/429 → Wiederholung mit Backoff · 401 → Anmeldung nötig · übrige 4xx → endgültig.
 * Alle Schreibzugriffe sind idempotent (Client-UUIDs), ein erneuter Versuch nach unklarem Ausgang ist daher gefahrlos.
 */
export class SyncEngine {
  state: SyncState = {
    running: false,
    pending: 0,
    failed: 0,
    lastSyncAt: null,
    lastError: null,
    offline: false,
    authRequired: false,
  };
  private listeners = new Set<(s: SyncState) => void>();
  private running: Promise<SyncState> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: SyncDeps) {
    this.now = deps.now ?? Date.now;
  }

  subscribe(fn: (s: SyncState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  async refreshCounts(): Promise<void> {
    const items = await this.deps.repo.outbox.list();
    this.set({ pending: items.filter((i) => !i.dead).length, failed: items.filter((i) => i.dead).length });
  }

  /** Ein Durchlauf (Push + Pull). Parallelaufrufe teilen sich denselben Lauf. */
  run(): Promise<SyncState> {
    this.running ??= this.runOnce().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runOnce(): Promise<SyncState> {
    this.set({ running: true, lastError: null });
    try {
      await this.push();
      await this.pull();
      this.set({ lastSyncAt: this.now(), offline: false, authRequired: false });
    } catch (e) {
      if (e instanceof NetworkError) this.set({ offline: true });
      else if (e instanceof ApiError && e.status === 401) this.set({ authRequired: true });
      else this.set({ lastError: e instanceof ApiError ? e.code : String((e as Error)?.message ?? e) });
    } finally {
      await this.refreshCounts();
      this.set({ running: false });
    }
    return this.state;
  }

  private async push(): Promise<void> {
    const { repo } = this.deps;
    const items = (await repo.outbox.list())
      .filter((i) => !i.dead)
      .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.createdAt - b.createdAt);
    for (const item of items) {
      if (item.nextAttemptAt > this.now()) continue;
      try {
        await this.pushItem(item);
        await repo.outbox.remove(item.id!);
      } catch (e) {
        if (e instanceof NetworkError) throw e; // offline: Rest später
        if (e instanceof ApiError && e.status === 401) throw e;
        const retriable = e instanceof ApiError && RETRIABLE.has(e.status);
        const attempts = item.attempts + 1;
        const lastError = e instanceof ApiError ? e.code : String((e as Error)?.message ?? e);
        if (retriable) {
          const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempts);
          await repo.outbox.update({ ...item, attempts, lastError, nextAttemptAt: this.now() + wait });
        } else {
          await repo.outbox.update({ ...item, attempts, lastError, dead: true });
          await this.markFailed(item, lastError);
        }
      }
    }
  }

  private async markFailed(item: OutboxItem, _reason: string): Promise<void> {
    void _reason;
    if (item.kind !== 'test') return;
    const t = await this.deps.repo.tests.get(item.entityId);
    if (t) await this.deps.repo.tests.put({ ...t, status: 'failed' });
  }

  private async pushItem(item: OutboxItem): Promise<void> {
    const { api, repo } = this.deps;
    switch (item.kind) {
      case 'profile': {
        const p = await repo.profiles.get(item.entityId);
        if (!p) return;
        const res = await api.put<{ profile: ProfileDTO; applied: boolean }>(`/api/profiles/${p.id}`, p);
        // neuerer Serverstand gewinnt (letzter Schreiber)
        if (!res.applied) await repo.profiles.put(res.profile);
        return;
      }
      case 'delete-profile': {
        try {
          await api.del(`/api/profiles/${item.entityId}`);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 404)) throw e;
        }
        return;
      }
      case 'test':
        return this.pushTest(item.entityId);
      case 'session': {
        const sess = await repo.sessions.get(item.entityId);
        if (!sess) return;
        const res = await api.put<{ session: SessionDTO; applied: boolean }>(
          `/api/sessions/${sess.id}`,
          sess,
        );
        if (!res.applied) await repo.sessions.put(res.session);
        return;
      }
      case 'tagType': {
        const t = await repo.tagTypes.get(item.entityId);
        if (t) await api.put(`/api/reference/tag-types/${t.id}`, t);
        return;
      }
      case 'tag': {
        const t = await repo.tags.get(item.entityId);
        if (t) await api.put(`/api/reference/tags/${t.id}`, t);
        return;
      }
    }
  }

  private async pushTest(id: string): Promise<void> {
    const { api, repo, codec } = this.deps;
    const t = await repo.tests.get(id);
    if (!t) return;
    const rec = await repo.recordings.get(t.recordingId);
    if (!rec) throw new ApiError(422, 'local_recording_missing', null);
    const upload = async (): Promise<void> => {
      const bytes = await encodeBlob(
        { hz: rec.hz, left: rec.left, right: rec.right, copX: rec.copX, copY: rec.copY, breaks: rec.breaks },
        codec,
      );
      const q = t.profileId ? `?profileId=${t.profileId}` : '';
      await api.putBlob(`/api/recordings/${rec.id}${q}`, bytes);
    };
    await upload();
    try {
      await api.put(`/api/tests/${t.id}`, stripStatus(t));
    } catch (e) {
      // Aufnahme serverseitig verschwunden (z. B. Bereinigung): einmal neu hochladen
      if (e instanceof ApiError && e.code === 'recording_missing') {
        await upload();
        await api.put(`/api/tests/${t.id}`, stripStatus(t));
      } else throw e;
    }
    await repo.tests.put({ ...t, status: 'uploaded' });
  }

  /** Stammdaten holen und lokal zusammenführen (offene lokale Änderungen haben Vorrang bis zum Upload). */
  private async pull(): Promise<void> {
    const { api, repo } = this.deps;
    const since = (await repo.kv.get<number>('syncCursor')) ?? 0;
    const d = await api.get<SyncPullDTO>(`/api/sync/pull?since=${since}`);
    const outbox = await repo.outbox.list();
    const pendingProfiles = new Set(
      outbox.filter((o) => o.kind === 'profile' || o.kind === 'delete-profile').map((o) => o.entityId),
    );
    const pendingTagTypes = new Set(outbox.filter((o) => o.kind === 'tagType').map((o) => o.entityId));
    const pendingTags = new Set(outbox.filter((o) => o.kind === 'tag').map((o) => o.entityId));

    if (d.full) {
      const keep = (await repo.profiles.list()).filter((p) => pendingProfiles.has(p.id));
      await repo.profiles.replaceAll([...d.profiles.filter((p) => !pendingProfiles.has(p.id)), ...keep]);
      await repo.categories.replaceAll(d.categories);
      await repo.groups.replaceAll(d.groups);
      // noch nicht hochgeladene lokale Tags/Tag-Typen bleiben erhalten
      const keepTypes = (await repo.tagTypes.list()).filter((x) => pendingTagTypes.has(x.id));
      const keepTags = (await repo.tags.list()).filter((x) => pendingTags.has(x.id));
      await repo.tagTypes.replaceAll([...d.tagTypes.filter((x) => !pendingTagTypes.has(x.id)), ...keepTypes]);
      await repo.tags.replaceAll([...d.tags.filter((x) => !pendingTags.has(x.id)), ...keepTags]);
    } else {
      for (const p of d.profiles) if (!pendingProfiles.has(p.id)) await repo.profiles.put(p);
      for (const c of d.categories) await repo.categories.put(c);
      for (const g of d.groups) await repo.groups.put(g);
      for (const t of d.tagTypes) await repo.tagTypes.put(t);
      for (const t of d.tags) await repo.tags.put(t);
      for (const x of d.deleted) {
        if (x.entity === 'profile' && !pendingProfiles.has(x.id)) await repo.profiles.remove(x.id);
        else if (x.entity === 'category') await repo.categories.remove(x.id);
        else if (x.entity === 'group') await repo.groups.remove(x.id);
        else if (x.entity === 'tagType') await repo.tagTypes.remove(x.id);
        else if (x.entity === 'tag') await repo.tags.remove(x.id);
      }
    }
    await repo.kv.set('syncCursor', d.cursor);
  }

  /** Endgültig fehlgeschlagene Einträge erneut versuchen. */
  async retryFailed(): Promise<void> {
    const { repo } = this.deps;
    for (const i of await repo.outbox.list()) {
      if (!i.dead) continue;
      await repo.outbox.update({ ...i, dead: false, attempts: 0, nextAttemptAt: 0, lastError: undefined });
      if (i.kind === 'test') {
        const t = await repo.tests.get(i.entityId);
        if (t) await repo.tests.put({ ...t, status: 'queued' });
      }
    }
    await this.refreshCounts();
    await this.run();
  }

  /** Periodischer Abgleich + sofort bei Netzrückkehr. */
  start(intervalMs = 30_000): () => void {
    const tick = () => {
      void this.run();
      this.timer = setTimeout(tick, intervalMs);
    };
    const onOnline = () => {
      if (this.timer) clearTimeout(this.timer);
      tick();
    };
    if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
    tick();
    return () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
    };
  }
}
