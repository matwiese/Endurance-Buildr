import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnalysisWarning } from '@buildr/core';
import type {
  NormRow,
  Role,
  SessionBoard,
  SessionQueueEntry,
  SessionStatus,
  Sex,
  TestConditions,
} from '@buildr/shared';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** Monotone Änderungsnummer für die Sync-Pull-Schnittstelle (exakter als Zeitstempel). */
export const syncRev = pgSequence('sync_rev_seq');
const rev = () =>
  bigint('rev', { mode: 'number' })
    .notNull()
    .default(sql`nextval('sync_rev_seq')`);

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').$type<Role>().notNull(),
    /** 'all' = alle Gruppen der Organisation, 'restricted' = nur zugewiesene Gruppen */
    groupScope: text('group_scope').$type<'all' | 'restricted'>().notNull().default('all'),
    active: boolean('active').notNull().default(true),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastLoginAt: ts('last_login_at'),
  },
  (t) => [uniqueIndex('users_email_uq').on(sql`lower(${t.email})`), index('users_org_idx').on(t.orgId)],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    /** SHA-256 des Cookie-Tokens (das Token selbst wird nie gespeichert) */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    userAgent: text('user_agent'),
  },
  (t) => [index('auth_sessions_user_idx').on(t.userId)],
);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rev: rev(),
  },
  (t) => [index('categories_org_idx').on(t.orgId)],
);

export const groups = pgTable(
  'groups',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rev: rev(),
  },
  (t) => [index('groups_org_idx').on(t.orgId)],
);

export const userGroupAccess = pgTable(
  'user_group_access',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    access: text('access').$type<'read' | 'write'>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.groupId] })],
);

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    dateOfBirth: date('date_of_birth', { mode: 'string' }),
    sex: text('sex').$type<Sex>(),
    heightCm: doublePrecision('height_cm'),
    weightKg: doublePrecision('weight_kg'),
    sport: text('sport'),
    email: text('email'),
    notes: text('notes'),
    externalId: text('external_id'),
    allowPhotoVideo: boolean('allow_photo_video').notNull().default(false),
    guardianConsent: boolean('guardian_consent').notNull().default(false),
    healthConsentAt: ts('health_consent_at'),
    healthConsentVersion: text('health_consent_version'),
    createdAt: ts('created_at').notNull(),
    /** vom Client gesetzt (letzter Schreiber gewinnt) */
    updatedAt: ts('updated_at').notNull(),
    rev: rev(),
  },
  (t) => [
    index('profiles_org_idx').on(t.orgId),
    uniqueIndex('profiles_external_uq')
      .on(t.orgId, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);

export const profileGroups = pgTable(
  'profile_groups',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.groupId] }), index('profile_groups_group_idx').on(t.groupId)],
);

export const tagTypes = pgTable(
  'tag_types',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rev: rev(),
  },
  (t) => [index('tag_types_org_idx').on(t.orgId)],
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tagTypeId: uuid('tag_type_id')
      .notNull()
      .references(() => tagTypes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rev: rev(),
  },
  (t) => [index('tags_org_idx').on(t.orgId)],
);

/** Löschungen für den Sync-Pull (Profile, Gruppen, Kategorien, Tags …). */
export const tombstones = pgTable(
  'tombstones',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    rev: rev(),
  },
  (t) => [
    primaryKey({ columns: [t.entity, t.entityId] }),
    index('tombstones_org_rev_idx').on(t.orgId, t.rev),
  ],
);

export const metricDefinitions = pgTable('metric_definitions', {
  key: text('key').primaryKey(),
  families: text('families').array().notNull(),
  kind: text('kind').notNull(),
  unit: text('unit').notNull(),
  labelDe: text('label_de').notNull(),
  labelEn: text('label_en').notNull(),
  higherIsBetter: boolean('higher_is_better'),
  /** Registry-Version, mit der die Definition zuletzt geschrieben wurde */
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
});

export const recordings = pgTable(
  'recordings',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Eigentümer (für Löschung/Export pro Person); null = Gast */
    profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
    hz: integer('hz').notNull(),
    nSamples: integer('n_samples').notNull(),
    compression: integer('compression').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    storageKey: text('storage_key').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('recordings_org_idx').on(t.orgId), index('recordings_profile_idx').on(t.profileId)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mode: text('mode').notNull(),
    externalLoadKg: doublePrecision('external_load_kg').notNull().default(0),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
    status: text('status').$type<SessionStatus>().notNull(),
    queue: jsonb('queue').$type<SessionQueueEntry[]>().notNull().default([]),
    board: jsonb('board').$type<SessionBoard>().notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull(),
    /** vom Client gesetzt (letzter Schreiber gewinnt) */
    updatedAt: ts('updated_at').notNull(),
    finishedAt: ts('finished_at'),
  },
  (t) => [index('sessions_org_created_idx').on(t.orgId, t.createdAt)],
);

export const tests = pgTable(
  'tests',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    testType: text('test_type').notNull(),
    detectedType: text('detected_type'),
    bodyMassKg: doublePrecision('body_mass_kg'),
    externalLoadKg: doublePrecision('external_load_kg').notNull().default(0),
    samplingHz: integer('sampling_hz').notNull(),
    deviceSerial: text('device_serial'),
    /** Zeitpunkt der Messung (Client) */
    createdAt: ts('created_at').notNull(),
    receivedAt: ts('received_at').notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    recordingId: uuid('recording_id').references(() => recordings.id, { onDelete: 'set null' }),
    zeroLeft: doublePrecision('zero_left').notNull().default(0),
    zeroRight: doublePrecision('zero_right').notNull().default(0),
    notes: text('notes'),
    analysisVersion: text('analysis_version').notNull(),
    conditions: jsonb('conditions').$type<TestConditions>().notNull().default({}),
    /** Hash des hochgeladenen Inhalts: gleiches PUT ist idempotent, abweichendes PUT → 409 */
    contentHash: text('content_hash').notNull(),
    rev: rev(),
  },
  (t) => [
    index('tests_org_created_idx').on(t.orgId, t.createdAt),
    index('tests_profile_idx').on(t.profileId, t.testType, t.createdAt),
    index('tests_recording_idx').on(t.recordingId),
    index('tests_session_idx').on(t.sessionId),
  ],
);

export const testTags = pgTable(
  'test_tags',
  {
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.testId, t.tagId] })],
);

export const reps = pgTable(
  'reps',
  {
    id: uuid('id').primaryKey(),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    startIdx: integer('start_idx').notNull(),
    endIdx: integer('end_idx').notNull(),
    included: boolean('included').notNull().default(true),
    type: text('type').notNull(),
    confidence: real('confidence'),
    side: text('side').notNull().default('both'),
    events: jsonb('events').$type<Record<string, number>>().notNull().default({}),
    warnings: jsonb('warnings').$type<AnalysisWarning[]>().notNull().default([]),
    leadIn: boolean('lead_in').notNull().default(false),
    hopIndex: integer('hop_index'),
  },
  (t) => [index('reps_test_idx').on(t.testId, t.idx)],
);

export const repMetrics = pgTable(
  'rep_metrics',
  {
    repId: uuid('rep_id')
      .notNull()
      .references(() => reps.id, { onDelete: 'cascade' }),
    metricKey: text('metric_key')
      .notNull()
      .references(() => metricDefinitions.key),
    value: doublePrecision('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.repId, t.metricKey] }), index('rep_metrics_key_idx').on(t.metricKey)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orgId: uuid('org_id').notNull(),
    userId: uuid('user_id'),
    userEmail: text('user_email'),
    action: text('action').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    at: ts('at').notNull().defaultNow(),
    ip: text('ip'),
    /** nur Metadaten, niemals Messwerte */
    details: jsonb('details').$type<Record<string, unknown>>(),
  },
  (t) => [index('audit_org_at_idx').on(t.orgId, t.at)],
);

export const normSets = pgTable(
  'norm_sets',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('norm_sets_org_idx').on(t.orgId)],
);

export const normRows = pgTable(
  'norm_rows',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    setId: uuid('set_id')
      .notNull()
      .references(() => normSets.id, { onDelete: 'cascade' }),
    testType: text('test_type').notNull(),
    metric: text('metric').notNull(),
    sex: text('sex').$type<Sex>(),
    ageMin: integer('age_min'),
    ageMax: integer('age_max'),
    sport: text('sport'),
    n: integer('n'),
    mean: doublePrecision('mean'),
    sd: doublePrecision('sd'),
    pct: jsonb('pct').$type<NormRow['pct']>().notNull().default({}),
  },
  (t) => [index('norm_rows_set_idx').on(t.setId, t.testType, t.metric)],
);
