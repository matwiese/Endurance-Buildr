import type { AnalysisWarning, TestType } from '@buildr/core';

export type Role = 'admin' | 'tester' | 'viewer';
export type Sex = 'f' | 'm' | 'd';
export type UploadStatus = 'local' | 'queued' | 'uploaded' | 'failed';

export interface CategoryDTO {
  id: string;
  name: string;
}
export interface GroupDTO {
  id: string;
  categoryId: string;
  name: string;
}
export interface TagTypeDTO {
  id: string;
  name: string;
}
export interface TagDTO {
  id: string;
  tagTypeId: string;
  name: string;
}

export interface ProfileDTO {
  id: string;
  name: string;
  /** ISO-Datum (YYYY-MM-DD) */
  dateOfBirth: string | null;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  sport: string | null;
  email: string | null;
  notes: string | null;
  externalId: string | null;
  /** Foto/Video-Einwilligung – unter 18 nur mit Einwilligung der Erziehungsberechtigten */
  allowPhotoVideo: boolean;
  guardianConsent: boolean;
  /** Zeitpunkt der Einwilligung in die Verarbeitung von Gesundheitsdaten (Art. 9 DSGVO) */
  healthConsentAt: string | null;
  /** mindestens eine Gruppe (Pflicht) */
  groupIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RepRecord {
  id: string;
  index: number;
  startIdx: number;
  endIdx: number;
  included: boolean;
  type: TestType | 'unclear';
  confidence: number | null;
  side: 'left' | 'right' | 'both';
  events: Record<string, number>;
  metrics: Record<string, number | null>;
  warnings: AnalysisWarning[];
  leadIn?: boolean;
  hopIndex?: number;
}

export interface TestConditions {
  eyesClosed?: boolean;
  unstableSurface?: boolean;
  dualTask?: boolean;
}

export interface TestRecord {
  id: string;
  profileId: string | null;
  sessionId: string | null;
  testType: TestType;
  /** vom Auto-Detect erkannter Typ (null bei manueller Wahl) */
  detectedType: TestType | 'unclear' | null;
  bodyMassKg: number | null;
  externalLoadKg: number;
  samplingHz: number;
  deviceSerial: string | null;
  createdAt: string;
  status: UploadStatus;
  tagIds: string[];
  conditions: TestConditions;
  /** Aufnahme (Rohdaten); mehrere Tests einer Aufnahme teilen sich die Referenz */
  recordingId: string;
  zeroOffsets: { left: number; right: number };
  notes: string | null;
  reps: RepRecord[];
  /** Version der Analyse (Reproduzierbarkeit) */
  analysisVersion: string;
}

export interface RecordingRecord {
  id: string;
  hz: number;
  left: Float32Array;
  right: Float32Array;
  copX?: Float32Array;
  copY?: Float32Array;
  breaks: number[];
  createdAt: string;
}

export type SessionStatus = 'active' | 'paused' | 'finished';
export type QueueStatus = 'waiting' | 'testing' | 'done' | 'skipped';

export interface SessionQueueEntry {
  profileId: string;
  status: QueueStatus;
}

export interface SessionBoard {
  metric: string | null;
  testType: TestType | null;
  aggregate: 'best' | 'last' | 'mean';
}

/** Gruppentest: Warteschlange von Athleten, die nacheinander auf denselben Platten getestet werden. */
export interface SessionDTO {
  id: string;
  name: string;
  mode: 'auto' | TestType;
  externalLoadKg: number;
  groupId: string | null;
  status: SessionStatus;
  queue: SessionQueueEntry[];
  board: SessionBoard;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export const ANALYSIS_VERSION = '1.0.0';

export type { TestType };
