import { useSyncExternalStore } from 'react';

/** Änderungszähler der lokalen Datenschicht: Seiten laden ihre Listen neu, sobald sich etwas geändert hat. */
let version = 0;
const listeners = new Set<() => void>();

/** Weitere Fenster/Tabs derselben App (z. B. Beamer-Rangliste) erfahren von lokalen Änderungen über einen BroadcastChannel. */
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('buildr-repo');

const notify = (): void => {
  version++;
  for (const l of listeners) l();
};
if (channel) channel.onmessage = () => notify();

export const repoEvents = {
  bump(): void {
    notify();
    channel?.postMessage(1);
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  version: (): number => version,
};

export const useRepoVersion = (): number => useSyncExternalStore(repoEvents.subscribe, repoEvents.version);
