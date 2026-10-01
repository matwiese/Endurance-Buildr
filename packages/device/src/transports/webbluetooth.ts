import { BaseAdapter, DeviceError, type DeviceInfo } from '../types.ts';
import { ProtocolNotImplementedError, type FrameDecoder } from './decoder.ts';

export interface WebBluetoothAdapterOptions {
  decoder?: FrameDecoder;
  /** GATT-Service und Notify-Characteristic der Platten (herstellerspezifisch – vom Integrator einzutragen) */
  service: BluetoothServiceUUID;
  characteristic: BluetoothCharacteristicUUID;
  filters?: BluetoothLEScanFilter[];
  hz?: number;
  name?: string;
}

/**
 * Transport-Stub: Bluetooth-LE-Platten über Web Bluetooth. Abonniert Notifications der angegebenen Characteristic und reicht die
 * Bytes an den `FrameDecoder`. UUIDs und Protokoll sind herstellerspezifisch und deshalb Pflichtangaben des Integrators.
 */
export class WebBluetoothAdapter extends BaseAdapter {
  readonly info: DeviceInfo;
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private handler: ((ev: Event) => void) | null = null;
  private readonly o: WebBluetoothAdapterOptions;

  constructor(o: WebBluetoothAdapterOptions) {
    super();
    this.o = o;
    this.info = {
      kind: 'webbluetooth',
      name: o.name ?? 'Web Bluetooth',
      serial: 'ble',
      plates: 2,
      supportedHz: [200, 500, 1000],
      hasCorners: false,
    };
    this._status = { ...this._status, samplingHz: o.hz ?? 1000 };
  }

  async connect(): Promise<void> {
    const decoder = this.o.decoder;
    if (!decoder) throw new ProtocolNotImplementedError('WebBluetoothAdapter');
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator))
      throw new DeviceError('Web Bluetooth wird von diesem Browser nicht unterstützt', 'unsupported');
    this.updateStatus({ connection: 'connecting' });
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: this.o.filters ?? [{ services: [this.o.service] }],
        optionalServices: [this.o.service],
      });
      this.device.addEventListener('gattserverdisconnected', () =>
        this.updateStatus({ connection: 'disconnected' }),
      );
      const server = await this.device.gatt!.connect();
      const service = await server.getPrimaryService(this.o.service);
      this.characteristic = await service.getCharacteristic(this.o.characteristic);
      decoder.reset();
      this.handler = (ev: Event) => {
        const v = (ev.target as BluetoothRemoteGATTCharacteristic).value;
        if (!v) return;
        const samples = decoder.push(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
        if (samples.length) this.emitSamples(samples);
      };
      this.characteristic.addEventListener('characteristicvaluechanged', this.handler);
      await this.characteristic.startNotifications();
      this.updateStatus({ connection: 'connected', error: undefined });
    } catch (e) {
      this.updateStatus({ connection: 'error', error: String(e) });
      throw new DeviceError(`Bluetooth-Verbindung fehlgeschlagen: ${String(e)}`, 'transport');
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.characteristic && this.handler) {
        this.characteristic.removeEventListener('characteristicvaluechanged', this.handler);
        await this.characteristic.stopNotifications();
      }
      this.device?.gatt?.disconnect();
    } finally {
      this.updateStatus({ connection: 'disconnected' });
    }
  }
}
