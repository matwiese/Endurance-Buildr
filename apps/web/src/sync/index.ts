import { useSyncExternalStore } from 'react';
import { api } from '../api/client.ts';
import { localRepo } from '../offline/repo.ts';
import { BROWSER_CODEC } from './blob.ts';
import { SyncEngine, type SyncState } from './engine.ts';

export const syncEngine = new SyncEngine({ api, repo: localRepo, codec: BROWSER_CODEC });

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (cb) => syncEngine.subscribe(cb),
    () => syncEngine.state,
  );
}

export { SyncEngine, type SyncState };
