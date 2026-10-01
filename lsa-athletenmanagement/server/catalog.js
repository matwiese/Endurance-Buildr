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

export function catalogForClient() {
  return {
    sex: SEX, lifecycle: LIFECYCLE, teamFunctions: TEAM_FUNCTIONS, teamFunctionByRole: TEAM_FUNCTION_BY_ROLE,
    docCategories: Object.fromEntries(Object.entries(DOC_CATEGORIES).map(([k, v]) => [k, { label: v.label, tab: v.tab }])),
    allowedUploads: Object.keys(ALLOWED_UPLOADS), exitChecklist: EXIT_CHECKLIST, consentStatus: CONSENT_STATUS, consentGivenBy: CONSENT_GIVEN_BY,
  };
}
