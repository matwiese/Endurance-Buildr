import crypto from 'node:crypto';

const pad = (n) => String(n).padStart(2, '0');

// Lokales Datum als JJJJ-MM-TT (der Server läuft auf dem Laptop, Browser und Server teilen sich die Zeitzone).
export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return todayStr(x);
}
export function dayDiff(dateStr, from = todayStr()) {
  const a = new Date(dateStr + 'T00:00:00'), b = new Date(from + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}
export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const x = new Date(y, m - 1, d);
  return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d;
}
export const nowIso = () => new Date().toISOString();

const PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function randomPassword(len = 12) {
  let s = '';
  for (let i = 0; i < len; i++) s += PW_ALPHABET[crypto.randomInt(PW_ALPHABET.length)];
  return s;
}
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function slugUsername(name) {
  const map = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };
  return String(name || '')
    .replace(/[äöüßÄÖÜ]/g, (c) => map[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(dr|mag|dipl|ing|prof)\.?\s+/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40);
}

export const str = (v, max = 500) => (v == null ? '' : String(v).trim().slice(0, max));
export const bool = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
export const jsonParse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
