import { LiveAnalyzer, analyzeRecording } from '@buildr/core';
import type { FromWorker, ToWorker } from './protocol.ts';

/**
 * Worker-Logik ohne Worker-Abhängigkeit: verarbeitet Nachrichten und antwortet über `post`.
 * Wird sowohl vom echten Web Worker als auch vom InlineWorker (Tests/Fallback) genutzt.
 */
export function createWorkerHandler(post: (msg: FromWorker) => void): (msg: ToWorker) => void {
  let analyzer: LiveAnalyzer | null = null;
  const emit = (e: Parameters<ConstructorParameters<typeof LiveAnalyzer>[0]>[0]) =>
    post({ type: 'event', e });
  return (msg) => {
    try {
      switch (msg.type) {
        case 'init':
          analyzer = new LiveAnalyzer(emit, {
            hz: msg.hz,
            mode: msg.mode,
            externalLoadKg: msg.externalLoadKg,
            config: msg.config,
          });
          return;
        case 'analyze':
          post({ type: 'analysis', reqId: msg.reqId, analysis: analyzeRecording(msg.trace, msg.options) });
          return;
        default:
      }
      if (!analyzer) return;
      switch (msg.type) {
        case 'configure':
          analyzer.configure({ mode: msg.mode, externalLoadKg: msg.externalLoadKg, config: msg.config });
          return;
        case 'push':
          analyzer.push(msg.left, msg.right, msg.corners, msg.breakBefore, msg.tag);
          return;
        case 'startZero':
          analyzer.startZero();
          return;
        case 'rezero':
          analyzer.rezero();
          return;
        case 'startWeigh':
          analyzer.startWeigh();
          return;
        case 'cancelWeigh':
          analyzer.cancelWeigh();
          return;
        case 'lockWeight':
          post({ type: 'locked', reqId: msg.reqId, kg: analyzer.lockWeight() });
          return;
        case 'setMass':
          analyzer.setMass(msg.kg, msg.source ?? 'manual');
          return;
        case 'startRecording':
          post({ type: 'recordingStarted', reqId: msg.reqId, ok: analyzer.startRecording() });
          return;
        case 'pause':
          analyzer.pause();
          return;
        case 'resume':
          analyzer.resume();
          return;
        case 'stop':
          post({ type: 'stopped', reqId: msg.reqId, result: analyzer.stop() });
          return;
        default:
      }
    } catch (err) {
      // Der Worker darf nie sterben: Fehler als Ereignis melden
      post({ type: 'event', e: { type: 'error', code: 'bad_state', message: String(err) } });
    }
  };
}
