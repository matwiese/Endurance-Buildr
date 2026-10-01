// Hinweis-Logik (Prototyp Kap. 17): Regeln erzeugen NIE Diagnosen, nur Prüfaufträge für Menschen.
import { addDays, dayDiff, nowIso, todayStr } from './util.js';
import { weekLoad } from './domain.js';
import { ALERT_CATS_BY_ROLE } from './catalog.js';
import { audit, writeAudit } from './auth.js';

const teamName = (db, athleteId, fn, fallback) =>
  db.get('SELECT u.display_name AS n FROM athlete_staff s JOIN users u ON u.id = s.user_id WHERE s.athlete_id = ? AND s.function = ? AND u.active = 1 ORDER BY u.display_name LIMIT 1', athleteId, fn)?.n || fallback;

// Prüft alle Regeln für eine Athlet:in und legt fehlende Hinweise an. Gibt die neu erzeugten zurück.
export function evaluateAthlete(db, athleteId, today = todayStr()) {
  const created = [];
  const add = (rule, trigger, cat, resp, extra = {}) => {
    if (db.get("SELECT 1 AS x FROM alerts WHERE athlete_id = ? AND rule = ? AND status != 'erledigt'", athleteId, rule)) return;
    const now = nowIso();
    const id = db.run(
      `INSERT INTO alerts(athlete_id, rule, trigger_text, cat, stage, resp, control, status, note, confidential, created_at, created, updated_at)
       VALUES (?,?,?,?,1,?,?,'offen','',?,?,?,?)`,
      athleteId, rule, trigger, cat, resp, addDays(today, 2), extra.confidential ? 1 : 0, now, today, now).lastInsertRowid;
    created.push({ id, rule, trigger, cat });
  };
  const coord = teamName(db, athleteId, 'Koordination', 'Koordination');

  const rows = db.all('SELECT * FROM readiness WHERE athlete_id = ? AND date BETWEEN ? AND ? ORDER BY date', athleteId, addDays(today, -13), today);
  const recent = rows.filter((r) => dayDiff(r.date, today) >= -1);
  if (recent.some((r) => r.pain)) add('pain', 'Akuter Schmerz gemeldet', 'health', coord);
  if (recent.some((r) => r.symptoms)) add('symptoms', 'Krankheitssymptome gemeldet', 'health', coord);
  const last4 = rows.slice(-4);
  if (last4.filter((r) => r.ready <= 2).length >= 3) add('ready-low', 'Mehrere Tage reduzierte Trainingsbereitschaft', 'perf', coord);
  const last2 = rows.slice(-2);
  if (last2.length === 2 && last2.every((r) => r.stress <= 2)) add('well-low', 'Deutlicher Rückgang des Wohlbefindens', 'well', coord);

  const miss = db.get("SELECT COUNT(*) AS n FROM training WHERE athlete_id = ? AND status = 'nicht teilgenommen' AND reason = '' AND date BETWEEN ? AND ?", athleteId, addDays(today, -7), today).n;
  if (miss >= 2) add('absent', 'Wiederholtes Fernbleiben ohne Grund', 'perf', coord);

  const w0 = weekLoad(db, athleteId, 0, today), w1 = weekLoad(db, athleteId, 1, today);
  if (w1 > 0 && (w0 - w1) / w1 > 0.3) add('load', `Starke Veränderung der Trainingsbelastung (+${Math.round(((w0 - w1) / w1) * 100)} %)`, 'perf', teamName(db, athleteId, 'Sportwissenschaft', 'Sportwissenschaft'));

  if (db.get("SELECT 1 AS x FROM contact_requests WHERE athlete_id = ? AND status = 'offen' LIMIT 1", athleteId)) {
    add('contact', 'Wunsch nach vertraulichem Gespräch', 'conf', teamName(db, athleteId, 'Sportpsychologie', 'Sportpsychologie'), { confidential: true });
  }
  if (created.length) writeAudit(db, { athlete_id: athleteId, area: 'Hinweise', action: `Hinweis(e) erzeugt: ${created.map((c) => c.trigger).join('; ')}`, user_name: 'System (Regelprüfung)', role: '' , detail: 'menschliche Prüfung erforderlich' });
  return created;
}

// Welche Hinweise darf diese Person sehen? (Kategorie je Rolle, Akte im Athletenbereich, Akutprozess nur Koordination/Medizin/Psychologie)
export function alertVisible(user, al, athleteIds) {
  if (!athleteIds.has(al.athlete_id)) return false;
  if (al.confidential) return user.role === 'psych';
  if (al.stage === 5) return ['koordinator', 'arzt', 'psych'].includes(user.role);
  return (ALERT_CATS_BY_ROLE[user.role] || []).includes(al.cat);
}

export const alertDto = (a) => ({
  id: a.id, athleteId: a.athlete_id, trigger: a.trigger_text, cat: a.cat, stage: a.stage, resp: a.resp, control: a.control, status: a.status,
  note: a.note, confidential: !!a.confidential, created: a.created, updatedAt: a.updated_at,
});
