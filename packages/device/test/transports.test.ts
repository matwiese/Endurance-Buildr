import { describe, expect, it } from 'vitest';
import {
  DeviceError,
  ProtocolNotImplementedError,
  SimpleFrameCodec,
  WebBluetoothAdapter,
  WebSerialAdapter,
  WebSocketAdapter,
  crc8,
  encodeSimpleFrame,
  type Sample,
} from '../src/index.ts';

const frames = (n: number, corners = false): Sample[] =>
  Array.from({ length: n }, (_, i) => ({
    t: i * 1000,
    left: 400 + i * 0.25,
    right: 410 - i * 0.5,
    seq: i,
    corners: corners ? Array.from({ length: 8 }, (_, k) => 100 + k + i) : undefined,
  }));
const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

describe('SimpleFrameCodec (Beispielprotokoll, kein Herstellerprotokoll)', () => {
  it('Roundtrip ohne und mit Eckensensoren', () => {
    for (const c of [false, true]) {
      const src = frames(20, c);
      const out = new SimpleFrameCodec().push(concat(src.map(encodeSimpleFrame)));
      expect(out).toHaveLength(20);
      expect(out[7]!.left).toBeCloseTo(src[7]!.left, 4);
      expect(out[7]!.seq).toBe(7);
      expect(out[19]!.t).toBe(19000);
      expect(out[3]!.corners?.[5]).toBe(c ? src[3]!.corners![5] : undefined);
    }
  });
  it('beliebige Zerstückelung (1-Byte-Schnipsel)', () => {
    const bytes = concat(frames(15, true).map(encodeSimpleFrame));
    const codec = new SimpleFrameCodec();
    const got: Sample[] = [];
    for (let i = 0; i < bytes.length; i++) got.push(...codec.push(bytes.subarray(i, i + 1)));
    expect(got).toHaveLength(15);
    expect(codec.discardedBytes).toBe(0);
  });
  it('synchronisiert nach Müll und CRC-Fehlern neu und verliert nur beschädigte Frames', () => {
    const a = frames(10).map(encodeSimpleFrame);
    const bad = a[4]!.slice();
    bad[10] ^= 0xff; // Nutzdaten kaputt ⇒ CRC passt nicht
    const bytes = concat([
      Uint8Array.of(1, 2, 3, 0xb5, 9),
      a[0]!,
      a[1]!,
      a[2]!,
      a[3]!,
      bad,
      a[5]!,
      a[6]!,
      a[7]!,
      a[8]!,
      a[9]!,
    ]);
    const codec = new SimpleFrameCodec();
    const out = codec.push(bytes);
    expect(out.map((s) => s.seq)).toEqual([0, 1, 2, 3, 5, 6, 7, 8, 9]);
    expect(codec.discardedBytes).toBeGreaterThan(0);
  });
  it('u32-Zeitüberlauf (≈ 71,6 min) wird entwickelt', () => {
    const codec = new SimpleFrameCodec();
    const mk = (t: number) => encodeSimpleFrame({ t, left: 1, right: 1, seq: 0 });
    const out = codec.push(concat([mk(4294960000), mk(4294966000), mk(1500), mk(2500)]));
    expect(out[2]!.t).toBe(2 ** 32 + 1500);
    expect(out[3]!.t - out[2]!.t).toBe(1000);
  });
  it('crc8 ist deterministisch', () => {
    expect(crc8(Uint8Array.of(1, 2, 3))).toBe(crc8(Uint8Array.of(1, 2, 3)));
    expect(crc8(Uint8Array.of(1, 2, 3))).not.toBe(crc8(Uint8Array.of(1, 2, 4)));
  });
});

class MockWS {
  static last: MockWS | null = null;
  binaryType = 'blob';
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    MockWS.last = this;
    queueMicrotask(() => (url.includes('fail') ? this.onerror?.() : this.onopen?.()));
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
}

describe('Transport-Adapter', () => {
  it('WebSocketAdapter: verbindet, dekodiert Binärframes zu Sample-Batches, meldet Status', async () => {
    const a = new WebSocketAdapter({
      url: 'ws://plates.local/stream',
      decoder: new SimpleFrameCodec(),
      WebSocketImpl: MockWS as never,
    });
    const states: string[] = [];
    a.onStatus((s) => states.push(s.connection));
    const got: Sample[] = [];
    a.onSample((b) => got.push(...b));
    await a.connect();
    expect(states).toEqual(['connecting', 'connected']);
    const bytes = concat(frames(30).map(encodeSimpleFrame));
    MockWS.last!.binaryType = 'arraybuffer';
    // zwei Nachrichten, Frame an der Grenze zerschnitten
    MockWS.last!.onmessage!({ data: bytes.slice(0, 100).buffer });
    MockWS.last!.onmessage!({ data: bytes.slice(100).buffer });
    MockWS.last!.onmessage!({ data: 'ignorierter Text' });
    expect(got).toHaveLength(30);
    expect(a.status.packetLoss.received).toBe(30);
    await a.disconnect();
    expect(MockWS.last!.closed).toBe(true);
    expect(a.status.connection).toBe('disconnected');
  });
  it('WebSocketAdapter: Verbindungsfehler ⇒ DeviceError und Status error', async () => {
    const a = new WebSocketAdapter({
      url: 'ws://fail',
      decoder: new SimpleFrameCodec(),
      WebSocketImpl: MockWS as never,
    });
    await expect(a.connect()).rejects.toBeInstanceOf(DeviceError);
    expect(a.status.connection).toBe('error');
  });
  it('alle Stubs verlangen einen FrameDecoder (Protokoll ist proprietär)', async () => {
    await expect(new WebSocketAdapter({ url: 'ws://x' }).connect()).rejects.toBeInstanceOf(
      ProtocolNotImplementedError,
    );
    await expect(new WebSerialAdapter().connect()).rejects.toBeInstanceOf(ProtocolNotImplementedError);
    await expect(
      new WebBluetoothAdapter({ service: 's', characteristic: 'c' }).connect(),
    ).rejects.toBeInstanceOf(ProtocolNotImplementedError);
  });
  it('Web Serial/Bluetooth ohne Browser-Unterstützung ⇒ unsupported', async () => {
    const dec = new SimpleFrameCodec();
    await expect(new WebSerialAdapter({ decoder: dec }).connect()).rejects.toMatchObject({
      code: 'unsupported',
    });
    await expect(
      new WebBluetoothAdapter({ decoder: dec, service: 's', characteristic: 'c' }).connect(),
    ).rejects.toMatchObject({ code: 'unsupported' });
  });
});
