import { deflateRawSync, inflateRawSync } from 'node:zlib';
import type { BlobCodec } from '@buildr/core';

/** Serverseitige Kompression für BFB1 (deflate-raw; im Browser per `CompressionStream('deflate-raw')`). */
export const DEFLATE: BlobCodec = {
  id: 1,
  compress: (raw) => deflateRawSync(raw),
  decompress: (packed) => inflateRawSync(packed, { maxOutputLength: 512 * 1024 * 1024 }),
};

export const SERVER_CODECS: BlobCodec[] = [DEFLATE];
