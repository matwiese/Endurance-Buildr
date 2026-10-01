// Rollen, Berechtigungsmatrix und Rechteauflösung.
//
// Aufbau:
//  • Jede Rolle ist eine VORLAGE (Matrix aus dem Prototyp, Kap. 11/12).
//  • Pro Person können Einzelrechte die Vorlage ändern (users.overrides).
//  • Zugriff auf Akten hängt zusätzlich vom ATHLETENBEREICH der Person ab:
//    alle Athlet:innen, bestimmte Sportarten und/oder einzeln zugeordnete (Betreuungsteam).
//  • Alles wird am Server erzwungen. Die Oberfläche blendet nur aus, was der Server ohnehin verweigert.

export const AREAS = ['Performance', 'Medizin', 'Psychologie', 'Schule', 'Safeguarding'];

export const ROLES = {
  athlet: { label: 'Athlet:in', desc: 'Sieht ausschließlich die eigene Akte, füllt den Tages-Check aus und kann vertraulich melden.' },
  trainer: { label: 'Trainer:in', desc: 'Trainingsgruppe: Plan, Monitoring, Trainingserfassung. Medizin nur als Belastungsstatus, Psychologie nur freigegebene Hinweise.' },
  koordinator: { label: 'Performance-Koordination', desc: 'Gesamtsicht auf Plan, Monitoring und Schule; legt Athlet:innen an und steuert Eskalationen. Medizin nur als Belastungsstatus.' },
  sportwiss: { label: 'Sportwissenschaft', desc: 'Belastungssteuerung und Tests. Medizin nur Einschränkungen, keine Psychologie.' },
  physio: { label: 'Physiotherapie', desc: 'Fachlich erforderliche Gesundheitsdaten, Reha-Stufen fortschreiben. Keine Psychologie, keine Schule.' },
  arzt: { label: 'Sportmedizin', desc: 'Vollständige medizinische Akte, setzt den Belastungsstatus, führt das Verletzungsregister.' },
  psych: { label: 'Sportpsychologie', desc: 'Geschützter Beratungsbereich; gibt nur Handlungshinweise mit Zustimmung der Athlet:in weiter.' },
  dualcareer: { label: 'Dual Career', desc: 'Schule, Prüfungen und Terminabstimmung. Keine Gesundheitsdaten.' },
  data: { label: 'Performance Data', desc: 'Datenqualität und Metadaten; keine Inhalte aus Gesundheit oder Psychologie.' },
  management: { label: 'Management / Geschäftsführung', desc: 'Nur aggregierte Kennzahlen ohne Namen.' },
  datenschutz: { label: 'Datenschutzbeauftragte:r', desc: 'Prüfung und Audit, Rechteprüfung, Löschfristen – ohne Einsicht in Inhalte.' },
  safeguarding: { label: 'Safeguarding Officer', desc: 'Eigener Fallbereich; Zugriff auf Akten nur im Schutzfall, begründet und protokolliert.' },
  admin: { label: 'Systemadministration', desc: 'Legt Personen an, vergibt Rechte, verwaltet das System. Sieht keine Gesundheits- oder psychologischen Inhalte.' },
};
export const ROLE_KEYS = Object.keys(ROLES);

// Konzept-Matrix (Text je Bereich) – nur zur Anzeige der Rollenvorlage.
export const MATRIX = {
  athlet: ['eigene Daten', 'eigene Daten nach med. Prozess', 'eigene Unterlagen nach Fachprozess', 'eigene Daten', 'eigene Meldung'],
  trainer: ['ja', 'nur Belastungsstatus', 'nur freigegebene Maßnahmen', 'Termin- und Belastungsinfos', 'nein'],
  koordinator: ['ja', 'nur Belastungsstatus', 'nur freigegebene Maßnahmen', 'ja', 'nein'],
  sportwiss: ['ja', 'nur notwendige Einschränkungen', 'nein', 'nur Planungsdaten', 'nein'],
  physio: ['relevante Performance-Daten', 'fachlich erforderliche Gesundheitsdaten', 'nein', 'nein', 'nein'],
  arzt: ['relevante Performance-Daten', 'vollständig', 'bei med. Notwendigkeit', 'nein', 'nur nach Prozess'],
  psych: ['begrenzt', 'bei Freigabe und Notwendigkeit', 'vollständig eigener Bereich', 'bei Freigabe', 'getrennt'],
  dualcareer: ['nur Planungsdaten', 'nein', 'nein', 'vollständig erforderlich', 'nein'],
  data: ['Qualität und Metadaten', 'Metadaten, keine Inhalte', 'nein', 'Metadaten', 'nein'],
  management: ['aggregiert', 'aggregiert', 'aggregiert', 'aggregiert', 'aggregiert'],
  datenschutz: ['Prüfung und Audit', 'Prüfung und Audit', 'Prüfung und Audit', 'Prüfung und Audit', 'Prüfung und Audit'],
  safeguarding: ['nein', 'nur im Schutzfall', 'nur im Schutzfall', 'nur im Schutzfall', 'eigener Fallbereich'],
  admin: ['nur Stammdaten', 'nein', 'nein', 'nein', 'nein'],
};

// Reiter einer Athletenakte und ihre möglichen Zugriffsstufen.
export const TABS = [
  { key: 'overview', label: 'Überblick', levels: ['none', 'read', 'full', 'own'] },
  { key: 'plan', label: 'Entwicklungsplan', levels: ['none', 'read', 'full', 'own'] },
  { key: 'monitoring', label: 'Monitoring', levels: ['none', 'wellbeing', 'read', 'full', 'own'] },
  { key: 'health', label: 'Gesundheit', levels: ['none', 'status', 'physio', 'full', 'own'] },
  { key: 'psych', label: 'Wohlbefinden & Psychologie', levels: ['none', 'released', 'full', 'own'] },
  { key: 'school', label: 'Schule', levels: ['none', 'planning', 'full', 'own'] },
  { key: 'decisions', label: 'Entscheidungen', levels: ['none', 'read', 'full', 'own'] },
  { key: 'privacy', label: 'Daten & Einwilligungen', levels: ['none', 'full', 'own'] },
];
export const TAB_KEYS = TABS.map((t) => t.key);

export const LEVEL_LABELS = {
  none: 'kein Zugriff',
  read: 'nur lesen',
  full: 'vollständig (lesen & bearbeiten)',
  own: 'eigene Daten',
  wellbeing: 'nur Wohlbefindens-Angaben',
  status: 'nur Belastungsstatus (Ampel)',
  physio: 'fachlich erforderlich (Reha)',
  released: 'nur freigegebene Hinweise',
  planning: 'nur Termine / Planungsdaten',
};
// Etwas genauere Beschreibung je Reiter und Stufe (für den Rechte-Editor)
export const LEVEL_HINTS = {
  overview: { read: 'Stammdaten ansehen', full: 'Stammdaten ansehen und ändern' },
  plan: { read: 'Plan ansehen', full: 'Plan, Ziele und Maßnahmen bearbeiten' },
  monitoring: { wellbeing: 'nur Schlaf, Müdigkeit, psychische Belastung', read: 'Tages-Check und Training ansehen', full: 'ansehen und Trainingsdaten/Messwerte erfassen' },
  health: { status: 'Ampel, Erlaubtes/Verbotenes, Kontrolltermin – keine Diagnose', physio: 'Reha-relevante Angaben, Reha-Stufen setzen', full: 'komplette medizinische Akte, Status setzen' },
  psych: { released: 'nur Handlungshinweise, die die Athlet:in freigegeben hat', full: 'geschützter Beratungsbereich' },
  school: { planning: 'nur Prüfungs- und Sporttermine', full: 'Schulstatus, Noten-Trend, Fehlstunden, Prüfungen' },
  decisions: { read: 'Entscheidungsprotokoll lesen', full: 'lesen und Entscheidungen protokollieren' },
  privacy: { full: 'Einwilligungen verwalten, Zugriffsprotokoll der Akte einsehen' },
};

// Funktionsrechte (nicht an eine einzelne Akte gebunden).
export const FEATURES = [
  { key: 'athletes.create', group: 'Akten', label: 'Athlet:innen anlegen', desc: 'Neue Akten anlegen; Lebenszyklus (aktiv, pausiert, ausgetreten) setzen.' },
  { key: 'team.assign', group: 'Akten', label: 'Betreuungsteam zuweisen', desc: 'Personen einer Akte zuordnen (Trainer, Arzt …). Zugeordnete Personen erhalten Zugriff auf diese Akte.' },
  { key: 'athlete.login', group: 'Akten', label: 'Zugänge für Athlet:innen anlegen', desc: 'Login für die Athlet:in zur eigenen Akte erstellen oder zurücksetzen.' },
  { key: 'export.athlete', group: 'Akten', label: 'Akte exportieren (Auskunft)', desc: 'Gesamte Akte als Datei ausgeben (Auskunftsrecht).' },
  { key: 'checkin.self', group: 'Monitoring', label: 'Tages-Check ausfüllen', desc: 'Eigener Tages-Check, Einwilligungen, vertrauliche Gesprächsanfrage.' },
  { key: 'training.record', group: 'Monitoring', label: 'Trainingserfassung', desc: 'Anwesenheit, Dauer, Session-RPE je Einheit erfassen.' },
  { key: 'events.manage', group: 'Monitoring', label: 'Termine pflegen', desc: 'Wettkämpfe, Reisen, Tests und Termine im gemeinsamen Kalender anlegen und ändern.' },
  { key: 'alerts.view', group: 'Hinweise', label: 'Hinweise einsehen', desc: 'Hinweise & Eskalation (nur Kategorien der Rolle).' },
  { key: 'alerts.edit', group: 'Hinweise', label: 'Hinweise bearbeiten', desc: 'Eskalationsstufe, Verantwortliche und Kontrolltermin ändern; Hinweise abschließen.' },
  { key: 'meeting.view', group: 'Hinweise', label: 'Wochenbesprechung', desc: 'Automatische Agenda und Beschlussprotokoll.' },
  { key: 'injuries.view', group: 'Medizin', label: 'Verletzungsregister', desc: 'Register aller Verletzungen und Erkrankungen.' },
  { key: 'quality.view', group: 'Datenqualität', label: 'Datenqualität einsehen', desc: 'Markierte Werte, Vollständigkeit, Datenwörterbuch.' },
  { key: 'quality.resolve', group: 'Datenqualität', label: 'Markierte Werte klären', desc: 'Werte bestätigen oder korrigieren (Data Owner).' },
  { key: 'kpi.view', group: 'Auswertung', label: 'Kennzahlen (aggregiert)', desc: 'Nur aggregierte Zahlen; kleine Gruppen werden unterdrückt.' },
  { key: 'audit.view', group: 'Datenschutz', label: 'Zugriffsprotokoll einsehen', desc: 'Wer hat wann worauf zugegriffen (ohne Inhalte).' },
  { key: 'privacy.manage', group: 'Datenschutz', label: 'Datenschutz-Verwaltung', desc: 'Umsetzungsstand DSFA, Rechteprüfung, Aufbewahrungsfristen.' },
  { key: 'safeguarding.cases', group: 'Safeguarding', label: 'Safeguarding-Fälle bearbeiten', desc: 'Meldungen bearbeiten; Akten nur im Schutzfall mit Begründung.' },
  { key: 'safeguarding.report', group: 'Safeguarding', label: 'Vertrauliche Meldung abgeben', desc: 'Unabhängiger Meldeweg (anonym möglich).' },
  { key: 'users.manage', group: 'System', label: 'Personen & Rechte verwalten', desc: 'Benutzer anlegen, Rollen und Einzelrechte vergeben.' },
  { key: 'system.manage', group: 'System', label: 'System verwalten', desc: 'Sportarten, Backups, Demodaten, Testansicht.' },
];
export const FEATURE_KEYS = FEATURES.map((f) => f.key);

const ALL_SELF_OWN = { overview: 'own', plan: 'own', monitoring: 'own', health: 'own', psych: 'own', school: 'own', decisions: 'own', privacy: 'own' };
const NO_TABS = { overview: 'none', plan: 'none', monitoring: 'none', health: 'none', psych: 'none', school: 'none', decisions: 'none', privacy: 'none' };
const tabs = (o) => ({ ...NO_TABS, ...o });

// Rollenvorlagen: Reiter-Stufen, Funktionsrechte, Standard-Athletenbereich ('all' | 'sports' | 'self' | 'none')
export const ROLE_DEFAULTS = {
  athlet: { tabs: ALL_SELF_OWN, features: ['checkin.self', 'safeguarding.report'], scope: 'self' },
  trainer: {
    tabs: tabs({ overview: 'read', plan: 'full', monitoring: 'full', health: 'status', psych: 'released', school: 'planning', decisions: 'full' }),
    features: ['training.record', 'events.manage', 'alerts.view', 'meeting.view'], scope: 'sports',
  },
  koordinator: {
    tabs: tabs({ overview: 'full', plan: 'full', monitoring: 'full', health: 'status', psych: 'released', school: 'full', decisions: 'full', privacy: 'full' }),
    features: ['athletes.create', 'team.assign', 'athlete.login', 'export.athlete', 'events.manage', 'alerts.view', 'alerts.edit', 'meeting.view', 'quality.view'], scope: 'all',
  },
  sportwiss: {
    tabs: tabs({ overview: 'read', plan: 'full', monitoring: 'full', health: 'status', school: 'planning', decisions: 'full' }),
    features: ['events.manage', 'alerts.view', 'alerts.edit', 'meeting.view', 'quality.view'], scope: 'all',
  },
  physio: {
    tabs: tabs({ overview: 'read', plan: 'read', monitoring: 'read', health: 'physio', decisions: 'full' }),
    features: ['alerts.view', 'alerts.edit', 'meeting.view', 'injuries.view'], scope: 'all',
  },
  arzt: {
    tabs: tabs({ overview: 'read', plan: 'read', monitoring: 'read', health: 'full', psych: 'released', decisions: 'full' }),
    features: ['alerts.view', 'alerts.edit', 'meeting.view', 'injuries.view'], scope: 'all',
  },
  psych: {
    tabs: tabs({ overview: 'read', plan: 'read', monitoring: 'wellbeing', health: 'status', psych: 'full', school: 'planning', decisions: 'read' }),
    features: ['alerts.view', 'alerts.edit'], scope: 'all',
  },
  dualcareer: {
    tabs: tabs({ overview: 'read', plan: 'read', school: 'full', decisions: 'read' }),
    features: ['events.manage', 'alerts.view'], scope: 'all',
  },
  data: { tabs: tabs({}), features: ['quality.view', 'quality.resolve', 'kpi.view'], scope: 'none' },
  management: { tabs: tabs({}), features: ['kpi.view'], scope: 'none' },
  datenschutz: { tabs: tabs({}), features: ['audit.view', 'privacy.manage', 'export.athlete'], scope: 'none' },
  safeguarding: { tabs: tabs({}), features: ['safeguarding.cases'], scope: 'none' },
  admin: {
    tabs: tabs({ overview: 'full' }),
    features: ['athletes.create', 'team.assign', 'athlete.login', 'audit.view', 'users.manage', 'system.manage'], scope: 'all',
  },
};

const TAB_LEVELS = Object.fromEntries(TABS.map((t) => [t.key, t.levels]));

export function parseOverrides(raw) {
  let o = {};
  try { o = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}; } catch { o = {}; }
  const out = { tabs: {}, features: {} };
  for (const [k, v] of Object.entries(o.tabs || {})) if (TAB_LEVELS[k] && TAB_LEVELS[k].includes(v)) out.tabs[k] = v;
  for (const [k, v] of Object.entries(o.features || {})) if (FEATURE_KEYS.includes(k) && typeof v === 'boolean') out.features[k] = v;
  return out;
}

// Bereinigt Einzelrechte vor dem Speichern: nur Abweichungen von der Rollenvorlage bleiben übrig.
export function sanitizeOverrides(role, input) {
  const base = ROLE_DEFAULTS[role];
  if (!base || role === 'athlet') return { tabs: {}, features: {} };
  const o = parseOverrides(input);
  const out = { tabs: {}, features: {} };
  for (const [k, v] of Object.entries(o.tabs)) {
    if (v === 'own') continue; // "eigene Daten" gibt es nur für Athlet:innen
    if (v !== base.tabs[k]) out.tabs[k] = v;
  }
  for (const [k, v] of Object.entries(o.features)) {
    if (v !== base.features.includes(k)) out.features[k] = v;
  }
  return out;
}

// Wirksame Rechte einer Person (Rollenvorlage + Einzelrechte).
export function effectivePerms(user) {
  const base = ROLE_DEFAULTS[user.role] || ROLE_DEFAULTS.athlet;
  const ov = user.role === 'athlet' ? { tabs: {}, features: {} } : parseOverrides(user.overrides);
  const t = { ...base.tabs, ...ov.tabs };
  const features = {};
  for (const f of FEATURE_KEYS) features[f] = base.features.includes(f);
  for (const [k, v] of Object.entries(ov.features)) features[k] = v;
  return {
    tabs: t,
    features,
    overridden: Object.keys(ov.tabs).length + Object.keys(ov.features).length > 0,
    overrideCount: Object.keys(ov.tabs).length + Object.keys(ov.features).length,
  };
}

export function scopeOf(user) {
  let sports = [];
  try { sports = JSON.parse(user.scope_sports || '[]'); } catch { /* leer */ }
  return { all: !!user.scope_all, sports: Array.isArray(sports) ? sports : [], self: user.role === 'athlet' ? user.athlete_id || null : null };
}

export const hasFeature = (user, key) => !!effectivePerms(user).features[key];

// Kann die Person die Akte überhaupt sehen (Athletenbereich)? `assigned` = Person ist im Betreuungsteam der Akte.
export function inScope(user, athlete, assigned = false) {
  if (!athlete) return false;
  if (user.role === 'athlet') return !!user.athlete_id && athlete.id === user.athlete_id;
  if (athlete.status === 'ausgetreten' && !hasFeature(user, 'athletes.create')) return false;
  const s = scopeOf(user);
  return s.all || s.sports.includes(athlete.sport) || assigned;
}

// Stufe eines Reiters für diese Akte; 'none', wenn die Akte nicht im Athletenbereich liegt.
export function tabLevel(user, athlete, tab, assigned = false) {
  if (!inScope(user, athlete, assigned)) return 'none';
  const lvl = effectivePerms(user).tabs[tab] || 'none';
  if (lvl === 'own' && !(user.role === 'athlet' && athlete.id === user.athlete_id)) return 'none';
  return lvl;
}

export function publicMeta() {
  return {
    areas: AREAS,
    roles: ROLE_KEYS.map((k) => ({ key: k, label: ROLES[k].label, desc: ROLES[k].desc, matrix: MATRIX[k], defaults: ROLE_DEFAULTS[k] })),
    tabs: TABS,
    levelLabels: LEVEL_LABELS,
    levelHints: LEVEL_HINTS,
    features: FEATURES,
  };
}
