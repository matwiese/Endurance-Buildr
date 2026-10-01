import type { Sample } from '../types.ts';

/**
 * Protokoll-Decoder: macht aus rohen Transportbytes (beliebig zerstückelt) Samples. Das Protokoll echter Platten ist
 * proprietär – ein Integrator liefert hier seine Implementierung. `SimpleFrameCodec` ist ein eigenes Beispielprotokoll
 * (NICHT das eines Herstellers) für Tests und als Vorlage.
 */
export interface FrameDecoder {
  /** Bytes anhängen; vollständige Frames als Samples zurückgeben */
  push(bytes: Uint8Array): Sample[];
  reset(): void;
  /** Anzahl verworfener (CRC/Sync) Bytes – optional für Statusanzeigen */
  readonly discardedBytes?: number;
}

export class ProtocolNotImplementedError extends Error {
  constructor(adapter: string) {
    super(
      `${adapter}: kein FrameDecoder angegeben. Das Plattenprotokoll ist proprietär – ` +
        'implementiere FrameDecoder (siehe docs/hardware-adapters.md) und übergib ihn dem Adapter.',
    );
    this.name = 'ProtocolNotImplementedError';
  }
}

// ───────────── Beispielprotokoll „BF1“ (eigene Erfindung für Tests/Vorlage) ─────────────
// Frame: [0xB5 0x46] [flags u8] [seq u16le] [t u32le µs] [left f32le] [right f32le] ([8×f32le Ecken]) [crc8]
//   flags bit0 = Eckensensoren vorhanden. crc8: Polynom 0x07 über alle Bytes ab flags.
const MAGIC0 = 0xb5;
const MAGIC1 = 0x46;

export function crc8(data: Uint8Array, start = 0, end = data.length): number {
  let crc = 0;
  for (let i = start; i < end; i++) {
    crc ^= data[i]!;
    for (let b = 0; b < 8; b++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

export function encodeSimpleFrame(s: Sample): Uint8Array {
  const corners = s.corners && s.corners.length === 8;
  const len = 2 + 1 + 2 + 4 + 8 + (corners ? 32 : 0) + 1;
  const buf = new Uint8Array(len);
  const dv = new DataView(buf.buffer);
  buf[0] = MAGIC0;
  buf[1] = MAGIC1;
  buf[2] = corners ? 1 : 0;
  dv.setUint16(3, (s.seq ?? 0) & 0xffff, true);
  dv.setUint32(5, Math.round(s.t) >>> 0, true);
  dv.setFloat32(9, s.left, true);
  dv.setFloat32(13, s.right, true);
  if (corners) for (let i = 0; i < 8; i++) dv.setFloat32(17 + i * 4, s.corners![i]!, true);
  buf[len - 1] = crc8(buf, 2, len - 1);
  return buf;
}

export class SimpleFrameCodec implements FrameDecoder {
  private buf = new Uint8Array(0);
  private wraps = 0;
  private lastT = -1;
  discardedBytes = 0;

  reset(): void {
    this.buf = new Uint8Array(0);
    this.wraps = 0;
    this.lastT = -1;
  }

  push(bytes: Uint8Array): Sample[] {
    const merged = new Uint8Array(this.buf.length + bytes.length);
    merged.set(this.buf);
    merged.set(bytes, this.buf.length);
    this.buf = merged;
    const out: Sample[] = [];
    let i = 0;
    const b = this.buf;
    while (i + 3 <= b.length) {
      if (b[i] !== MAGIC0 || b[i + 1] !== MAGIC1) {
        i++;
        this.discardedBytes++;
        continue;
      }
      const corners = (b[i + 2]! & 1) === 1;
      const len = 2 + 1 + 2 + 4 + 8 + (corners ? 32 : 0) + 1;
      if (i + len > b.length) break; // unvollständig
      if (crc8(b, i + 2, i + len - 1) !== b[i + len - 1]) {
        i++; // CRC-Fehler ⇒ ab nächstem Byte neu synchronisieren
        this.discardedBytes++;
        continue;
      }
      const dv = new DataView(b.buffer, b.byteOffset + i, len);
      const seq = dv.getUint16(3, true);
      let t = dv.getUint32(5, true);
      if (this.lastT >= 0 && t + 2 ** 31 < this.lastT) this.wraps++; // u32-Überlauf (≈ 71,6 min)
      this.lastT = t;
      t += this.wraps * 2 ** 32;
      const s: Sample = { t, left: dv.getFloat32(9, true), right: dv.getFloat32(13, true), seq };
      if (corners) s.corners = Array.from({ length: 8 }, (_, k) => dv.getFloat32(17 + k * 4, true));
      out.push(s);
      i += len;
    }
    this.buf = b.slice(i);
    return out;
  }
}
