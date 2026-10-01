import type { FromWorker, ToWorker, WorkerLike } from './protocol.ts';
import { createWorkerHandler } from './workerCore.ts';

/** Gleiche Schnittstelle wie ein Web Worker, läuft aber im Hauptthread (Tests, Umgebungen ohne Worker). */
export class InlineWorker implements WorkerLike {
  onmessage: ((ev: { data: FromWorker }) => void) | null = null;
  private readonly handler = createWorkerHandler((m) => {
    // asynchron wie ein echter Worker, aber ohne Timer-Verzögerung
    queueMicrotask(() => this.onmessage?.({ data: m }));
  });
  postMessage(msg: ToWorker): void {
    this.handler(msg);
  }
  terminate(): void {
    this.onmessage = null;
  }
}

export function createAnalysisWorker(): WorkerLike {
  if (typeof Worker === 'undefined') return new InlineWorker();
  const w = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
  return w as unknown as WorkerLike;
}
