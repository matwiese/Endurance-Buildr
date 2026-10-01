import { BaseAdapter, DeviceError, type DeviceInfo } from '../types.ts';
import { ProtocolNotImplementedError, type FrameDecoder } from './decoder.ts';

export interface WebSerialAdapterOptions {
  decoder?: FrameDecoder;
  baudRate?: number;
  filters?: SerialPortFilter[];
  hz?: number;
  name?: string;
}

/**
 * Transport-Stub: USB/serielle Platten über die Web-Serial-API (Chromium). Der Adapter öffnet den Port (Nutzergeste nötig),
 * liest den Byte-Strom und reicht ihn an den `FrameDecoder` – das Protokoll selbst ist nicht enthalten.
 */
export class WebSerialAdapter extends BaseAdapter {
  readonly info: DeviceInfo;
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private running = false;
  private readonly o: WebSerialAdapterOptions;

  constructor(o: WebSerialAdapterOptions = {}) {
    super();
    this.o = o;
    this.info = {
      kind: 'webserial',
      name: o.name ?? 'Web Serial',
      serial: 'serial',
      plates: 2,
      supportedHz: [200, 500, 1000],
      hasCorners: false,
    };
    this._status = { ...this._status, samplingHz: o.hz ?? 1000 };
  }

  async connect(): Promise<void> {
    const decoder = this.o.decoder;
    if (!decoder) throw new ProtocolNotImplementedError('WebSerialAdapter');
    if (typeof navigator === 'undefined' || !('serial' in navigator))
      throw new DeviceError('Web Serial wird von diesem Browser nicht unterstützt', 'unsupported');
    this.updateStatus({ connection: 'connecting' });
    try {
      this.port = await navigator.serial.requestPort({ filters: this.o.filters ?? [] });
      await this.port.open({ baudRate: this.o.baudRate ?? 921600 });
    } catch (e) {
      this.updateStatus({ connection: 'error', error: String(e) });
      throw new DeviceError(`Serielle Verbindung fehlgeschlagen: ${String(e)}`, 'transport');
    }
    decoder.reset();
    this.updateStatus({ connection: 'connected', error: undefined });
    this.running = true;
    void this.readLoop(decoder);
  }

  private async readLoop(decoder: FrameDecoder): Promise<void> {
    while (this.running && this.port?.readable) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            const samples = decoder.push(value);
            if (samples.length) this.emitSamples(samples);
          }
        }
      } catch (e) {
        this.updateStatus({ connection: 'error', error: String(e) });
      } finally {
        this.reader?.releaseLock();
      }
    }
  }

  async disconnect(): Promise<void> {
    this.running = false;
    try {
      await this.reader?.cancel();
      await this.port?.close();
    } finally {
      this.port = null;
      this.updateStatus({ connection: 'disconnected' });
    }
  }
}
