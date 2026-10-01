// Fachliche Kataloge (Auswahllisten, Texte) aus dem Prototyp. Werden auch an die Oberfläche geliefert (/api/meta).

export const SEX = [['w', 'weiblich'], ['m', 'männlich'], ['d', 'divers'], ['–', 'keine Angabe']];
export const LIFECYCLE = ['aktiv', 'eingeschränkt', 'pausiert', 'ausgetreten'];

// Funktion einer Person im Betreuungsteam einer Akte
export const TEAM_FUNCTIONS = ['Trainer:in', 'Koordination', 'Sportmedizin', 'Physiotherapie', 'Sportwissenschaft', 'Sportpsychologie', 'Dual Career', 'Sonstige'];
export const TEAM_FUNCTION_BY_ROLE = {
  trainer: 'Trainer:in', koordinator: 'Koordination', arzt: 'Sportmedizin', physio: 'Physiotherapie', sportwiss: 'Sportwissenschaft',
  psych: 'Sportpsychologie', dualcareer: 'Dual Career',
};

// Kategorien für Dokumente/Notizen in der Akte. `tab` bestimmt, welche Zugriffsstufe nötig ist.
export const DOC_CATEGORIES = {
  allgemein: { label: 'Allgemein / Stammdaten', tab: 'overview', read: ['read', 'full'], write: ['full'] },
  plan: { label: 'Entwicklungsplan', tab: 'plan', read: ['read', 'full'], write: ['full'] },
  training: { label: 'Training & Tests', tab: 'monitoring', read: ['read', 'full'], write: ['full'] },
  medizin: { label: 'Medizin', tab: 'health', read: ['physio', 'full'], write: ['physio', 'full'] },
  psychologie: { label: 'Psychologie (geschützt)', tab: 'psych', read: ['full'], write: ['full'] },
  schule: { label: 'Schule / Dual Career', tab: 'school', read: ['full'], write: ['full'] },
  datenschutz: { label: 'Datenschutz & Einwilligungen', tab: 'privacy', read: ['full'], write: ['full'] },
};
// Welchem Bereich (Audit) gehört eine Kategorie an?
export const DOC_AREA = { allgemein: 'Performance', plan: 'Performance', training: 'Performance', medizin: 'Medizin', psychologie: 'Psychologie', schule: 'Schule', datenschutz: 'Datenschutz' };

export const ALLOWED_UPLOADS = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  txt: 'text/plain', csv: 'text/csv', md: 'text/markdown',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation',
  mp4: 'video/mp4', mov: 'video/quicktime',
};
export const INLINE_IMAGES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
// Magic-Number-Prüfung für Formate, die wir inline anzeigen oder die leicht getarnt werden
export const SIGNATURES = {
  pdf: [Buffer.from('%PDF')], png: [Buffer.from([0x89, 0x50, 0x4e, 0x47])], jpg: [Buffer.from([0xff, 0xd8, 0xff])], jpeg: [Buffer.from([0xff, 0xd8, 0xff])],
  gif: [Buffer.from('GIF8')], webp: [Buffer.from('RIFF')],
};

export const EXIT_CHECKLIST = [
  'Zugriffsrechte beendet', 'Aktive Schnittstellen getrennt', 'Relevante Unterlagen an die Athlet:in übergeben', 'Daten nach Frist archiviert oder gelöscht',
  'Forschungsdaten nur bei gültiger Grundlage', 'Verbände erhalten nur vereinbarte Daten', 'Nachverfolgungsdaten getrennt und zweckgebunden',
];

// Zwecke, für die je Akte eine Einwilligung bzw. Information dokumentiert wird
export const CONSENT_DEFAULTS = [
  { key: 'monitoring', purpose: 'Tägliches Monitoring (Readiness-Check)', basis: 'Rechtsgrundlage durch DSB festzulegen', voluntary: false, status: 'informiert' },
  { key: 'cycle', purpose: 'Zyklus-Tracking (nur Athletinnen, freiwillig)', basis: 'Einwilligung, jederzeit widerrufbar', voluntary: true, status: 'nicht erteilt' },
  { key: 'federation', purpose: 'Weitergabe vereinbarter Daten an den Fachverband', basis: 'Vereinbarung + Rechtsgrundlage durch DSB zu prüfen', voluntary: false, status: 'informiert' },
  { key: 'research', purpose: 'Forschung und Evaluation (pseudonymisiert)', basis: 'Einwilligung, jederzeit widerrufbar', voluntary: true, status: 'nicht erteilt' },
  { key: 'video', purpose: 'Video für Technikanalyse', basis: 'Einwilligung, jederzeit widerrufbar', voluntary: true, status: 'nicht erteilt' },
];
export const CONSENT_STATUS = ['informiert', 'erteilt', 'nicht erteilt', 'widerrufen', 'entfällt'];
export const CONSENT_GIVEN_BY = ['Athlet:in', 'Erziehungsberechtigte', 'Athlet:in und Erziehungsberechtigte'];

// ---- Phase 3: Performance ----
export const READINESS_ITEMS = [
  ['sleepQ', 'Schlafqualität', '1 sehr schlecht · 5 sehr gut'], ['recovery', 'Körperliche Erholung', '1 gar nicht erholt · 5 voll erholt'],
  ['soreness', 'Muskelbeschwerden', '1 starke Beschwerden · 5 keine'], ['fatigue', 'Müdigkeit', '1 sehr müde · 5 frisch'],
  ['stress', 'Psychische Belastung', '1 sehr belastet · 5 entspannt'], ['ready', 'Trainingsbereitschaft', '1 gar nicht bereit · 5 voll bereit'],
];
export const SESSION_STATUS = ['geplant', 'vollständig', 'angepasst', 'abgebrochen', 'nicht teilgenommen'];
export const GOAL_AREAS = ['sporttechnisch', 'taktisch', 'körperlich', 'gesundheitlich', 'mental', 'schulisch', 'Selbstmanagement'];
export const EVENT_TYPES = ['Wettkampf', 'Reise', 'Test', 'Training', 'Schule', 'Sonstiges'];
export const STAGES = ['', 'Beobachtung', 'Gespräch', 'Maßnahme', 'Fachabklärung', 'Akutprozess'];
export const STAGE_TEXT = ['', 'Koordination prüft den Verlauf', 'Athlet:in und Fachperson klären die Situation', 'Training, Schule oder Betreuung wird angepasst', 'Medizin, Psychologie oder andere Fachstelle übernimmt', 'Sofortige Schutz- oder Notfallmaßnahme außerhalb des Dashboards'];
export const ALERT_CATS = { perf: 'Performance', health: 'Gesundheit', well: 'Wohlbefinden', school: 'Schule', conf: 'vertraulich' };
// Welche Hinweis-Kategorien sieht eine Rolle (Prototyp, Kap. 17)
export const ALERT_CATS_BY_ROLE = {
  trainer: ['perf', 'health'], koordinator: ['perf', 'health', 'well', 'school'], sportwiss: ['perf'], physio: ['health'], arzt: ['health'], psych: ['well'], dualcareer: ['school'],
};

// ---- Phase 4 ----
export const STATUS = { gruen: 'Grün', gelb: 'Gelb', orange: 'Orange', rot: 'Rot' };
export const STATUS_MEAN = { gruen: 'uneingeschränktes Training', gelb: 'Training mit definierten Anpassungen', orange: 'nur Rehabilitation oder alternatives Training', rot: 'keine sportliche Belastung' };
export const RTP = ['Medizinische Stabilität', 'Grundlegende Funktion', 'Sportartspezifische Belastbarkeit', 'Volle Trainingsintegration', 'Wettkampfbelastbarkeit', 'Früheres Leistungsniveau'];
export const INJURY_OPTIONS = { kind: ['Verletzung', 'Erkrankung'], setting: ['Training', 'Wettkampf', 'außerhalb'], first: ['Erstauftreten', 'Wiederverletzung'], onset: ['akut', 'schleichend'] };
export const SCHOOL_TRENDS = ['–', 'stabil', 'steigend', 'fallend'];

// Datenwörterbuch für Messwerte: Plausibilitätsgrenzen erzeugen bei Verstoß eine Markierung (nie stilles Löschen)
export const VARIABLES = [
  { key: 'Körpermasse', unit: 'kg', min: 25, max: 200, source: 'Waage', def: 'morgens vor dem Frühstück unter Standardbedingungen' },
  { key: 'Körpergröße', unit: 'cm', min: 120, max: 230, source: 'Messlatte', def: 'barfuß, aufrecht' },
  { key: 'Ruhepuls', unit: 'bpm', min: 30, max: 120, source: 'Pulsuhr', def: 'morgens im Liegen' },
  { key: '10-m-Zeit', unit: 's', min: 1.2, max: 3.5, source: 'Lichtschranke', def: 'fliegender/stehender Start je Protokoll' },
  { key: '30-m-Zeit', unit: 's', min: 3, max: 8, source: 'Lichtschranke', def: '' },
  { key: '60-m-Zeit', unit: 's', min: 6, max: 14, source: 'Lichtschranke', def: '' },
  { key: 'Counter-Movement-Jump', unit: 'cm', min: 10, max: 90, source: 'Kontaktmatte', def: 'Sprunghöhe' },
  { key: 'Squat-Jump', unit: 'cm', min: 10, max: 90, source: 'Kontaktmatte', def: '' },
  { key: 'Maximalkraft Kniebeuge (1RM)', unit: 'kg', min: 20, max: 400, source: 'Hantel', def: '' },
  { key: '100-m-Freistil', unit: 's', min: 40, max: 200, source: 'Zeitnahme', def: '' },
  { key: 'Laktat', unit: 'mmol/l', min: 0.3, max: 25, source: 'Messgerät', def: '' },
  { key: 'VO2max', unit: 'ml/kg/min', min: 20, max: 90, source: 'Spiroergometrie', def: '' },
];

export function catalogForClient() {
  return {
    sex: SEX, lifecycle: LIFECYCLE, teamFunctions: TEAM_FUNCTIONS, teamFunctionByRole: TEAM_FUNCTION_BY_ROLE,
    docCategories: Object.fromEntries(Object.entries(DOC_CATEGORIES).map(([k, v]) => [k, { label: v.label, tab: v.tab }])),
    status: STATUS, statusMean: STATUS_MEAN, rtp: RTP, injuryOptions: INJURY_OPTIONS, schoolTrends: SCHOOL_TRENDS, readinessItems: READINESS_ITEMS, sessionStatus: SESSION_STATUS, goalAreas: GOAL_AREAS, eventTypes: EVENT_TYPES, stages: STAGES, stageText: STAGE_TEXT, alertCats: ALERT_CATS, variables: VARIABLES,
    allowedUploads: Object.keys(ALLOWED_UPLOADS), exitChecklist: EXIT_CHECKLIST, consentStatus: CONSENT_STATUS, consentGivenBy: CONSENT_GIVEN_BY,
  };
}
