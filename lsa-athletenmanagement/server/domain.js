// Fachliche Berechnungen (Belastung, Vollständigkeit, Verfügbarkeit, Plan) – ein Ort für Server und Kennzahlen.
import { addDays, todayStr } from './util.js';

// Interne Belastung: Summe Dauer × Session-RPE. off=0: letzte 7 Tage (heute inkl.), off=1: die Woche davor.
export function weekLoad(db, athleteId, off = 0, today = todayStr()) {
  const from = addDays(today, -6 - 7 * off), to = addDays(today, -7 * off);
  return db.get(
    'SELECT COALESCE(SUM(duration * rpe), 0) AS v FROM training WHERE athlete_id = ? AND rpe IS NOT NULL AND duration IS NOT NULL AND date BETWEEN ? AND ?',
    athleteId, from, to).v;
}

// Tages-Check-Vollständigkeit der letzten 14 Tage (fehlende Tage zählen als Lücke, nicht als Null)
export function completeness(db, athleteId, today = todayStr()) {
  const n = db.get('SELECT COUNT(*) AS n FROM readiness WHERE athlete_id = ? AND date BETWEEN ? AND ?', athleteId, addDays(today, -13), today).n;
  return n / 14;
}

// Trainingsverfügbarkeit: vollständig absolvierte / geplante Einheiten der letzten 13 Tage
export function availability(db, athleteId, today = todayStr()) {
  const r = db.get(
    "SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'vollständig' THEN 1 ELSE 0 END) AS ok FROM training WHERE athlete_id = ? AND date BETWEEN ? AND ?",
    athleteId, addDays(today, -13), addDays(today, -1));
  return r.n ? r.ok / r.n : null;
}

export function planComplete(db, athleteId) {
  const p = db.get('SELECT baseline, long_term FROM plans WHERE athlete_id = ?', athleteId);
  if (!p || !p.baseline || !p.long_term) return false;
  if (!db.get('SELECT 1 AS x FROM goals WHERE athlete_id = ? LIMIT 1', athleteId)) return false;
  const ms = db.all('SELECT resp, review_date, criterion FROM measures WHERE athlete_id = ?', athleteId);
  return ms.length > 0 && ms.every((m) => m.resp && m.review_date && m.criterion);
}
