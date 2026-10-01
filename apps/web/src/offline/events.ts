import { useSyncExternalStore } from 'react';

/** Änderungszähler der lokalen Datenschicht: Seiten laden ihre Listen neu, sobald sich etwas geändert hat. */
let version = 0;
const listeners = new Set<() => void>();

export const repoEvents = {
  bump(): void {
    version++;
    for (const l of listeners) l();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  version: (): number => version,
};

export const useRepoVersion = (): number => useSyncExternalStore(repoEvents.subscribe, repoEvents.version);
