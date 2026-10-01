import {
  parseCsvText,
  parseNumberLoose,
  stripBom,
  toCsv,
  detectDelimiter,
  type Delimiter,
} from '@buildr/core';
import type { GroupDTO, ProfileDTO, Sex } from './model.ts';
import { validateProfile } from './validation.ts';

/**
 * Profil-CSV: flexible Spalten (de/en, Synonyme), Excel-Eigenheiten (BOM, `;`, Dezimalkomma, `dd.mm.yyyy`),
 * Prüfbericht je Zeile, Duplikaterkennung (externalId bzw. Name + Geburtsdatum) → Update statt Neuanlage.
 * Rein und deterministisch (IDs/Zeit werden übergeben) – läuft im Browser (Vorschau) und im Test.
 */
export type ImportField =
  | 'name'
  | 'firstName'
  | 'lastName'
  | 'dateOfBirth'
  | 'sex'
  | 'heightCm'
  | 'weightKg'
  | 'sport'
  | 'email'
  | 'notes'
  | 'externalId'
  | 'groups'
  | 'healthConsent'
  | 'ignore';

export const IMPORT_FIELDS: ImportField[] = [
  'name',
  'firstName',
  'lastName',
  'dateOfBirth',
  'sex',
  'heightCm',
  'weightKg',
  'sport',
  'email',
  'notes',
  'externalId',
  'groups',
  'healthConsent',
  'ignore',
];

const SYNONYMS: Record<Exclude<ImportField, 'ignore'>, string[]> = {
  name: ['name', 'fullname', 'vollername', 'athlet', 'athlete', 'person', 'spieler', 'player'],
  firstName: ['firstname', 'vorname', 'givenname', 'first'],
  lastName: ['lastname', 'nachname', 'familienname', 'surname', 'familyname', 'last'],
  dateOfBirth: [
    'dateofbirth',
    'dob',
    'birthdate',
    'birthday',
    'geburtsdatum',
    'geburtstag',
    'geboren',
    'gebdatum',
    'gebdat',
  ],
  sex: ['sex', 'gender', 'geschlecht'],
  heightCm: ['height', 'heightcm', 'groesse', 'groessecm', 'koerpergroesse', 'groesse'],
  weightKg: ['weight', 'weightkg', 'gewicht', 'gewichtkg', 'koerpergewicht', 'bodyweight', 'bodymass'],
  sport: ['sport', 'sportart', 'disziplin', 'discipline'],
  email: ['email', 'mail', 'emailadresse', 'emailaddress'],
  notes: [
    'notes',
    'note',
    'notiz',
    'notizen',
    'bemerkung',
    'bemerkungen',
    'kommentar',
    'comment',
    'comments',
  ],
  externalId: [
    'externalid',
    'extid',
    'id',
    'extern',
    'externeid',
    'athleteid',
    'memberid',
    'mitgliedsnummer',
    'kundennummer',
  ],
  groups: ['group', 'groups', 'gruppe', 'gruppen', 'team', 'teams', 'mannschaft', 'kader'],
  healthConsent: [
    'healthconsent',
    'einwilligung',
    'gesundheitsdaten',
    'consent',
    'datenschutzeinwilligung',
    'einwilligunggesundheitsdaten',
  ],
};

/** Kleinschreibung, ohne Umlaute/Akzente/Leer-/Sonderzeichen: "Größe (cm)" → "groessecm". */
export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Ordnet jede Kopfzeile dem wahrscheinlichsten Feld zu (jedes Feld höchstens einmal; sonst `ignore`). */
export function detectColumns(header: string[]): ImportField[] {
  const used = new Set<ImportField>();
  return header.map((h) => {
    const n = normalizeHeader(h);
    if (!n) return 'ignore';
    for (const [field, syn] of Object.entries(SYNONYMS) as Array<
      [Exclude<ImportField, 'ignore'>, string[]]
    >) {
      if (used.has(field)) continue;
      if (syn.includes(n)) {
        used.add(field);
        return field;
      }
    }
    return 'ignore';
  });
}

export type ImportIssueCode =
  | 'name_required'
  | 'group_required'
  | 'group_unknown'
  | 'dob_invalid'
  | 'dob_future'
  | 'height_range'
  | 'weight_range'
  | 'email_invalid'
  | 'photo_video_minor'
  | 'sex_unknown'
  | 'height_converted'
  | 'number_invalid'
  | 'duplicate_in_file';

export interface ImportIssue {
  code: ImportIssueCode;
  field?: ImportField;
  value?: string;
  severity: 'error' | 'warning';
}

export type RowStatus = 'new' | 'update' | 'unchanged' | 'invalid';

export interface ImportRowResult {
  /** 1-basierte Zeilennummer in der Datei (Kopfzeile = 1) */
  line: number;
  status: RowStatus;
  issues: ImportIssue[];
  /** fertiges Profil (neu bzw. mit vorhandenem zusammengeführt); nur wenn nicht `invalid` */
  profile?: ProfileDTO;
  matchedBy?: 'externalId' | 'nameDob';
  /** Gruppennamen, die angelegt werden müssten */
  newGroups: string[];
  raw: string[];
}

export interface ImportPlan {
  delimiter: Delimiter;
  header: string[];
  columns: ImportField[];
  rows: ImportRowResult[];
  summary: {
    new: number;
    update: number;
    unchanged: number;
    invalid: number;
    total: number;
    newGroups: string[];
  };
  /** Pflichtfelder fehlen in der Zuordnung (z. B. keine Namensspalte) */
  fatal: 'no_rows' | 'no_name_column' | null;
}

export interface PlanOptions {
  existing: ProfileDTO[];
  groups: GroupDTO[];
  /** Gruppen für Zeilen ohne Gruppenangabe */
  defaultGroupIds?: string[];
  /** unbekannte Gruppennamen automatisch anlegen (sonst Fehler `group_unknown`) */
  createMissingGroups?: boolean;
  /** Spaltenzuordnung überschreiben (Standard: Erkennung über die Kopfzeile) */
  columns?: ImportField[];
  /** vorhandene Profile aktualisieren (Standard true) */
  updateExisting?: boolean;
  today?: Date;
  /** ISO-Zeitpunkt für createdAt/updatedAt/Einwilligung */
  now: string;
  newId: () => string;
  /** `true`: erste Zeile ist Kopfzeile (Standard) */
  hasHeader?: boolean;
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function parseDob(raw: string): { value: string | null; ok: boolean } {
  const s = raw.trim();
  if (!s) return { value: null, ok: true };
  let y: number, m: number, d: number;
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s) ?? /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (mt) {
    y = +mt[1]!;
    m = +mt[2]!;
    d = +mt[3]!;
  } else {
    mt = /^(\d{1,2})[.](\d{1,2})[.](\d{4})$/.exec(s);
    if (!mt) return { value: null, ok: false };
    d = +mt[1]!;
    m = +mt[2]!;
    y = +mt[3]!;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1900)
    return { value: null, ok: false };
  return {
    value: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    ok: true,
  };
}

export function parseSex(raw: string): { value: Sex | null; ok: boolean } {
  const s = norm(raw);
  if (!s) return { value: null, ok: true };
  if (['m', 'male', 'maennlich', 'männlich', 'mann', 'herr', 'masculin'].includes(s))
    return { value: 'm', ok: true };
  if (['f', 'w', 'female', 'weiblich', 'frau', 'damen'].includes(s)) return { value: 'f', ok: true };
  if (['d', 'x', 'divers', 'diverse', 'other', 'andere', 'nonbinary', 'non-binary'].includes(s))
    return { value: 'd', ok: true };
  return { value: null, ok: false };
}

const YES = new Set(['ja', 'j', 'yes', 'y', 'true', 'wahr', '1', 'x', 'ok', 'liegt vor']);

function mergeValue<T>(incoming: T | null, existing: T | null): T | null {
  return incoming !== null && incoming !== undefined && incoming !== ('' as unknown as T)
    ? incoming
    : existing;
}

/** Plant einen Import (Trockenlauf): parst, prüft, ordnet Duplikaten zu – schreibt nichts. */
export function planProfileImport(text: string, opts: PlanOptions): ImportPlan {
  const body = stripBom(text);
  const delimiter = detectDelimiter(body);
  const table = parseCsvText(body, delimiter).filter((r) => r.some((c) => c.trim() !== ''));
  const hasHeader = opts.hasHeader ?? true;
  const header = hasHeader ? (table[0] ?? []) : (table[0] ?? []).map((_, i) => `col${i + 1}`);
  const data = hasHeader ? table.slice(1) : table;
  const columns = opts.columns ?? detectColumns(header);
  const empty: ImportPlan = {
    delimiter,
    header,
    columns,
    rows: [],
    summary: { new: 0, update: 0, unchanged: 0, invalid: 0, total: 0, newGroups: [] },
    fatal: null,
  };
  if (!data.length) return { ...empty, fatal: 'no_rows' };
  const col = (f: ImportField): number => columns.indexOf(f);
  if (col('name') < 0 && !(col('firstName') >= 0 || col('lastName') >= 0))
    return { ...empty, fatal: 'no_name_column' };

  const today = opts.today ?? new Date();
  const updateExisting = opts.updateExisting ?? true;
  const groupByName = new Map(opts.groups.map((g) => [norm(g.name), g]));
  const byExt = new Map<string, ProfileDTO>();
  const byNameDob = new Map<string, ProfileDTO>();
  for (const p of opts.existing) {
    if (p.externalId) byExt.set(norm(p.externalId), p);
    if (p.dateOfBirth) byNameDob.set(`${norm(p.name)}|${p.dateOfBirth}`, p);
  }
  const seen = new Set<string>();
  const allNewGroups = new Set<string>();
  const rows: ImportRowResult[] = [];

  data.forEach((raw, i) => {
    const line = i + (hasHeader ? 2 : 1);
    // das beim Export vorangestellte Apostroph (Schutz vor Excel-Formeln) wieder entfernen
    const cell = (f: ImportField): string => {
      const c = col(f);
      const v = c >= 0 ? (raw[c] ?? '').trim() : '';
      return /^'[=+\-@]/.test(v) ? v.slice(1) : v;
    };
    const issues: ImportIssue[] = [];
    const err = (code: ImportIssueCode, field?: ImportField, value?: string) =>
      issues.push({ code, field, value, severity: 'error' });
    const warn = (code: ImportIssueCode, field?: ImportField, value?: string) =>
      issues.push({ code, field, value, severity: 'warning' });

    let name = cell('name');
    if (!name) name = [cell('firstName'), cell('lastName')].filter(Boolean).join(' ');
    name = name.replace(/\s+/g, ' ').trim();

    const dob = parseDob(cell('dateOfBirth'));
    if (!dob.ok) err('dob_invalid', 'dateOfBirth', cell('dateOfBirth'));
    const sex = parseSex(cell('sex'));
    if (!sex.ok) warn('sex_unknown', 'sex', cell('sex'));

    let height: number | null = null;
    if (cell('heightCm')) {
      let h = parseNumberLoose(cell('heightCm'));
      if (Number.isNaN(h)) warn('number_invalid', 'heightCm', cell('heightCm'));
      else {
        if (h > 0 && h < 3) {
          h = Math.round(h * 100);
          warn('height_converted', 'heightCm', cell('heightCm'));
        }
        height = h;
      }
    }
    let weight: number | null = null;
    if (cell('weightKg')) {
      const w = parseNumberLoose(cell('weightKg'));
      if (Number.isNaN(w)) warn('number_invalid', 'weightKg', cell('weightKg'));
      else weight = w;
    }
    let email: string | null = cell('email') || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warn('email_invalid', 'email', email);
      email = null;
    }

    // Gruppen
    const groupIds: string[] = [];
    const newGroups: string[] = [];
    for (const g of cell('groups')
      .split(/[;|,]/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      const known = groupByName.get(norm(g));
      if (known) groupIds.push(known.id);
      else if (opts.createMissingGroups) newGroups.push(g);
      else err('group_unknown', 'groups', g);
    }
    if (!groupIds.length && !newGroups.length && !issues.some((x) => x.code === 'group_unknown'))
      groupIds.push(...(opts.defaultGroupIds ?? []));

    const healthConsent = cell('healthConsent') ? YES.has(norm(cell('healthConsent'))) : null;
    const extId = cell('externalId') || null;

    // Zuordnung zu vorhandenen Profilen
    let match: ProfileDTO | undefined;
    let matchedBy: ImportRowResult['matchedBy'];
    if (extId && byExt.has(norm(extId))) {
      match = byExt.get(norm(extId));
      matchedBy = 'externalId';
    } else if (dob.value && byNameDob.has(`${norm(name)}|${dob.value}`)) {
      match = byNameDob.get(`${norm(name)}|${dob.value}`);
      matchedBy = 'nameDob';
    }
    const key = extId ? `e:${norm(extId)}` : dob.value ? `n:${norm(name)}|${dob.value}` : null;
    if (key) {
      if (seen.has(key)) err('duplicate_in_file', undefined, name);
      seen.add(key);
    }

    const mergedGroups = match ? [...new Set([...match.groupIds, ...groupIds])] : groupIds;
    const candidate: ProfileDTO = {
      id: match?.id ?? opts.newId(),
      name: name || match?.name || '',
      dateOfBirth: mergeValue(dob.value, match?.dateOfBirth ?? null),
      sex: mergeValue(sex.value, match?.sex ?? null),
      heightCm: mergeValue(height, match?.heightCm ?? null),
      weightKg: mergeValue(weight, match?.weightKg ?? null),
      sport: mergeValue(cell('sport') || null, match?.sport ?? null),
      email: mergeValue(email, match?.email ?? null),
      notes: mergeValue(cell('notes') || null, match?.notes ?? null),
      externalId: mergeValue(extId, match?.externalId ?? null),
      allowPhotoVideo: match?.allowPhotoVideo ?? false,
      guardianConsent: match?.guardianConsent ?? false,
      healthConsentAt:
        healthConsent === true
          ? (match?.healthConsentAt ?? opts.now)
          : healthConsent === false
            ? null
            : (match?.healthConsentAt ?? null),
      groupIds: mergedGroups,
      createdAt: match?.createdAt ?? opts.now,
      updatedAt: opts.now,
    };

    // Regelprüfung (gleiche Regeln wie im Formular); Gruppen, die erst angelegt werden, zählen als vorhanden
    const forCheck = {
      ...candidate,
      groupIds:
        candidate.groupIds.length || newGroups.length
          ? candidate.groupIds.concat(newGroups.length ? ['<neu>'] : [])
          : [],
    };
    for (const iss of validateProfile(forCheck, today, {})) {
      if (iss.code === 'health_consent_required') continue;
      if (issues.some((x) => x.code === iss.code)) continue;
      err(iss.code as ImportIssueCode, iss.field as ImportField);
    }

    const hasError = issues.some((x) => x.severity === 'error');
    let status: RowStatus;
    if (hasError) status = 'invalid';
    else if (match) {
      if (!updateExisting) status = 'unchanged';
      else {
        const same =
          JSON.stringify({ ...candidate, updatedAt: '', createdAt: '' }) ===
          JSON.stringify({ ...match, updatedAt: '', createdAt: '' });
        status = same ? 'unchanged' : 'update';
      }
    } else status = 'new';

    if (status === 'new' || status === 'update') for (const g of newGroups) allNewGroups.add(g);
    rows.push({
      line,
      status,
      issues,
      profile: hasError ? undefined : candidate,
      matchedBy,
      newGroups: hasError ? [] : newGroups,
      raw,
    });
  });

  const count = (s: RowStatus): number => rows.filter((r) => r.status === s).length;
  return {
    delimiter,
    header,
    columns,
    rows,
    summary: {
      new: count('new'),
      update: count('update'),
      unchanged: count('unchanged'),
      invalid: count('invalid'),
      total: rows.length,
      newGroups: [...allNewGroups],
    },
    fatal: null,
  };
}

export const PROFILE_CSV_HEADER = [
  'name',
  'date_of_birth',
  'sex',
  'height_cm',
  'weight_kg',
  'sport',
  'email',
  'external_id',
  'groups',
  'notes',
  'health_consent',
] as const;

/** Export im Austauschformat (Kopfzeile = unterstützte Importspalten → verlustfreier Round-Trip). */
export function profilesToCsv(
  profiles: ReadonlyArray<ProfileDTO>,
  groups: ReadonlyArray<GroupDTO>,
  opts: { delimiter?: Delimiter; bom?: boolean } = {},
): string {
  const gname = new Map(groups.map((g) => [g.id, g.name]));
  const rows: Array<Array<string | number | null>> = [[...PROFILE_CSV_HEADER]];
  for (const p of [...profiles].sort((a, b) => a.name.localeCompare(b.name))) {
    rows.push([
      p.name,
      p.dateOfBirth,
      p.sex,
      p.heightCm,
      p.weightKg,
      p.sport,
      p.email,
      p.externalId,
      p.groupIds
        .map((g) => gname.get(g) ?? '')
        .filter(Boolean)
        .join('; '),
      p.notes,
      p.healthConsentAt ? 'ja' : 'nein',
    ]);
  }
  return toCsv(rows, { delimiter: opts.delimiter ?? ';', bom: opts.bom ?? true });
}
