import { BaseAdapter, DeviceError, type DeviceInfo } from '../types.ts';
import { ProtocolNotImplementedError, type FrameDecoder } from './decoder.ts';

export interface WebSocketAdapterOptions {
  url: string;
  /** Protokoll-Decoder (Pflicht – das Plattenprotokoll ist proprietär) */
  decoder?: FrameDecoder;
  hz?: number;
  name?: string;
  /** injizierbar für Tests */
  WebSocketImpl?: typeof WebSocket;
}

/**
 * Transport-Stub: Binärdaten über WebSocket (z. B. Gateway/Bridge vor den Platten). Implementiert die Verbindungs-/Statuslogik;
 * die Bytes → Sample-Übersetzung liefert der `FrameDecoder`. Ohne Decoder wirft `connect()` `ProtocolNotImplementedError`.
 */
export class WebSocketAdapter extends BaseAdapter {
  readonly info: DeviceInfo;
  private ws: WebSocket | null = null;
  private readonly o: WebSocketAdapterOptions;

  constructor(o: WebSocketAdapterOptions) {
    super();
    this.o = o;
    this.info = {
      kind: 'websocket',
      name: o.name ?? `WebSocket ${o.url}`,
      serial: o.url,
      plates: 2,
      supportedHz: [200, 500, 1000],
      hasCorners: false,
    };
    this._status = { ...this._status, samplingHz: o.hz ?? 1000 };
  }

  async connect(): Promise<void> {
    const decoder = this.o.decoder;
    if (!decoder) throw new ProtocolNotImplementedError('WebSocketAdapter');
    const Impl = this.o.WebSocketImpl ?? (typeof WebSocket !== 'undefined' ? WebSocket : undefined);
    if (!Impl) throw new DeviceError('WebSocket nicht verfügbar', 'unsupported');
    this.updateStatus({ connection: 'connecting' });
    await new Promise<void>((resolve, reject) => {
      const ws = new Impl(this.o.url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = () => {
        decoder.reset();
        this.updateStatus({ connection: 'connected', error: undefined });
        resolve();
      };
      ws.onerror = () => {
        this.updateStatus({ connection: 'error', error: 'WebSocket-Fehler' });
        reject(new DeviceError('WebSocket-Verbindung fehlgeschlagen', 'transport'));
      };
      ws.onclose = () => {
        if (this._status.connection === 'connected') this.updateStatus({ connection: 'disconnected' });
      };
      ws.onmessage = (ev: MessageEvent) => {
        if (typeof ev.data === 'string') return; // nur Binärframes
        const samples = decoder.push(new Uint8Array(ev.data as ArrayBuffer));
        if (samples.length) {
          this.updateStatus({
            packetLoss: {
              lost: this._status.packetLoss.lost,
              received: this._status.packetLoss.received + samples.length,
            },
          });
          this.emitSamples(samples);
        }
      };
    });
  }

  async disconnect(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    this.updateStatus({ connection: 'disconnected' });
  }
}
