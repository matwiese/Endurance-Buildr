// Demodaten (fiktiv) zum Durchspielen – aus dem Prototyp übernommen, relativ zum heutigen Datum.
// Alle Demo-Datensätze sind markiert (demo = 1) und lassen sich vollständig wieder entfernen.
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.js';
import { getSetting, setSetting } from './db.js';
import { nextAthleteId, seedConsents } from './routes/athletes.js';
import { evaluateAthlete } from './alerts.js';
import { setStatus } from './routes/medical.js';
import { addDays, nowIso, todayStr } from './util.js';

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const STAFF = [
  ['markus.huber', 'Markus Huber', 'trainer', { sports: ['Leichtathletik'] }, 'Trainer Leichtathletik'],
  ['petra.wagner', 'Petra Wagner', 'trainer', { sports: ['Schwimmen'] }, 'Trainerin Schwimmen'],
  ['sabine.kern', 'Sabine Kern', 'koordinator', { all: true }, 'Performance-Koordination'],
  ['thomas.brandl', 'Thomas Brandl', 'sportwiss', { all: true }, 'Sportwissenschaft'],
  ['katrin.wolf', 'Katrin Wolf', 'physio', { all: true }, 'Physiotherapie'],
  ['eva.lang', 'Dr. Eva Lang', 'arzt', { all: true }, 'Sportmedizin'],
  ['ruth.aigner', 'Mag. Ruth Aigner', 'psych', { all: true }, 'Sportpsychologie'],
  ['julia.pichler', 'Julia Pichler', 'dualcareer', { all: true }, 'Dual Career'],
  ['andrej.novak', 'Andrej Novak', 'data', {}, 'Performance Data'],
  ['geschaeftsfuehrung', 'Geschäftsführung', 'management', {}, 'Management'],
  ['datenschutz', 'Datenschutzbeauftragte', 'datenschutz', {}, 'DSB'],
  ['safeguarding', 'Safeguarding Officer', 'safeguarding', {}, 'Safeguarding'],
];
// name, sex, born, sport, discipline, group, club, federation, trainer, school, class, eduGoal, boarding, kader
const ATH = [
  ['Lena Berger', 'w', '2009-03-12', 'Leichtathletik', 'Sprint', 'Sprint U18', 'ULC Mödling', 'ÖLV', 'markus.huber', 'BORG Südstadt', '6B', 'Matura 2027', 1, 'Nachwuchskader'],
  ['Jonas Mayr', 'm', '2008-07-02', 'Leichtathletik', 'Sprint', 'Sprint U18', 'SVS Leichtathletik', 'ÖLV', 'markus.huber', 'BORG Südstadt', '7A', 'Matura 2026', 1, 'Nationalkader Jugend'],
  ['Sophie Gruber', 'w', '2009-11-20', 'Leichtathletik', 'Mehrkampf', 'Mehrkampf U18', 'ULC Mödling', 'ÖLV', 'markus.huber', 'BORG Südstadt', '6A', 'Matura 2027', 1, 'Nachwuchskader'],
  ['David Leitner', 'm', '2008-02-14', 'Leichtathletik', 'Speerwurf', 'Wurf U20', 'Union Baden', 'ÖLV', 'markus.huber', 'HAK Mödling', '3HK', 'Reife- und Diplomprüfung 2027', 0, 'Nachwuchskader'],
  ['Felix Steiner', 'm', '2010-05-09', 'Leichtathletik', 'Mittelstrecke', 'Lauf U16', 'LCA Wien', 'ÖLV', 'markus.huber', 'BORG Südstadt', '5B', 'Matura 2028', 1, 'Landeskader'],
  ['Emma Hofer', 'w', '2009-01-30', 'Schwimmen', 'Freistil', 'Schwimmen Jugend', 'SU Mödling', 'OSV', 'petra.wagner', 'BORG Südstadt', '6B', 'Matura 2027', 1, 'Nachwuchskader'],
  ['Paul Moser', 'm', '2008-09-17', 'Schwimmen', 'Rücken', 'Schwimmen Jugend', 'ASV Wiener Neustadt', 'OSV', 'petra.wagner', 'BORG Südstadt', '7B', 'Matura 2026', 1, 'Nationalkader Jugend'],
  ['Anna Winkler', 'w', '2010-04-03', 'Schwimmen', 'Brust', 'Schwimmen Jugend', 'SU Mödling', 'OSV', 'petra.wagner', 'NMS Maria Enzersdorf', '4A', 'Pflichtschulabschluss 2026', 0, 'Landeskader'],
  ['Laura Fuchs', 'w', '2009-06-25', 'Schwimmen', 'Lagen', 'Schwimmen Jugend', '1. Badener SC', 'OSV', 'petra.wagner', 'BORG Südstadt', '6A', 'Matura 2027', 1, 'Nachwuchskader'],
  ['Tobias Eder', 'm', '2008-12-11', 'Leichtathletik', 'Hürden', 'Sprint U18', 'ULC Mödling', 'ÖLV', 'markus.huber', 'BORG Südstadt', '7A', 'Matura 2026', 1, 'Nachwuchskader'],
];

export const demoLoaded = (db) => !!db.get('SELECT 1 AS x FROM athletes WHERE demo = 1 LIMIT 1') || !!db.get('SELECT 1 AS x FROM users WHERE demo = 1 LIMIT 1');

export async function seedDemo(db, { password, by = 'Demodaten' }) {
  if (demoLoaded(db)) throw new Error('Die Demodaten sind bereits geladen.');
  const sports = getSetting(db, 'sports', []);
  for (const sp of ['Leichtathletik', 'Schwimmen']) if (!sports.includes(sp)) sports.push(sp);
  setSetting(db, 'sports', sports);
  const hash = await hashPassword(password);
  const T = todayStr(), D = (n) => addDays(T, n), now = nowIso();
  const rnd = mulberry32(11), r = (a, b) => Math.floor(rnd() * (b - a + 1)) + a;

  return db.tx(() => {
    // ---- Personen
    const uid = {};
    for (const [uname, name, role, scope, title] of STAFF) {
      uid[uname] = db.run(`INSERT INTO users(username, display_name, role, function_title, pw_hash, must_change_pw, active, scope_all, scope_sports, demo, created_at, created_by, updated_at, pw_changed_at)
        VALUES (?,?,?,?,?,0,1,?,?,1,?,?,?,?)`, 'demo.' + uname, name, role, title, hash, scope.all ? 1 : 0, JSON.stringify(scope.sports || []), now, by, now, now).lastInsertRowid;
    }
    // ---- Athlet:innen
    const ids = [];
    ATH.forEach((a, i) => {
      const id = nextAthleteId(db);
      ids.push(id);
      db.run(`INSERT INTO athletes(id, name, sex, born, sport, discipline, group_name, club, federation, kader, school, school_class, edu_goal, boarding, guardian, emergency, entry_date, review_date, status, demo, created_at, created_by, updated_at, updated_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`, id, a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[13], a[9], a[10], a[11], a[12],
      'Erziehungsberechtigte hinterlegt (Demo)', 'Notfallkontakt hinterlegt (Demo)', D(-400 + i * 25), D(20 + i * 9), 'aktiv', now, by, now, by);
      seedConsents(db, id, a[1], by);
      for (const [fn, u] of [['Trainer:in', a[8]], ['Koordination', 'sabine.kern'], ['Sportmedizin', 'eva.lang']]) db.run('INSERT INTO athlete_staff(athlete_id, user_id, function) VALUES (?,?,?)', id, uid[u], fn);
    });
    const [LENA, JONAS, SOPHIE, DAVID, FELIX, EMMA, PAUL, ANNA, LAURA, TOBIAS] = ids;
    db.run("INSERT INTO athlete_staff(athlete_id, user_id, function) VALUES (?,?,?)", JONAS, uid['katrin.wolf'], 'Physiotherapie');
    db.run("INSERT INTO athlete_staff(athlete_id, user_id, function) VALUES (?,?,?)", SOPHIE, uid['ruth.aigner'], 'Sportpsychologie');
    // Zugang der ersten Athletin (Demo-Passwort wie die übrigen Demo-Personen)
    db.run(`INSERT INTO users(username, display_name, role, function_title, pw_hash, must_change_pw, active, athlete_id, demo, created_at, created_by, updated_at, pw_changed_at)
      VALUES (?,?,?,?,?,0,1,?,1,?,?,?,?)`, 'demo.lena.berger', 'Lena Berger', 'athlet', 'Athletin', hash, LENA, now, by, now, now);

    // ---- Tages-Check (letzte 14 Tage, mit Lücken)
    const base = { [JONAS]: [3, 3, 2, 3, 4, 3], [SOPHIE]: [3, 4, 4, 3, 3, 4] };
    const R = {};
    for (const id of ids) {
      R[id] = {};
      for (let d = -13; d <= 0; d++) {
        if (d < 0 && rnd() < 0.14) continue;
        if (d === 0 && rnd() < 0.45) continue;
        const b = base[id] || [4, 4, 4, 4, 4, 4];
        const v = b.map((x) => Math.max(1, Math.min(5, x + r(-1, 1))));
        R[id][D(d)] = { q: v, sleepH: +(6.5 + rnd() * 2.5).toFixed(1), pain: 0, symptoms: 0, comment: '' };
      }
    }
    const patch = (id, d, o) => { const cur = R[id][D(d)] || { q: [3, 3, 3, 3, 3, 3], sleepH: 7, pain: 0, symptoms: 0, comment: '' }; R[id][D(d)] = { ...cur, ...o, q: o.q ? o.q.map((x, i) => x ?? cur.q[i]) : cur.q }; };
    for (const d of [-2, -1, 0]) { patch(SOPHIE, d, { q: [2, null, null, null, 2, null], comment: d === 0 ? 'Viel los mit Schularbeiten.' : '' }); }
    for (const d of [-1, 0]) patch(DAVID, d, { q: [null, null, 2, null, null, null], pain: 1, comment: 'Ellbogen zieht beim Werfen.' });
    patch(LAURA, -1, { q: [null, null, null, 1, null, 1], symptoms: 1, comment: 'Halsweh, Fieber.' });
    for (const d of [-3, -2, -1, 0]) patch(TOBIAS, d, { q: [null, null, null, 2, null, 2] });
    for (const id of ids) for (const [d, e] of Object.entries(R[id])) {
      db.run('INSERT INTO readiness(athlete_id, date, sleep_q, recovery, soreness, fatigue, stress, ready, sleep_h, pain, symptoms, comment, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, d, ...e.q, e.sleepH, e.pain, e.symptoms, e.comment, now, now);
    }

    // ---- Einheiten
    const tr = (id, date, o) => db.run('INSERT INTO training(athlete_id, date, title, planned_min, status, duration, rpe, reason, decided_by, created_by, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, date, o.title, 90, o.status, o.duration ?? null, o.rpe ?? null, o.reason || '', o.by || '', by, now, now, by);
    for (const [i, id] of ids.entries()) {
      const sw = ATH[i][3] === 'Schwimmen';
      for (let d = -13; d <= 6; d++) {
        const dt = new Date(); dt.setDate(dt.getDate() + d); if (dt.getDay() === 0) continue;
        const title = sw ? 'Wassertraining' : 'Bahntraining';
        let o = { title, status: 'geplant' };
        if (d < 0) o = { title, status: 'vollständig', duration: r(75, 110), rpe: r(4, 7) };
        if (id === JONAS && d < 0 && d >= -9) o = { title, status: 'angepasst', duration: 50, rpe: 3, reason: 'Belastungsstatus Orange: Reha statt Sprint', by: 'Dr. Eva Lang' };
        if (id === EMMA && d < 0 && d >= -6) o = { title, status: 'vollständig', duration: r(115, 130), rpe: r(7, 8) };
        if (id === FELIX && (d === -5 || d === -2)) o = { title, status: 'nicht teilgenommen' };
        if (id === LAURA && d === -1) o = { title, status: 'nicht teilgenommen', reason: 'krank gemeldet', by: 'Petra Wagner' };
        if (id === PAUL && d === -3) o = { title, status: 'angepasst', duration: 60, rpe: 4, reason: 'Belastungsstatus Gelb: kein Rückenstart', by: 'Petra Wagner' };
        if (id === LENA && d === -4) o = { title, status: 'vollständig', duration: 90, rpe: null };
        tr(id, D(d), o);
      }
    }

    // ---- Medizin
    setStatus(db, JONAS, { color: 'orange', allowed: 'Radergometer, Oberkörperkraft, Mobilität', restricted: 'Sprints, Sprünge, exzentrische Belastung Beinrückseite', next: D(3), by: 'Dr. Eva Lang' });
    setStatus(db, PAUL, { color: 'gelb', allowed: 'Beine, Kraul mit reduziertem Umfang', restricted: 'Rückenstart, Überkopf-Kraft', next: D(6), by: 'Dr. Eva Lang' });
    setStatus(db, LAURA, { color: 'rot', allowed: '', restricted: 'keine sportliche Belastung bis Kontrolle', next: D(2), by: 'Dr. Eva Lang' });
    db.run("UPDATE load_status SET updated = ? WHERE athlete_id = ?", D(-2), JONAS); db.run("UPDATE load_status SET updated = ? WHERE athlete_id = ?", D(-5), PAUL); db.run("UPDATE load_status SET updated = ? WHERE athlete_id = ?", D(-1), LAURA);
    const inj = (id, o) => db.run(`INSERT INTO injuries(athlete_id, date, activity, setting, region, kind, type, first, onset, mechanism, diagnosis, resp, treat, rtp, return_date, full_date, closed, meds, labs, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, o.date, o.activity, o.setting, o.region, o.kind, o.type, o.first, o.onset, o.mechanism, o.diagnosis, 'Dr. Eva Lang', o.treat, o.rtp, o.returnDate || '', o.fullDate || '', o.closed ? 1 : 0, o.meds || '', '', 'Dr. Eva Lang', now, now);
    inj(JONAS, { date: D(-9), activity: 'Sprint 60 m', setting: 'Training', region: 'Oberschenkel hinten rechts', kind: 'Verletzung', type: 'Muskelverletzung', first: 'Erstauftreten', onset: 'akut', mechanism: 'Hochgeschwindigkeitslauf', diagnosis: 'Muskelfaserriss Grad I, M. biceps femoris', treat: 'Physiotherapie 3×/Woche, progressive Belastung', rtp: 2, meds: 'keine' });
    inj(PAUL, { date: D(-20), activity: 'Rückenstart', setting: 'Training', region: 'Schulter rechts', kind: 'Verletzung', type: 'Überlastung', first: 'Wiederverletzung', onset: 'schleichend', mechanism: 'wiederholte Überkopfbewegung', diagnosis: 'Subakromiales Impingement', treat: 'Physiotherapie, Rotatorenmanschetten-Programm', rtp: 4, returnDate: D(-6) });
    inj(LAURA, { date: D(-1), activity: '–', setting: 'außerhalb', region: 'Atemwege', kind: 'Erkrankung', type: 'Infekt', first: 'Erstauftreten', onset: 'akut', mechanism: '–', diagnosis: 'Infekt der oberen Atemwege mit Fieber', treat: 'Ruhe, symptomatisch', rtp: 1, meds: 'Paracetamol bei Bedarf' });
    inj(ANNA, { date: D(-160), activity: 'Landtraining', setting: 'Training', region: 'Sprunggelenk links', kind: 'Verletzung', type: 'Bandverletzung', first: 'Erstauftreten', onset: 'akut', mechanism: 'Umknicken', diagnosis: 'Distorsion OSG, Grad II', treat: 'Tape, Propriozeption', rtp: 6, returnDate: D(-139), fullDate: D(-118), closed: true });
    db.run("UPDATE consents SET status = 'erteilt', given_by = 'Athlet:in und Erziehungsberechtigte', note = 'Demo', updated_at = ? WHERE athlete_id = ? AND purpose_key IN ('cycle','video')", now, LENA);
    db.run("UPDATE consents SET status = 'erteilt', given_by = 'Erziehungsberechtigte', updated_at = ? WHERE athlete_id IN (?,?,?) AND purpose_key = 'research'", now, LENA, EMMA, JONAS);
    db.run('INSERT INTO cycle_notes(athlete_id, note, updated_at, updated_by) VALUES (?,?,?,?)', LENA, 'Zyklus regelmäßig. Eisenstatus im Normbereich (Kontrolle jährlich).', now, 'Dr. Eva Lang');

    // ---- Psychologie
    db.run('INSERT INTO psych_notes(athlete_id, date, text, author, created_at) VALUES (?,?,?,?,?)', SOPHIE, D(-6), 'Prüfungsdruck und Heimweh im Internat. Wöchentliche Gespräche vereinbart, Schlafhygiene besprochen.', 'Mag. Ruth Aigner', now);
    db.run('INSERT INTO released_hints(athlete_id, date, text, author, created_at) VALUES (?,?,?,?,?)', SOPHIE, D(-6), 'Aktuell keine zusätzlichen Abendtermine. Zwei Regenerationsblöcke pro Woche einplanen.', 'Mag. Ruth Aigner', now);
    db.run('INSERT INTO contact_requests(athlete_id, date, created_at) VALUES (?,?,?)', TOBIAS, D(-1), now);

    // ---- Entwicklungspläne
    const plan = (id, baseline, longTerm, goals, measures) => {
      db.run('INSERT INTO plans(athlete_id, baseline, long_term, updated_at, updated_by) VALUES (?,?,?,?,?)', id, baseline, longTerm, now, by);
      const gid = goals.map((g) => db.run('INSERT INTO goals(athlete_id, area, text, created_by, created_at) VALUES (?,?,?,?,?)', id, g[0], g[1], by, now).lastInsertRowid);
      for (const m of measures) db.run('INSERT INTO measures(athlete_id, goal_id, text, resp, start_date, review_date, criterion, status, result, next, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', id, gid[m[0]], m[1], m[2], m[3], m[4], m[5], 'laufend', m[6] || '', m[7] || '', by, now, now);
    };
    plan(LENA, 'Nachwuchskader, 100 m 12,05 s. Trainingsalter 4 Jahre. Voll belastbar. Schule stabil, Internat seit 2024.', 'U20-EM-Teilnahme 2028, Matura 2027, Übergang in den Seniorenkader bis 2029.',
      [['körperlich', 'Beschleunigung verbessern'], ['gesundheitlich', 'Trainingsverfügbarkeit erhöhen'], ['schulisch', 'Schulbelastung stabilisieren']],
      [[0, 'Zwei kurze Beschleunigungseinheiten pro Woche', 'Markus Huber, Athletik', D(-50), D(6), '10-m-Zeit und horizontale Kraft verbessert'], [1, 'Individuelles Präventionsprogramm', 'Katrin Wolf, Athletin', D(-70), D(-10), 'Ausfall- und Einschränkungstage sinken', '0 Ausfalltage im letzten Monat', 'fortführen'], [2, 'Lernblock Dienstag und Donnerstag', 'Julia Pichler, Schule', D(-80), D(15), 'Fehlstunden und Notenentwicklung stabil']]);
    plan(JONAS, 'Nationalkader Jugend. Aktuell eingeschränkt belastbar (Status Orange, Details nur in der medizinischen Akte).', 'Staatsmeister U20 2026, Matura 2026.', [['gesundheitlich', 'Rückkehr ins volle Sprinttraining'], ['körperlich', 'Exzentrische Kraft Beinrückseite aufbauen']],
      [[0, 'Return-to-Performance nach Stufenplan', 'Dr. Eva Lang, Katrin Wolf', D(-8), D(3), 'Freigabe Stufe 3'], [1, 'Nordic-Hamstring-Programm 2×/Woche', 'Athletik', D(-60), D(-3), 'Kraftwert +10 %']]);
    plan(SOPHIE, 'Nachwuchskader Mehrkampf. Hohe Schulbelastung.', 'Siebenkampf U18-EM 2026, Matura 2027.', [['mental', 'Belastung durch Schule und Sport ausbalancieren'], ['sporttechnisch', 'Hochsprung-Anlauf stabilisieren']],
      [[0, 'Zwei Regenerationsblöcke pro Woche, keine Abendtermine', 'Sabine Kern, Markus Huber', D(-6), D(22), 'Wohlbefinden stabil über 4 Wochen']]);
    plan(EMMA, 'Nachwuchskader Freistil.', '', [['körperlich', 'Aerobe Grundlage erhöhen']], [[0, 'Umfangsblock 4 Wochen', 'Petra Wagner', D(-10), D(18), '']]);
    [DAVID, FELIX, PAUL, ANNA, LAURA, TOBIAS].forEach((id, i) => plan(id, id === FELIX ? '' : 'Ausgangslage dokumentiert.', 'Sportliches und schulisches Ziel dokumentiert.', [['sporttechnisch', 'Technikziel der Saison']],
      [[0, 'Technikblock mit Videoanalyse', ATH[ids.indexOf(id)][8] === 'markus.huber' ? 'Markus Huber' : 'Petra Wagner', D(-40), D(i % 2 ? -4 : 12), 'Technikbewertung Trainer + Video']]));

    // ---- Entscheidungen
    const dec = (id, o) => db.run('INSERT INTO decisions(athlete_id, date, reason, info, decision, resp, affected, measure, review_date, result, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', id, o.date, o.reason, o.info, o.decision, o.resp, o.affected, o.measure, o.review, '', o.resp, now, now);
    dec(JONAS, { date: D(-8), reason: 'Akuter Schmerz im Sprinttraining', info: 'Befund Sportmedizin (Status Orange), Readiness', decision: 'Sprint- und Sprungpause, Reha nach Stufenplan', resp: 'Dr. Eva Lang', affected: 'Athlet, Trainer, Physio', measure: 'Return-to-Performance', review: D(3) });
    dec(SOPHIE, { date: D(-6), reason: 'Rückgang Wohlbefinden, Wunsch nach Unterstützung', info: 'Readiness-Verlauf, freigegebene Empfehlung Psychologie', decision: 'Keine Abendtermine, 2 Regenerationsblöcke/Woche', resp: 'Sabine Kern', affected: 'Athletin, Trainer, Internat', measure: 'Plan-Maßnahme M1', review: D(22) });

    // ---- Schule
    const trends = ['stabil', 'stabil', 'steigend', 'fallend'], subjects = ['Mathematik', 'Englisch', 'Deutsch', 'Biologie'];
    for (const id of ids) {
      db.run('INSERT INTO school(athlete_id, absences, trend, updated_at, updated_by) VALUES (?,?,?,?,?)', id, r(2, 14), trends[r(0, 3)], now, by);
      db.run('INSERT INTO exams(athlete_id, date, subject, created_by, created_at) VALUES (?,?,?,?,?)', id, D(r(3, 25)), subjects[r(0, 3)], by, now);
    }
    db.run("UPDATE school SET trend = 'fallend' WHERE athlete_id = ?", SOPHIE);
    db.run('DELETE FROM exams WHERE athlete_id IN (?,?)', LENA, SOPHIE);
    for (const [id, d, s] of [[LENA, 9, 'Mathematik-Schularbeit'], [LENA, 16, 'Englisch'], [SOPHIE, 2, 'Chemie'], [SOPHIE, 9, 'Mathematik-Schularbeit']]) db.run('INSERT INTO exams(athlete_id, date, subject, created_by, created_at) VALUES (?,?,?,?,?)', id, D(d), s, by, now);

    // ---- Termine
    for (const [d, title, type, sport] of [[10, 'Hallenmeeting Linz', 'Wettkampf', 'Leichtathletik'], [9, 'Anreise Linz', 'Reise', 'Leichtathletik'], [12, 'Österr. Jugendmeisterschaften Kurzbahn', 'Wettkampf', 'Schwimmen'], [4, 'Leistungsdiagnostik Quartal', 'Test', 'Leichtathletik']]) {
      db.run('INSERT INTO events(date, title, type, sport, demo, created_by, created_at) VALUES (?,?,?,?,1,?,?)', D(d), title, type, sport, by, now);
    }

    // ---- Messwerte (teilweise mit Auffälligkeiten → Datenqualität)
    const meas = (id, d, variable, value, unit, source) => db.run('INSERT INTO measurements(athlete_id, date, variable, value, raw_value, unit, source, status, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', id, D(d), variable, value, value, unit, source, 'ok', by, now).lastInsertRowid;
    const flag = (id, variable, value, rule, source, refType = '', refId = null, ts = T) => db.run('INSERT INTO quality_flags(athlete_id, variable, value, rule, source, ts, ref_type, ref_id) VALUES (?,?,?,?,?,?,?,?)', id, variable, value, rule, source, ts, refType, refId);
    for (const id of ids) for (const [d, kg] of [[-60, 0], [-30, 0.8], [-3, 1.2]]) meas(id, d, 'Körpermasse', +((id === JONAS ? 72 : 58) + kg).toFixed(1), 'kg', 'Waage');
    meas(LENA, -40, '10-m-Zeit', 1.91, 's', 'Lichtschranke');
    const m1 = meas(LENA, -6, '10-m-Zeit', 1.62, 's', 'Lichtschranke');
    db.run("UPDATE measurements SET status = 'markiert' WHERE id = ?", m1); flag(LENA, '10-m-Zeit', '1,62 s (Vorwert 1,91 s)', 'Ungewöhnlicher Sprung > 10 %', 'Lichtschranke', 'measurement', m1, D(-6));
    const m2 = meas(FELIX, -2, 'Körpermasse', 520, 'kg', 'Import Waage');
    db.run("UPDATE measurements SET status = 'markiert' WHERE id = ?", m2); flag(FELIX, 'Körpermasse', '520 kg', 'Unmöglicher Wert (Plausibilitätsgrenze 25–200 kg)', 'Import Waage', 'measurement', m2, D(-2));
    flag(EMMA, 'Session-RPE', '14', 'Außerhalb der Skala 0–10', 'Athleten-App', '', null, D(-3));
    flag(PAUL, 'Trainingsdauer', '2 Einträge, gleiche Einheit', 'Duplikat', 'Trainer-Eingabe', '', null, D(-4));
    flag(ANNA, 'Tages-Check', 'Zeitstempel morgen 06:30', 'Zeitstempel in der Zukunft', 'Athleten-App', '', null, D(-1));

    // ---- Safeguarding
    db.run("INSERT INTO safe_cases(id, date, text, anon, status, steps, demo, created_at, updated_at) VALUES ('SG-01', ?, ?, 1, 'in Bearbeitung', ?, 1, ?, ?)", D(-12), 'Hinweis auf wiederholt abwertende Kommentare in einer Trainingsgruppe.', 'Gespräch mit Hinweisgeber:in geführt, Schutzkonzept geprüft.', now, now);

    // ---- Hinweise aus den Regeln erzeugen
    for (const id of ids) evaluateAthlete(db, id, T);
    db.run("UPDATE alerts SET stage = 2, status = 'in Prüfung', note = 'Gespräch mit Athlet und Physio vereinbart.' WHERE athlete_id = ? AND rule = 'pain'", DAVID);
    db.run('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)', 'demo_loaded_at', JSON.stringify(now));
    return { athletes: ids.length, users: STAFF.length + 1, ids };
  });
}

export function removeDemo(db, config) {
  const ids = db.all('SELECT id FROM athletes WHERE demo = 1').map((a) => a.id);
  const res = db.tx(() => {
    const users = db.run('DELETE FROM users WHERE demo = 1').changes;
    db.run('DELETE FROM athletes WHERE demo = 1');
    const events = db.run('DELETE FROM events WHERE demo = 1').changes;
    const cases = db.run('DELETE FROM safe_cases WHERE demo = 1').changes;
    db.run("DELETE FROM settings WHERE key = 'demo_loaded_at'");
    return { athletes: ids.length, users, events, cases };
  });
  for (const id of ids) { try { fs.rmSync(path.join(config.docsDir, id), { recursive: true, force: true }); } catch { /* kein Ordner */ } }
  return res;
}
