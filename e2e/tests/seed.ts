import { randomUUID } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import {
  analyzeRecording,
  encodeBlob,
  jumpTrial,
  renderScript,
  standProfile,
  withRest,
  type BlobCodec,
} from '@buildr/core';
import { ANALYSIS_VERSION } from '@buildr/shared';
import { expect, type APIRequestContext } from '@playwright/test';

const deflate: BlobCodec = { id: 1, compress: (b) => deflateRawSync(b), decompress: (b) => b };

export interface SeedProfile {
  id: string;
  name: string;
}

/** Legt (als angemeldeter Admin) Kategorie, Gruppen und Athleten per API an. */
export async function seedGroupsAndProfiles(
  request: APIRequestContext,
  stamp: string,
  spec: Array<{ group: string; people: Array<{ name: string; sex: 'f' | 'm'; dob: string; sport: string }> }>,
): Promise<{
  groups: Array<{ id: string; name: string }>;
  profiles: Array<SeedProfile & { groupId: string }>;
}> {
  const categoryId = randomUUID();
  expect(
    (
      await request.put(`/api/reference/categories/${categoryId}`, {
        data: { id: categoryId, name: `Bericht ${stamp}` },
      })
    ).ok(),
  ).toBe(true);
  const groups: Array<{ id: string; name: string }> = [];
  const profiles: Array<SeedProfile & { groupId: string }> = [];
  const now = new Date().toISOString();
  for (const g of spec) {
    const gid = randomUUID();
    const name = `${g.group} ${stamp}`;
    expect(
      (await request.put(`/api/reference/groups/${gid}`, { data: { id: gid, categoryId, name } })).ok(),
    ).toBe(true);
    groups.push({ id: gid, name });
    for (const p of g.people) {
      const id = randomUUID();
      const body = {
        id,
        name: `${p.name} ${stamp}`,
        dateOfBirth: p.dob,
        sex: p.sex,
        heightCm: 172,
        weightKg: 70,
        sport: p.sport,
        email: null,
        notes: null,
        externalId: null,
        allowPhotoVideo: false,
        guardianConsent: false,
        healthConsentAt: now,
        groupIds: [gid],
        createdAt: now,
        updatedAt: now,
      };
      const r = await request.put(`/api/profiles/${id}`, { data: body });
      expect(r.status(), await r.text()).toBe(201);
      profiles.push({ id, name: body.name, groupId: gid });
    }
  }
  return { groups, profiles };
}

/** Lädt einen simulierten CMJ (Aufnahme + Test) für einen Athleten mit festem Zeitpunkt hoch. Gibt die Test-ID zurück. */
export async function uploadSyntheticTest(
  request: APIRequestContext,
  o: {
    profileId: string;
    createdAt: string;
    jumpHeightM: number;
    mass?: number;
    seed: number;
    sessionId?: string;
  },
): Promise<string> {
  const mass = o.mass ?? 70;
  const base = { mass };
  const profiles = [
    standProfile(mass, 1.5),
    ...withRest(base, jumpTrial({ ...base, jumpHeight: o.jumpHeightM }), 0.1, 2),
  ];
  const { trace } = renderScript(profiles, { hz: 1000, seed: o.seed, athlete: { bodyMass: mass } });
  const analysis = analyzeRecording(trace, { mode: 'cmj', bodyMassKg: mass });
  const recordingId = randomUUID();
  const blob = await encodeBlob(trace, deflate);
  const up = await request.put(`/api/recordings/${recordingId}?profileId=${o.profileId}`, {
    data: Buffer.from(blob),
    headers: { 'content-type': 'application/octet-stream' },
  });
  expect(up.ok(), await up.text()).toBe(true);
  const id = randomUUID();
  const test = {
    id,
    profileId: o.profileId,
    sessionId: o.sessionId ?? null,
    testType: 'cmj',
    detectedType: null,
    bodyMassKg: mass,
    externalLoadKg: 0,
    samplingHz: 1000,
    deviceSerial: 'SIM-E2E',
    createdAt: o.createdAt,
    tagIds: [],
    conditions: {},
    recordingId,
    zeroOffsets: { left: 0, right: 0 },
    notes: null,
    analysisVersion: ANALYSIS_VERSION,
    reps: analysis.reps.map((r, i) => ({
      id: randomUUID(),
      index: i,
      startIdx: r.startIdx,
      endIdx: r.endIdx,
      included: true,
      type: r.type,
      confidence: r.confidence,
      side: r.side,
      events: r.events,
      metrics: r.metrics,
      warnings: r.warnings,
    })),
  };
  const res = await request.put(`/api/tests/${id}`, { data: test });
  expect(res.status(), await res.text()).toBe(201);
  return id;
}
