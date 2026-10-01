import { SimpleFrameCodec, WebSocketAdapter, encodeSimpleFrame } from '@buildr/device';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAdapter, listAdapters, registerAdapter, resetAdapters } from '../src/live/adapters.ts';
import { StepConnect } from '../src/pages/test/StepConnect.tsx';
import { useLive } from '../src/state/live.ts';
import { useSettings } from '../src/state/settings.ts';

/** Gegenstelle für WebSocketAdapter: liefert nach dem Öffnen Frames im Beispielprotokoll (BF1). */
class FakeSocket {
  static last: FakeSocket | null = null;
  binaryType = 'blob';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: ArrayBuffer }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.last = this;
    setTimeout(() => this.onopen?.(), 0);
  }
  close(): void {
    this.onclose?.();
  }
  /** n Samples bei 1000 Hz (Stillstand: je 400 N) senden, in Paketen von 7 Frames (zerstückelt) */
  stream(n: number, t0 = 0): void {
    const frames: Uint8Array[] = [];
    for (let i = 0; i < n; i++)
      frames.push(encodeSimpleFrame({ t: t0 + i * 1000, left: 400, right: 400, seq: i & 0xffff }));
    const all = new Uint8Array(frames.reduce((s, f) => s + f.length, 0));
    let o = 0;
    for (const f of frames) {
      all.set(f, o);
      o += f.length;
    }
    for (let i = 0; i < all.length; i += 100)
      this.onmessage?.({ data: all.slice(i, i + 100).buffer as ArrayBuffer });
  }
}

const demoFactory = () => ({
  id: 'demo-ws',
  label: 'Demo-Platten (WebSocket)',
  description: 'Beispielprotokoll BF1',
  create: () =>
    new WebSocketAdapter({
      url: 'ws://plates.local:81',
      decoder: new SimpleFrameCodec(),
      hz: 1000,
      name: 'Demo-Platten',
      WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    }),
});

describe('Eigene Plattentreiber (Registry)', () => {
  beforeEach(async () => {
    resetAdapters();
    await useLive.getState().disconnect();
    useSettings.setState({ lang: 'de' });
  });
  afterEach(async () => {
    await useLive.getState().disconnect();
    resetAdapters();
  });

  it('registrieren, auflisten, doppelte/ungültige Kennungen werden abgelehnt', () => {
    registerAdapter(demoFactory());
    expect(listAdapters().map((a) => a.id)).toEqual(['demo-ws']);
    expect(getAdapter('demo-ws')?.label).toContain('Demo');
    expect(() => registerAdapter(demoFactory())).toThrow(/bereits registriert/);
    expect(() => registerAdapter({ ...demoFactory(), id: 'Ungültig!' })).toThrow(/Ungültige/);
  });

  it('Ohne Treiber nur Platzhalter-Quellen; mit Treiber erscheint die Quelle, verbindet und liefert Daten', async () => {
    const user = userEvent.setup();
    render(<StepConnect onConnected={() => undefined} />);
    expect(screen.getByTestId('source-websocket')).toBeInTheDocument();
    expect(screen.getByTestId('connect-button')).toBeEnabled(); // Simulator ist vorgewählt

    registerAdapter(demoFactory());
    const radio = await screen.findByTestId('source-custom:demo-ws');
    expect(screen.queryByTestId('source-websocket')).toBeNull();
    await user.click(radio);
    await user.click(screen.getByTestId('connect-button'));
    await screen.findByText(/Gerät bereit/);
    expect(useLive.getState()).toMatchObject({
      connection: 'connected',
      adapterKind: 'custom',
      adapterName: 'Demo-Platten',
    });

    // Daten laufen durch Decoder → Jitterbuffer → Ringpuffer
    FakeSocket.last!.stream(2000);
    await waitFor(() => expect(useLive.getState().engine!.ring.count).toBeGreaterThan(1500));
    const { left, right } = useLive.getState().engine!.ring;
    expect(left[100]).toBeCloseTo(400, 3);
    expect(right[100]).toBeCloseTo(400, 3);
  });

  it('Fehler beim Verbinden werden angezeigt, die App bleibt bedienbar', async () => {
    registerAdapter({
      id: 'kaputt',
      label: 'Kaputter Treiber',
      create: () => {
        throw new Error('Port belegt');
      },
    });
    const user = userEvent.setup();
    render(<StepConnect onConnected={() => undefined} />);
    await user.click(await screen.findByTestId('source-custom:kaputt'));
    await user.click(screen.getByTestId('connect-button'));
    expect(await screen.findByText(/Port belegt/)).toBeInTheDocument();
    expect(useLive.getState().connection).toBe('disconnected');
  });
});
