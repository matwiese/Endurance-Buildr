import { TEST_TYPES } from '@buildr/core';
import { z } from 'zod';
import type { CategoryDTO, GroupDTO, ProfileDTO, Role, TagDTO, TagTypeDTO } from './model.ts';

/** Eingabe-Schemata der HTTP-API (Server validiert, Web nutzt die abgeleiteten Typen). */
const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.uuid();
const text = (max: number) => z.string().max(max);
const finite = z.number().finite();

export const roleSchema = z.enum(['admin', 'tester', 'viewer']);
export const sexSchema = z.enum(['f', 'm', 'd']);
export const testTypeSchema = z.enum(TEST_TYPES);

export const loginInput = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });
export const setupInput = z.object({
  organization: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});
export const passwordChangeInput = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(1).max(200),
});

export const userCreateInput = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
  role: roleSchema,
  groupScope: z.enum(['all', 'restricted']).default('all'),
  access: z.array(z.object({ groupId: id, access: z.enum(['read', 'write']) })).default([]),
});
export const userPatchInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
  groupScope: z.enum(['all', 'restricted']).optional(),
  access: z.array(z.object({ groupId: id, access: z.enum(['read', 'write']) })).optional(),
  password: z.string().min(1).max(200).optional(),
});

export const categoryInput = z.object({ id, name: z.string().trim().min(1).max(120) });
export const groupInput = z.object({ id, categoryId: id, name: z.string().trim().min(1).max(120) });
export const tagTypeInput = z.object({ id, name: z.string().trim().min(1).max(120) });
export const tagInput = z.object({ id, tagTypeId: id, name: z.string().trim().min(1).max(120) });

export const profileInput = z.object({
  id,
  name: z.string().trim().min(1).max(200),
  dateOfBirth: isoDate.nullable(),
  sex: sexSchema.nullable(),
  heightCm: z.number().min(30).max(260).nullable(),
  weightKg: z.number().min(10).max(400).nullable(),
  sport: text(120).nullable(),
  email: z
    .email()
    .max(254)
    .nullable()
    .or(z.literal('').transform(() => null)),
  notes: text(4000).nullable(),
  externalId: text(120).nullable(),
  allowPhotoVideo: z.boolean(),
  guardianConsent: z.boolean(),
  healthConsentAt: isoDateTime.nullable(),
  healthConsentVersion: z.string().max(40).nullable().optional(),
  groupIds: z.array(id).min(1).max(50),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const warningSchema = z.object({
  code: z.string().max(80),
  severity: z.enum(['info', 'warning', 'error']),
  at: finite.optional(),
  params: z.record(z.string(), z.union([z.string(), finite])).optional(),
});

export const repInput = z.object({
  id,
  index: z.number().int().min(0).max(100_000),
  startIdx: z.number().int().min(0),
  endIdx: z.number().int().min(0),
  included: z.boolean(),
  type: z.union([testTypeSchema, z.literal('unclear')]),
  confidence: z.number().min(0).max(1).nullable(),
  side: z.enum(['left', 'right', 'both']),
  events: z.record(z.string().max(60), finite),
  metrics: z.record(z.string().max(80), finite.nullable()),
  warnings: z.array(warningSchema).max(100),
  leadIn: z.boolean().optional(),
  hopIndex: z.number().int().optional(),
});

export const testInput = z.object({
  id,
  profileId: id.nullable(),
  sessionId: id.nullable(),
  testType: testTypeSchema,
  detectedType: z.union([testTypeSchema, z.literal('unclear')]).nullable(),
  bodyMassKg: z.number().min(10).max(400).nullable(),
  externalLoadKg: z.number().min(0).max(1000),
  samplingHz: z.number().int().min(50).max(20_000),
  deviceSerial: text(120).nullable(),
  createdAt: isoDateTime,
  tagIds: z.array(id).max(100),
  conditions: z.object({
    eyesClosed: z.boolean().optional(),
    unstableSurface: z.boolean().optional(),
    dualTask: z.boolean().optional(),
  }),
  recordingId: id,
  zeroOffsets: z.object({ left: finite, right: finite }),
  notes: text(4000).nullable(),
  reps: z.array(repInput).max(500),
  analysisVersion: z.string().max(40),
});

export const testPatchInput = z.object({
  notes: text(4000).nullable().optional(),
  tagIds: z.array(id).max(100).optional(),
  profileId: id.nullable().optional(),
  reps: z
    .array(z.object({ id, included: z.boolean() }))
    .max(500)
    .optional(),
});

export const sessionInput = z.object({
  id,
  name: z.string().trim().min(1).max(160),
  mode: z.union([testTypeSchema, z.literal('auto')]),
  externalLoadKg: z.number().min(0).max(1000),
  groupId: id.nullable(),
  status: z.enum(['active', 'paused', 'finished']),
  queue: z
    .array(z.object({ profileId: id, status: z.enum(['waiting', 'testing', 'done', 'skipped']) }))
    .max(500),
  board: z.object({
    metric: z.string().max(80).nullable(),
    testType: testTypeSchema.nullable(),
    aggregate: z.enum(['best', 'last', 'mean']),
  }),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  finishedAt: isoDateTime.nullable(),
});

export const normRowInput = z.object({
  testType: testTypeSchema,
  metric: z.string().min(1).max(80),
  sex: sexSchema.nullable(),
  ageMin: z.number().int().min(0).max(120).nullable(),
  ageMax: z.number().int().min(0).max(120).nullable(),
  sport: z.string().max(120).nullable(),
  n: z.number().int().min(0).nullable(),
  mean: finite.nullable(),
  sd: finite.positive().nullable(),
  pct: z.object({
    5: finite.optional(),
    10: finite.optional(),
    25: finite.optional(),
    50: finite.optional(),
    75: finite.optional(),
    90: finite.optional(),
    95: finite.optional(),
  }),
});

export const normSetInput = z.object({
  id,
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2000).nullable(),
  rows: z.array(normRowInput).min(1).max(20_000),
});

export type LoginInput = z.infer<typeof loginInput>;
export type SetupInput = z.infer<typeof setupInput>;
export type UserCreateInput = z.infer<typeof userCreateInput>;
export type UserPatchInput = z.infer<typeof userPatchInput>;
export type TestInput = z.infer<typeof testInput>;
export type TestPatchInput = z.infer<typeof testPatchInput>;
export type ProfileInput = z.infer<typeof profileInput>;
export type SessionInput = z.infer<typeof sessionInput>;
export type NormSetInput = z.infer<typeof normSetInput>;

/** Antwort von `GET /api/auth/me` */
export interface MeDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  groupScope: 'all' | 'restricted';
  organization: { id: string; name: string };
  access: Array<{ groupId: string; access: 'read' | 'write' }>;
}

/** Antwort von `GET /api/sync/pull` */
export interface SyncPullDTO {
  /** nächster `since`-Wert */
  cursor: number;
  /** true bei `since = 0`: der Client ersetzt seinen Bestand */
  full: boolean;
  profiles: ProfileDTO[];
  categories: CategoryDTO[];
  groups: GroupDTO[];
  tagTypes: TagTypeDTO[];
  tags: TagDTO[];
  deleted: Array<{ entity: 'profile' | 'category' | 'group' | 'tagType' | 'tag'; id: string }>;
}
