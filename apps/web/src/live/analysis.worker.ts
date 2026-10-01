/// <reference lib="webworker" />
import type { ToWorker } from './protocol.ts';
import { createWorkerHandler } from './workerCore.ts';

const handle = createWorkerHandler((m) => self.postMessage(m));
self.onmessage = (ev: MessageEvent<ToWorker>) => handle(ev.data);
