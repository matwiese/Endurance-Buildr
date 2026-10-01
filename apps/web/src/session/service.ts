import type { SessionDTO } from '@buildr/shared';
import { serverMode } from '../hub/services.ts';
import { localRepo } from '../offline/repo.ts';
import { useAuth } from '../state/auth.ts';
import { syncEngine } from '../sync/index.ts';

/** Session lokal speichern und zum Upload vormerken (offline-first). */
export async function saveSession(s: SessionDTO): Promise<void> {
  await localRepo.sessions.put(s);
  if (serverMode()) {
    await localRepo.outbox.add('session', s.id);
    if (useAuth.getState().status === 'authenticated') void syncEngine.run();
  }
}

/** Session löschen (Tests bleiben erhalten; auf dem Server wird `session_id` geleert). */
export async function deleteSession(id: string): Promise<void> {
  await localRepo.sessions.remove(id);
  for (const o of await localRepo.outbox.list())
    if (o.kind === 'session' && o.entityId === id) await localRepo.outbox.remove(o.id!);
  if (serverMode()) {
    const { api } = await import('../api/client.ts');
    try {
      await api.del(`/api/sessions/${id}`);
    } catch {
      /* offline / schon weg: lokale Löschung genügt */
    }
  }
}
