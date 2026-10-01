// Auskunft/Export einer Akte: enthält nur, was die anfragende Person selbst sehen darf (gleiche Stufen wie in der Oberfläche).
import { athleteDto, catAccess } from './access.js';
import { DOC_CATEGORIES } from './catalog.js';
import { ROLES } from './permissions.js';
import { nowIso } from './util.js';
import { planDto, readinessDto, sessionDto } from './routes/performance.js';
import { statusDto, injuryDto } from './routes/medical.js';
import { hintDto } from './routes/psych.js';

export function buildExport(db, user, acc) {
  const a = acc.athlete, L = acc.levels, id = a.id;
  const out = { format: 'LSA-Akte', version: 1, exportedAt: nowIso(), exportedBy: `${user.display_name} (${ROLES[user.role]?.label})`, hinweis: 'Dieser Export enthält nur Daten, die die exportierende Person im System sehen darf. Dateien werden hier nur aufgeführt und lassen sich im Reiter „Dokumente & Notizen“ herunterladen.', athlete: athleteDto(a), sections: {}, nichtEnthalten: [] };
  const S = out.sections;
  const skip = (tab, label) => out.nichtEnthalten.push(label);

  S.betreuungsteam = db.all('SELECT s.function, u.display_name AS name FROM athlete_staff s JOIN users u ON u.id = s.user_id WHERE s.athlete_id = ?', id);

  if (L.plan !== 'none') S.entwicklungsplan = planDto(db, id); else skip('plan', 'Entwicklungsplan');
  if (['read', 'full', 'own', 'wellbeing'].includes(L.monitoring)) {
    const wb = L.monitoring === 'wellbeing';
    S.tagesCheck = db.all('SELECT * FROM readiness WHERE athlete_id = ? ORDER BY date', id).map((r) => ({ date: r.date, ...readinessDto(r, wb) }));
    if (!wb) {
      S.trainingseinheiten = db.all('SELECT * FROM training WHERE athlete_id = ? ORDER BY date, id', id).map(sessionDto);
      S.messwerte = db.all('SELECT date, variable, value, raw_value AS rawValue, unit, source, note, status FROM measurements WHERE athlete_id = ? ORDER BY date', id);
    }
  } else skip('monitoring', 'Monitoring und Messwerte');
  if (['status', 'physio', 'full', 'own'].includes(L.health)) {
    S.belastungsstatus = statusDto(db.get('SELECT * FROM load_status WHERE athlete_id = ?', id));
    if (L.health !== 'status') {
      S.verletzungenErkrankungen = db.all('SELECT * FROM injuries WHERE athlete_id = ? ORDER BY date', id).map((i) => injuryDto(i, L.health));
    }
    if (['full', 'own'].includes(L.health) && a.sex === 'w' && db.get("SELECT status FROM consents WHERE athlete_id = ? AND purpose_key = 'cycle'", id)?.status === 'erteilt') {
      S.athletinnengesundheit = db.get('SELECT note FROM cycle_notes WHERE athlete_id = ?', id)?.note || '';
    }
  } else skip('health', 'Gesundheit');
  if (['released', 'own', 'full'].includes(L.psych)) {
    S.freigegebeneHinweise = db.all('SELECT * FROM released_hints WHERE athlete_id = ? ORDER BY date', id).map(hintDto);
    if (L.psych === 'full') S.psychologischeNotizen = db.all('SELECT date, text, author FROM psych_notes WHERE athlete_id = ? ORDER BY date', id);
  } else skip('psych', 'Psychologie');
  if (['planning', 'full', 'own'].includes(L.school)) {
    S.pruefungen = db.all('SELECT date, subject FROM exams WHERE athlete_id = ? ORDER BY date', id);
    if (L.school !== 'planning') { const s = db.get('SELECT absences, trend FROM school WHERE athlete_id = ?', id); S.schulstatus = s || { absences: 0, trend: '–' }; }
  } else skip('school', 'Schule');
  if (L.decisions !== 'none') S.entscheidungen = db.all('SELECT date, reason, info, decision, resp, affected, measure, review_date AS review, result FROM decisions WHERE athlete_id = ? ORDER BY date', id);
  else skip('decisions', 'Entscheidungsprotokoll');
  if (['full', 'own'].includes(L.privacy)) {
    S.einwilligungen = db.all('SELECT purpose, basis, status, given_by AS givenBy, note, updated_at AS updatedAt FROM consents WHERE athlete_id = ?', id);
    S.zugriffsprotokoll = db.all('SELECT ts, role, area, action, result FROM audit WHERE athlete_id = ? ORDER BY id DESC LIMIT 500', id);
  } else skip('privacy', 'Einwilligungen und Zugriffsprotokoll');

  S.akteneintraege = db.all('SELECT * FROM entries WHERE athlete_id = ? ORDER BY created_at', id)
    .filter((e) => { const ca = catAccess(acc, e.category); return ca.read && (!ca.own || e.visible_to_athlete); })
    .map((e) => ({ kategorie: DOC_CATEGORIES[e.category]?.label || e.category, titel: e.title, text: e.text, datei: e.file_name ? { name: e.file_name, groesse: e.size, sha256: e.sha256 } : null, erstelltVon: e.created_by, erstelltAm: e.created_at }));
  return out;
}
