import { createHash } from 'node:crypto';
import { crc32, parseBlob } from '@buildr/core';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { audit } from '../audit.ts';
import { canAccessGroups } from '../auth/permissions.ts';
import { recordings } from '../db/schema.ts';
import { HttpError, notFound, paramId, parse, requireCan } from '../http.ts';
import { SERVER_CODECS } from '../storage/codec.ts';
import { assertProfileAccess, groupIdsOfProfile } from './profiles.ts';

const putQuery = z.object({ profileId: z.uuid().optional() });

export const recordingRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (api) => {
    const { db, blobs } = ctx;

    /** Roh-Aufnahme (BFB1) hochladen. Idempotent: gleiche ID + gleicher Inhalt → 200; anderer Inhalt → 409. */
    api.put('/recordings/:id', async (req, reply) => {
      const p = requireCan(req, 'test.write');
      const id = paramId(req);
      const { profileId } = parse(putQuery, req.query);
      if (!Buffer.isBuffer(req.body)) throw new HttpError(415, 'octet_stream_required');
      const bytes = new Uint8Array(req.body.buffer, req.body.byteOffset, req.body.byteLength);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const claimed = req.headers['x-content-sha256'];
      if (typeof claimed === 'string' && claimed.toLowerCase() !== sha256)
        throw new HttpError(422, 'checksum_mismatch');

      // Struktur und Integrität prüfen (Magic, Header, CRC des entpackten Payloads)
      let parsed;
      try {
        parsed = parseBlob(bytes);
      } catch (e) {
        throw new HttpError(422, 'blob_invalid', (e as Error).message);
      }
      const { header, compression, payload } = parsed;
      if (header.hz < 50 || header.hz > 20_000 || header.n > 20_000 * 3600)
        throw new HttpError(422, 'blob_invalid', 'implausible header');
      let raw = payload;
      if (compression !== 0) {
        const codec = SERVER_CODECS.find((c) => c.id === compression);
        if (!codec) throw new HttpError(422, 'blob_invalid', 'unsupported compression');
        try {
          raw = new Uint8Array(await codec.decompress(payload));
        } catch {
          throw new HttpError(422, 'blob_invalid', 'decompression failed');
        }
      }
      if (crc32(raw) !== header.crc32) throw new HttpError(422, 'blob_invalid', 'CRC mismatch');
      if (raw.length < header.n * header.channels.length)
        throw new HttpError(422, 'blob_invalid', 'payload too short');

      if (profileId) await assertProfileAccess(db, req, profileId, 'write');

      const [ex] = await db.select().from(recordings).where(eq(recordings.id, id));
      if (ex) {
        if (ex.orgId !== p.orgId) throw notFound();
        if (ex.sha256 !== sha256) throw new HttpError(409, 'recording_exists');
        return reply.send({ status: 'unchanged' });
      }
      const key = `${p.orgId}/${id}.bfb`;
      await blobs.put(key, bytes);
      await db.insert(recordings).values({
        id,
        orgId: p.orgId,
        profileId: profileId ?? null,
        hz: Math.round(header.hz),
        nSamples: header.n,
        compression,
        sizeBytes: bytes.length,
        sha256,
        storageKey: key,
        uploadedBy: p.id,
      });
      await audit(db, req, {
        orgId: p.orgId,
        action: 'recording.upload',
        entity: 'recording',
        entityId: id,
        details: { bytes: bytes.length },
      });
      return reply.status(201).send({ status: 'created', sha256 });
    });

    api.get('/recordings/:id', async (req, reply) => {
      const p = requireCan(req, 'test.read');
      const id = paramId(req);
      const [rec] = await db
        .select()
        .from(recordings)
        .where(and(eq(recordings.id, id), eq(recordings.orgId, p.orgId)));
      if (!rec) throw notFound();
      if (rec.profileId) {
        if (!canAccessGroups(p, await groupIdsOfProfile(db, rec.profileId), 'read')) throw notFound();
      } else if (p.groupScope === 'restricted' && rec.uploadedBy !== p.id) {
        throw notFound();
      }
      const data = await blobs.get(rec.storageKey);
      if (!data) throw new HttpError(410, 'blob_missing');
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('ETag', `"${rec.sha256}"`)
        .header('Content-Length', String(data.length))
        .send(Buffer.from(data));
    });
  };
