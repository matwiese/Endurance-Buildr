import { NO_COMPRESSION, type BlobCodec } from '@buildr/core';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** deflate-raw über die Browser-Streams (ältere Umgebungen ohne `CompressionStream`: unkomprimiert). */
export const BROWSER_CODEC: BlobCodec =
  typeof CompressionStream === 'undefined'
    ? NO_COMPRESSION
    : {
        id: 1,
        compress: (raw) => pipe(raw, new CompressionStream('deflate-raw')),
        decompress: (packed) => pipe(packed, new DecompressionStream('deflate-raw')),
      };
