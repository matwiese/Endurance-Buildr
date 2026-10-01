import type { ForceTrace } from '../types.ts';

/**
 * BFB1 – Binärformat für Kraftaufnahmen (rein, ohne Plattform-APIs; die Kompression wird injiziert).
 *
 * Aufbau (little endian):
 *   "BFB1" | version u8 | compression u8 | reserved u16 | headerLen u32 | header (UTF-8 JSON) | payload
 * Payload (roh): je Kanal `n` Zigzag-Varints der Differenzen quantisierter Werte (round(v · scale)).
 * Kraft: scale 1000 (1 mN; > 1000× unter dem Sensorrauschen), CoP: scale 100 (0,01 mm). Die Kompression (0 = keine,
 * 1 = deflate-raw) betrifft nur den Payload. Der Header enthält CRC-32 des rohen Payloads zur Integritätsprüfung.
 */
export const BFB1_MAGIC = 'BFB1';
export const BFB1_VERSION = 1;
export const BFB1_FIXED_HEADER = 12;

export type BlobCompression = 0 | 1;

export interface BlobChannel {
  name: 'left' | 'right' | 'copX' | 'copY';
  scale: number;
}

export interface BlobHeader {
  hz: number;
  n: number;
  channels: BlobChannel[];
  breaks: number[];
  /** CRC-32 (unsigned) über den rohen (unkomprimierten) Payload */
  crc32: number;
}

/** Injizierte Kompression (z. B. `CompressionStream('deflate-raw')` im Browser, `zlib.deflateRawSync` auf dem Server). */
export interface BlobCodec {
  id: BlobCompression;
  compress(raw: Uint8Array): Promise<Uint8Array> | Uint8Array;
  decompress(packed: Uint8Array): Promise<Uint8Array> | Uint8Array;
}

export const NO_COMPRESSION: BlobCodec = { id: 0, compress: (b) => b, decompress: (b) => b };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

class ByteWriter {
  private buf = new Uint8Array(1 << 16);
  len = 0;
  private ensure(n: number): void {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < this.len + n) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  }
  /** vorzeichenloser Varint (bis 2^53) */
  varint(v: number): void {
    this.ensure(10);
    while (v >= 0x80) {
      this.buf[this.len++] = (v % 0x80) | 0x80;
      v = Math.floor(v / 0x80);
    }
    this.buf[this.len++] = v;
  }
  bytes(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

const zigzag = (d: number): number => (d >= 0 ? d * 2 : -d * 2 - 1);
const unzigzag = (z: number): number => (z % 2 === 0 ? z / 2 : -(z + 1) / 2);

function channelsOf(trace: ForceTrace): Array<{ ch: BlobChannel; data: ArrayLike<number> }> {
  const out: Array<{ ch: BlobChannel; data: ArrayLike<number> }> = [
    { ch: { name: 'left', scale: 1000 }, data: trace.left },
    { ch: { name: 'right', scale: 1000 }, data: trace.right },
  ];
  if (trace.copX && trace.copY) {
    out.push({ ch: { name: 'copX', scale: 100 }, data: trace.copX });
    out.push({ ch: { name: 'copY', scale: 100 }, data: trace.copY });
  }
  return out;
}

/** Roher (unkomprimierter) Payload + Header. */
export function encodeBlobParts(trace: ForceTrace): { header: BlobHeader; payload: Uint8Array } {
  const n = trace.left.length;
  if (trace.right.length !== n) throw new Error('left/right length mismatch');
  const chans = channelsOf(trace);
  const w = new ByteWriter();
  for (const { ch, data } of chans) {
    if (data.length !== n) throw new Error(`channel ${ch.name} length mismatch`);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const v = data[i]!;
      if (!Number.isFinite(v)) throw new Error(`non-finite value in ${ch.name}[${i}]`);
      const q = Math.round(v * ch.scale);
      w.varint(zigzag(q - prev));
      prev = q;
    }
  }
  const payload = w.bytes();
  return {
    header: {
      hz: trace.hz,
      n,
      channels: chans.map((c) => c.ch),
      breaks: [...(trace.breaks ?? [])],
      crc32: crc32(payload),
    },
    payload,
  };
}

export function decodeBlobParts(header: BlobHeader, payload: Uint8Array): ForceTrace {
  if (crc32(payload) !== header.crc32) throw new Error('BFB1: CRC mismatch');
  const n = header.n;
  let pos = 0;
  const readVarint = (): number => {
    let v = 0;
    let mul = 1;
    for (;;) {
      if (pos >= payload.length) throw new Error('BFB1: truncated payload');
      const b = payload[pos++]!;
      v += (b & 0x7f) * mul;
      if (b < 0x80) return v;
      mul *= 0x80;
    }
  };
  const cols: Record<string, Float32Array> = {};
  for (const ch of header.channels) {
    const out = new Float32Array(n);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      prev += unzigzag(readVarint());
      out[i] = prev / ch.scale;
    }
    cols[ch.name] = out;
  }
  if (!cols['left'] || !cols['right']) throw new Error('BFB1: missing force channels');
  const trace: ForceTrace = {
    hz: header.hz,
    left: cols['left'],
    right: cols['right'],
    breaks: [...header.breaks],
  };
  if (cols['copX'] && cols['copY']) {
    trace.copX = cols['copX'];
    trace.copY = cols['copY'];
  }
  return trace;
}

/** Container zusammensetzen. `payload` ist bereits gemäß `compression` komprimiert. */
export function packBlob(header: BlobHeader, payload: Uint8Array, compression: BlobCompression): Uint8Array {
  const h = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(BFB1_FIXED_HEADER + h.length + payload.length);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) out[i] = BFB1_MAGIC.charCodeAt(i);
  out[4] = BFB1_VERSION;
  out[5] = compression;
  dv.setUint16(6, 0, true);
  dv.setUint32(8, h.length, true);
  out.set(h, BFB1_FIXED_HEADER);
  out.set(payload, BFB1_FIXED_HEADER + h.length);
  return out;
}

export interface ParsedBlob {
  header: BlobHeader;
  compression: BlobCompression;
  /** Payload wie gespeichert (ggf. komprimiert) */
  payload: Uint8Array;
}

export function parseBlob(bytes: Uint8Array): ParsedBlob {
  if (bytes.length < BFB1_FIXED_HEADER) throw new Error('BFB1: too short');
  for (let i = 0; i < 4; i++) if (bytes[i] !== BFB1_MAGIC.charCodeAt(i)) throw new Error('BFB1: bad magic');
  if (bytes[4] !== BFB1_VERSION) throw new Error(`BFB1: unsupported version ${bytes[4]}`);
  const compression = bytes[5] as BlobCompression;
  if (compression !== 0 && compression !== 1) throw new Error(`BFB1: unknown compression ${compression}`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hl = dv.getUint32(8, true);
  if (BFB1_FIXED_HEADER + hl > bytes.length) throw new Error('BFB1: header exceeds blob');
  const header = JSON.parse(
    new TextDecoder().decode(bytes.subarray(BFB1_FIXED_HEADER, BFB1_FIXED_HEADER + hl)),
  ) as BlobHeader;
  if (!(header.hz > 0) || !Number.isInteger(header.n) || header.n < 0 || !Array.isArray(header.channels))
    throw new Error('BFB1: invalid header');
  return { header, compression, payload: bytes.subarray(BFB1_FIXED_HEADER + hl) };
}

export async function encodeBlob(trace: ForceTrace, codec: BlobCodec = NO_COMPRESSION): Promise<Uint8Array> {
  const { header, payload } = encodeBlobParts(trace);
  return packBlob(header, await codec.compress(payload), codec.id);
}

export async function decodeBlob(bytes: Uint8Array, codecs: BlobCodec[] = []): Promise<ForceTrace> {
  const { header, compression, payload } = parseBlob(bytes);
  let raw = payload;
  if (compression !== 0) {
    const codec = codecs.find((c) => c.id === compression);
    if (!codec) throw new Error(`BFB1: no codec for compression ${compression}`);
    raw = await codec.decompress(payload);
  }
  return decodeBlobParts(header, raw);
}
