import type { QueueStatus, SessionDTO, SessionQueueEntry } from '@buildr/shared';

/** Reine Operationen auf der Warteschlange einer Session (unveränderlich; Aufrufer speichert das Ergebnis). */
const touch = (s: SessionDTO, patch: Partial<SessionDTO>): SessionDTO => ({
  ...s,
  ...patch,
  updatedAt: new Date().toISOString(),
});

export function newSession(o: {
  id: string;
  name: string;
  mode: SessionDTO['mode'];
  externalLoadKg: number;
  groupId: string | null;
  profileIds: string[];
  now?: string;
}): SessionDTO {
  const now = o.now ?? new Date().toISOString();
  return {
    id: o.id,
    name: o.name.trim() || o.id.slice(0, 8),
    mode: o.mode,
    externalLoadKg: Math.max(0, o.externalLoadKg),
    groupId: o.groupId,
    status: 'active',
    queue: [...new Set(o.profileIds)].map((profileId) => ({ profileId, status: 'waiting' as QueueStatus })),
    board: { metric: null, testType: o.mode === 'auto' ? null : o.mode, aggregate: 'best' },
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };
}

export const entryOf = (s: SessionDTO, profileId: string): SessionQueueEntry | undefined =>
  s.queue.find((q) => q.profileId === profileId);

export function addToQueue(s: SessionDTO, profileIds: string[]): SessionDTO {
  const have = new Set(s.queue.map((q) => q.profileId));
  const extra = [...new Set(profileIds)]
    .filter((id) => !have.has(id))
    .map((profileId) => ({ profileId, status: 'waiting' as QueueStatus }));
  return extra.length ? touch(s, { queue: [...s.queue, ...extra] }) : s;
}

export const removeFromQueue = (s: SessionDTO, profileId: string): SessionDTO =>
  touch(s, { queue: s.queue.filter((q) => q.profileId !== profileId) });

/** Eintrag um eine Position verschieben (−1 = nach oben, +1 = nach unten). */
export function moveInQueue(s: SessionDTO, profileId: string, dir: -1 | 1): SessionDTO {
  const i = s.queue.findIndex((q) => q.profileId === profileId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= s.queue.length) return s;
  const queue = [...s.queue];
  [queue[i], queue[j]] = [queue[j]!, queue[i]!];
  return touch(s, { queue });
}

/** Status eines Eintrags setzen; es ist höchstens ein Athlet gleichzeitig „testing“. */
export function setQueueStatus(s: SessionDTO, profileId: string, status: QueueStatus): SessionDTO {
  const queue = s.queue.map((q) => {
    if (q.profileId === profileId) return { ...q, status };
    if (status === 'testing' && q.status === 'testing') return { ...q, status: 'waiting' as QueueStatus };
    return q;
  });
  return touch(s, { queue });
}

/** Nächster wartender Athlet nach `afterProfileId` (zyklisch: wer übersprungen wurde, kommt später wieder dran → nur „waiting“). */
export function nextWaiting(s: SessionDTO, afterProfileId?: string | null): SessionQueueEntry | undefined {
  const start = afterProfileId ? s.queue.findIndex((q) => q.profileId === afterProfileId) + 1 : 0;
  const order = [...s.queue.slice(start), ...s.queue.slice(0, start)];
  return order.find((q) => q.status === 'waiting');
}

export const progress = (
  s: SessionDTO,
): { done: number; total: number; waiting: number; skipped: number } => ({
  done: s.queue.filter((q) => q.status === 'done').length,
  total: s.queue.length,
  waiting: s.queue.filter((q) => q.status === 'waiting' || q.status === 'testing').length,
  skipped: s.queue.filter((q) => q.status === 'skipped').length,
});

export const withBoard = (s: SessionDTO, board: Partial<SessionDTO['board']>): SessionDTO =>
  touch(s, { board: { ...s.board, ...board } });
export const withStatus = (s: SessionDTO, status: SessionDTO['status']): SessionDTO =>
  touch(s, { status, finishedAt: status === 'finished' ? new Date().toISOString() : null });
