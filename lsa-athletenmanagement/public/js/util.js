// Kleine Helfer für Darstellung und Daten
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const TODAY = isoDate();
export const addDays = (n, from = TODAY) => { const [y, m, d] = from.split('-').map(Number); return isoDate(new Date(y, m - 1, d + n)); };
export const dayDiff = (s, from = TODAY) => Math.round((new Date(s + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000);
export const fmt = (s) => { if (!s) return '–'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };
export const fmtS = (s) => { if (!s) return '–'; const [, m, d] = s.split('-'); return `${d}.${m}.`; };
export const wd = (s) => ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(s + 'T00:00:00').getDay()];
export const fmtTs = (iso) => { if (!iso) return '–'; const d = new Date(iso); return d.toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' }); };
export const fmtSize = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`;
export const pct = (x) => (x == null ? '–' : Math.round(x * 100) + ' %');

export function slugUsername(name) {
  const map = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };
  return String(name || '').replace(/[äöüßÄÖÜ]/g, (c) => map[c]).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(dr|mag|dipl|ing|prof)\.?\s+/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 40);
}

export const AREAS = ['Performance', 'Medizin', 'Psychologie', 'Schule', 'Safeguarding'];
// Farbklasse für Berechtigungsstufen in der Kopfzeile (wie im Prototyp)
export const lvl = (t) => ['ja', 'vollständig', 'vollständig eigener Bereich', 'eigener Fallbereich', 'vollständig erforderlich'].includes(t) ? 'full'
  : t === 'nein' ? 'none' : (t === 'aggregiert' || t === 'Prüfung und Audit') ? 'agg' : t.startsWith('eigene') ? 'own' : 'limited';

export function ageOf(born, on = TODAY) {
  if (!born) return null;
  const [y, m, d] = born.split('-').map(Number), [ty, tm, td] = on.split('-').map(Number);
  let a = ty - y;
  if (tm < m || (tm === m && td < d)) a--;
  return a;
}
export const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
