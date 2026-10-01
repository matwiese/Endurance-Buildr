import type { CategoryDTO, GroupDTO, ProfileDTO, TagDTO, TagTypeDTO } from '@buildr/shared';
import { ApiError, NetworkError, api } from '../api/client.ts';
import { uid } from '../lib/uid.ts';
import { localRepo } from '../offline/repo.ts';
import { useAuth } from '../state/auth.ts';
import { syncEngine } from '../sync/index.ts';

/** Alles außer dem ausdrücklich gewählten lokalen Modus gilt als Servermodus (Änderungen werden vorgemerkt). */
export const serverMode = (): boolean => useAuth.getState().status !== 'local';

const kick = (): void => {
  if (useAuth.getState().status === 'authenticated') void syncEngine.run();
};

/** Profil lokal speichern und zum Upload vormerken (offline-first, letzter Schreiber gewinnt). */
export async function saveProfile(p: ProfileDTO): Promise<void> {
  await localRepo.profiles.put({ ...p, name: p.name.trim(), updatedAt: new Date().toISOString() });
  if (serverMode()) {
    await localRepo.outbox.add('profile', p.id);
    kick();
  }
}

/** Mehrere Profile speichern (Import, Sammelzuweisung) – ein Abgleichslauf am Ende. */
export async function saveProfiles(list: ProfileDTO[]): Promise<void> {
  const now = new Date().toISOString();
  for (const p of list) {
    await localRepo.profiles.put({ ...p, updatedAt: now });
    if (serverMode()) await localRepo.outbox.add('profile', p.id);
  }
  kick();
}

/** DSGVO-Löschung: lokal sofort, serverseitig (Tests, Messwerte, Roh-Aufnahmen) über die Warteschlange. */
export async function removeProfile(id: string): Promise<void> {
  for (const t of await localRepo.tests.byProfile(id)) {
    await localRepo.tests.remove(t.id);
    if (t.recordingId) await localRepo.recordings.remove(t.recordingId);
  }
  await localRepo.profiles.remove(id);
  if (serverMode()) {
    // offene Änderungen am Profil verfallen, die Löschung gewinnt
    for (const o of await localRepo.outbox.list()) {
      if (o.entityId === id && o.kind !== 'delete-profile') await localRepo.outbox.remove(o.id!);
    }
    await localRepo.outbox.add('delete-profile', id);
    kick();
  }
}

export type RefResult = 'ok' | 'offline' | 'forbidden' | 'invalid' | 'error';

async function viaApi(call: () => Promise<unknown>, mirror: () => Promise<void>): Promise<RefResult> {
  if (serverMode()) {
    try {
      await call();
    } catch (e) {
      if (e instanceof NetworkError) return 'offline';
      if (e instanceof ApiError)
        return e.status === 403 ? 'forbidden' : e.status === 400 || e.status === 422 ? 'invalid' : 'error';
      return 'error';
    }
  }
  await mirror();
  return 'ok';
}

/** Stammdaten-Verwaltung: mit Server direkt über die API (nur online), im lokalen Modus nur lokal. */
export const refAdmin = {
  saveCategory: (c: CategoryDTO) =>
    viaApi(
      () => api.put(`/api/reference/categories/${c.id}`, c),
      () => localRepo.categories.put(c),
    ),
  deleteCategory: async (id: string) => {
    const groups = (await localRepo.groups.list()).filter((g) => g.categoryId === id);
    return viaApi(
      () => api.del(`/api/reference/categories/${id}`),
      async () => {
        for (const g of groups) await localRepo.groups.remove(g.id);
        await localRepo.categories.remove(id);
      },
    );
  },
  saveGroup: (g: GroupDTO) =>
    viaApi(
      () => api.put(`/api/reference/groups/${g.id}`, g),
      () => localRepo.groups.put(g),
    ),
  deleteGroup: (id: string) =>
    viaApi(
      () => api.del(`/api/reference/groups/${id}`),
      () => localRepo.groups.remove(id),
    ),
  saveTagType: (t: TagTypeDTO) =>
    viaApi(
      () => api.put(`/api/reference/tag-types/${t.id}`, t),
      () => localRepo.tagTypes.put(t),
    ),
  deleteTagType: async (id: string) => {
    const tags = (await localRepo.tags.list()).filter((t) => t.tagTypeId === id);
    return viaApi(
      () => api.del(`/api/reference/tag-types/${id}`),
      async () => {
        for (const t of tags) await localRepo.tags.remove(t.id);
        await localRepo.tagTypes.remove(id);
      },
    );
  },
  saveTag: (t: TagDTO) =>
    viaApi(
      () => api.put(`/api/reference/tags/${t.id}`, t),
      () => localRepo.tags.put(t),
    ),
  deleteTag: (id: string) =>
    viaApi(
      () => api.del(`/api/reference/tags/${id}`),
      () => localRepo.tags.remove(id),
    ),
};

export type BulkMode = 'add' | 'remove';

/** Sammelzuweisung von Gruppen. Profile behalten mindestens eine Gruppe (Pflicht). */
export async function bulkGroup(
  profiles: ProfileDTO[],
  groupId: string,
  mode: BulkMode,
): Promise<{ changed: number; skipped: number }> {
  const out: ProfileDTO[] = [];
  let skipped = 0;
  for (const p of profiles) {
    const has = p.groupIds.includes(groupId);
    if (mode === 'add' && !has) out.push({ ...p, groupIds: [...p.groupIds, groupId] });
    else if (mode === 'remove' && has) {
      if (p.groupIds.length <= 1) skipped++;
      else out.push({ ...p, groupIds: p.groupIds.filter((g) => g !== groupId) });
    }
  }
  await saveProfiles(out);
  return { changed: out.length, skipped };
}

/** Tag (und ggf. neuer Tag-Typ) direkt im Test-Workflow anlegen: lokal sofort, Upload über die Warteschlange (auch offline). */
export async function createTagOffline(typeName: string, value: string): Promise<TagDTO | null> {
  const tn = typeName.trim();
  const v = value.trim();
  if (!tn || !v) return null;
  const types = await localRepo.tagTypes.list();
  let tt = types.find((x) => x.name.toLowerCase() === tn.toLowerCase());
  if (!tt) {
    tt = { id: uid(), name: tn };
    await localRepo.tagTypes.put(tt);
    if (serverMode()) await localRepo.outbox.add('tagType', tt.id);
  }
  const existing = (await localRepo.tags.list()).find(
    (x) => x.tagTypeId === tt!.id && x.name.toLowerCase() === v.toLowerCase(),
  );
  if (existing) return existing;
  const tag: TagDTO = { id: uid(), tagTypeId: tt.id, name: v };
  await localRepo.tags.put(tag);
  if (serverMode()) await localRepo.outbox.add('tag', tag.id);
  kick();
  return tag;
}
