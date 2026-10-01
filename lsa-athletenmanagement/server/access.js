// Zentrale Zugriffsprüfung für alles, was an einer Athlet:innen-Akte hängt.
// Regel: Erst Athletenbereich (inScope), dann Stufe des jeweiligen Reiters (tabLevel).
// Unbekannte oder nicht sichtbare Akten liefern dasselbe 404 – es wird nicht verraten, ob sie existieren.
import { forbidden, notFound } from './http.js';
import { audit } from './auth.js';
import { effectivePerms, inScope, tabLevel, TAB_KEYS } from './permissions.js';
import { DOC_CATEGORIES } from './catalog.js';

export const isAssigned = (db, userId, athleteId) =>
  !!db.get('SELECT 1 AS x FROM athlete_staff WHERE athlete_id = ? AND user_id = ? LIMIT 1', athleteId, userId);

// Alle Akten, die die Person sehen darf.
export function visibleAthletes(db, user) {
  if (user.role === 'athlet') return user.athlete_id ? db.all('SELECT * FROM athletes WHERE id = ?', user.athlete_id) : [];
  if (effectivePerms(user).tabs.overview === 'none') return [];
  const rows = db.all(
    `SELECT a.*, EXISTS(SELECT 1 FROM athlete_staff s WHERE s.athlete_id = a.id AND s.user_id = ?) AS assigned
     FROM athletes a ORDER BY a.name COLLATE NOCASE`, user.id);
  return rows.filter((a) => inScope(user, a, !!a.assigned));
}

// Sichtbare Akten samt Zugriffsstufen je Reiter (eine Abfrage statt vieler)
export function visibleWithLevels(db, user) {
  return visibleAthletes(db, user).map((a) => {
    const assigned = !!a.assigned;
    const levels = {};
    for (const t of TAB_KEYS) levels[t] = tabLevel(user, a, t, assigned);
    return { athlete: a, assigned, levels };
  });
}

export function accessFor(db, ctx, athleteId, { quiet = false } = {}) {
  const a = db.get('SELECT * FROM athletes WHERE id = ?', String(athleteId));
  const assigned = a ? isAssigned(db, ctx.user.id, a.id) : false;
  if (!a || !inScope(ctx.user, a, assigned)) {
    if (!quiet) audit(db, ctx, { athleteId: String(athleteId).slice(0, 30), area: 'Akte', action: 'Akte angefragt (kein Zugriff oder unbekannt)', result: 'verweigert', dedupe: true });
    throw notFound('Akte nicht gefunden.');
  }
  const levels = {};
  for (const t of TAB_KEYS) levels[t] = tabLevel(ctx.user, a, t, assigned);
  return { athlete: a, assigned, levels };
}

// Verlangt eine der Stufen für einen Reiter. Sonst: 403 + Protokoll "verweigert".
export function need(db, ctx, acc, tab, allowed, what = 'Zugriff') {
  if (allowed.includes(acc.levels[tab])) return acc.levels[tab];
  audit(db, ctx, { athleteId: acc.athlete.id, area: tabArea(tab), action: `${what} verweigert (Reiter ${tab})`, result: 'verweigert', dedupe: true });
  throw forbidden('Für diesen Bereich fehlt die Berechtigung.');
}

export const tabArea = (tab) => ({ health: 'Medizin', psych: 'Psychologie', school: 'Schule', privacy: 'Datenschutz' }[tab] || 'Performance');

// Lesen/Schreiben einer Dokumentkategorie
export function catAccess(acc, category) {
  const c = DOC_CATEGORIES[category];
  if (!c) return { read: false, write: false, own: false };
  const lvl = acc.levels[c.tab];
  return { read: c.read.includes(lvl) || lvl === 'own', write: c.write.includes(lvl), own: lvl === 'own' };
}

export function athleteDto(a) {
  return {
    id: a.id, name: a.name, sex: a.sex, born: a.born, sport: a.sport, discipline: a.discipline, group: a.group_name, club: a.club,
    federation: a.federation, kader: a.kader, school: a.school, schoolClass: a.school_class, eduGoal: a.edu_goal, boarding: !!a.boarding,
    guardian: a.guardian, emergency: a.emergency, entryDate: a.entry_date, reviewDate: a.review_date, status: a.status,
    exitChecklist: (() => { try { return JSON.parse(a.exit_checklist || '[]'); } catch { return []; } })(), demo: !!a.demo,
  };
}
