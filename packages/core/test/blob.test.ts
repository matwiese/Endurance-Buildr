import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  NO_COMPRESSION,
  crc32,
  decodeBlob,
  encodeBlob,
  encodeBlobParts,
  jumpTrial,
  packBlob,
  parseBlob,
  renderScript,
  standProfile,
  withRest,
  type BlobCodec,
} from '../src/index.ts';

const deflate: BlobCodec = {
  id: 1,
  compress: (b) => deflateRawSync(b),
  decompress: (b) => inflateRawSync(b),
};

const sample = () => {
  const base = { mass: 80 };
  const r = renderScript(
    [standProfile(80, 1), ...withRest(base, jumpTrial({ ...base, jumpHeight: 0.3 }), 0.1, 1)],
    {
      hz: 1000,
      seed: 4,
      athlete: { bodyMass: 80 },
    },
  );
  return r.trace;
};

describe('BFB1', () => {
  it('Roundtrip (roh): Kraft auf 1 mN genau, Breaks bleiben erhalten', async () => {
    const t = { ...sample(), breaks: [120, 900] };
    const back = await decodeBlob(await encodeBlob(t));
    expect(back.hz).toBe(t.hz);
    expect(back.left.length).toBe(t.left.length);
    expect(back.breaks).toEqual([120, 900]);
    let maxErr = 0;
    for (let i = 0; i < t.left.length; i++) {
      maxErr = Math.max(maxErr, Math.abs(back.left[i]! - t.left[i]!), Math.abs(back.right[i]! - t.right[i]!));
    }
    expect(maxErr).toBeLessThan(0.0006);
  });

  it('Kompression (deflate) ist verlustfrei bezüglich des Rohpayloads und spart deutlich Platz', async () => {
    const t = sample();
    const raw = await encodeBlob(t, NO_COMPRESSION);
    const packed = await encodeBlob(t, deflate);
    const floats = t.left.length * 2 * 4;
    console.log(`Float32 ${floats} B → BFB1 roh ${raw.length} B → deflate ${packed.length} B`);
    expect(packed.length).toBeLessThan(raw.length);
    expect(raw.length).toBeLessThan(floats);
    const a = await decodeBlob(raw);
    const b = await decodeBlob(packed, [deflate]);
    expect(Array.from(b.left)).toEqual(Array.from(a.left));
    expect(Array.from(b.right)).toEqual(Array.from(a.right));
  });

  it('CoP-Kanäle werden mitgeführt', async () => {
    const t = sample();
    const cop = Float32Array.from(t.left, (_, i) => Math.sin(i / 50) * 40);
    const back = await decodeBlob(await encodeBlob({ ...t, copX: cop, copY: cop.map((v) => v / 2) }));
    expect(back.copX![100]).toBeCloseTo(cop[100]!, 1);
    expect(back.copY![100]).toBeCloseTo(cop[100]! / 2, 1);
  });

  it('erkennt Manipulation (CRC), falsches Magic, Abschneiden und fehlenden Codec', async () => {
    const t = sample();
    const bytes = await encodeBlob(t);
    const bad = bytes.slice();
    bad[bad.length - 5] ^= 0xff;
    await expect(decodeBlob(bad)).rejects.toThrow(/CRC|truncated/);
    const magic = bytes.slice();
    magic[0] = 0x58;
    expect(() => parseBlob(magic)).toThrow(/magic/);
    expect(() => parseBlob(bytes.subarray(0, 8))).toThrow(/short/);
    const { header, payload } = encodeBlobParts(t);
    const packed = packBlob(header, deflateRawSync(payload), 1);
    await expect(decodeBlob(packed, [])).rejects.toThrow(/no codec/);
    await expect(decodeBlob(bytes.subarray(0, bytes.length - 100))).rejects.toThrow();
  });

  it('lehnt NaN/Infinity und ungleiche Kanallängen ab', () => {
    expect(() =>
      encodeBlobParts({ hz: 1000, left: Float32Array.of(1, NaN), right: Float32Array.of(1, 2) }),
    ).toThrow(/non-finite/);
    expect(() =>
      encodeBlobParts({ hz: 1000, left: Float32Array.of(1, 2), right: Float32Array.of(1) }),
    ).toThrow(/mismatch/);
  });

  it('CRC-32 entspricht dem Standardwert ("123456789" → CBF43926)', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});
