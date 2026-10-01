import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import 'fake-indexeddb/auto';

// jsdom: keine Layout-/Canvas-APIs → minimale Stubs (Plots zeichnen dann nichts, rendern aber ohne Fehler)
class RO {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= RO as unknown as typeof ResizeObserver;

afterEach(() => cleanup());
