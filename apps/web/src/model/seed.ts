import type { CategoryDTO, GroupDTO } from '@buildr/shared';
import { localRepo } from '../offline/repo.ts';
import { uid } from '../lib/uid.ts';

/** Legt Standard-Kategorie/-Gruppe an, falls noch keine Gruppe existiert (Profile brauchen mindestens eine Gruppe). */
export async function ensureDefaultGroup(): Promise<{ category: CategoryDTO; group: GroupDTO }> {
  const [cats, groups] = await Promise.all([localRepo.categories.list(), localRepo.groups.list()]);
  if (groups.length && cats.length) return { category: cats[0]!, group: groups[0]! };
  const category: CategoryDTO = cats[0] ?? { id: uid(), name: 'Standard' };
  if (!cats.length) await localRepo.categories.put(category);
  const group: GroupDTO = { id: uid(), categoryId: category.id, name: 'Alle Athleten' };
  await localRepo.groups.put(group);
  return { category, group };
}
