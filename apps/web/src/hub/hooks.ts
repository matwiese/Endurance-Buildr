import type { CategoryDTO, GroupDTO, ProfileDTO, TagDTO, TagTypeDTO } from '@buildr/shared';
import { useEffect, useState } from 'react';
import { useRepoVersion } from '../offline/events.ts';
import { localRepo } from '../offline/repo.ts';

export interface RefData {
  loaded: boolean;
  profiles: ProfileDTO[];
  categories: CategoryDTO[];
  groups: GroupDTO[];
  tagTypes: TagTypeDTO[];
  tags: TagDTO[];
}

const EMPTY: RefData = { loaded: false, profiles: [], categories: [], groups: [], tagTypes: [], tags: [] };

/** Stammdaten aus der lokalen Datenschicht; lädt bei jeder lokalen Änderung (auch durch den Abgleich) neu. */
export function useRefData(): RefData {
  const version = useRepoVersion();
  const [data, setData] = useState<RefData>(EMPTY);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [profiles, categories, groups, tagTypes, tags] = await Promise.all([
        localRepo.profiles.list(),
        localRepo.categories.list(),
        localRepo.groups.list(),
        localRepo.tagTypes.list(),
        localRepo.tags.list(),
      ]);
      if (alive) setData({ loaded: true, profiles, categories, groups, tagTypes, tags });
    })();
    return () => {
      alive = false;
    };
  }, [version]);
  return data;
}
