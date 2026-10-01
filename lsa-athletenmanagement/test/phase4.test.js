import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, setupAdmin, makeUser, downgrade } from './helpers.js';
import { addDays, todayStr } from '../server/util.js';

let t, admin, koord, trainerLA, trainerSW, arzt, physio, psych, sportwiss, dc, lena, A1, A2;
const today = todayStr();
const ath = (o = {}) => ({ name: 'Lena Berger', born: '2009-03-12', sex: 'w', sport: 'Leichtathletik', discipline: 'Sprint', ...o });
const INJ = (o = {}) => ({ date: addDays(today, -3), activity: 'Sprint 60 m', setting: 'Training', region: 'Oberschenkel hinten rechts', kind: 'Verletzung', type: 'Muskelverletzung', first: 'Erstauftreten', onset: 'akut', mechanism: 'Hochgeschwindigkeitslauf', diagnosis: 'Muskelfaserriss Grad I', treat: 'Physiotherapie', meds: 'keine', labs: 'CK erhöht', ...o });

before(async () => {
  t = await startTestApp();
  admin = await setupAdmin(t);
  const mk = async (username, displayName, role, scope) => (await makeUser(t, admin, { username, displayName, role, scope })).client;
  koord = await mk('koord', 'Sabine Kern', 'koordinator', { all: true });
  trainerLA = await mk('trainer.la', 'Markus Huber', 'trainer', { sports: ['Leichtathletik'] });
  trainerSW = await mk('trainer.sw', 'Petra Wagner', 'trainer', { sports: ['Schwimmen'] });
  arzt = await mk('arzt', 'Dr. Eva Lang', 'arzt', { all: true });
  physio = await mk('physio', 'Katrin Wolf', 'physio', { all: true });
  psych = await mk('psych', 'Ruth Aigner', 'psych', { all: true });
  sportwiss = await mk('sportwiss', 'Thomas Brandl', 'sportwiss', { all: true });
  dc = await mk('dual.career', 'Julia Pichler', 'dualcareer', { all: true });
  A1 = (await koord.post('/api/athletes', ath())).data.id;
  A2 = (await koord.post('/api/athletes', ath({ name: 'Emma Hofer', sport: 'Schwimmen', discipline: 'Freistil', born: '2009-01-30' }))).data.id;
  const r = await koord.post(`/api/athletes/${A1}/login`, { username: 'lena.berger' });
  lena = t.client();
  await lena.post('/api/login', { username: 'lena.berger', password: r.data.temporaryPassword });
  await lena.post('/api/password', { current: r.data.temporaryPassword, next: 'Lena-Passwort-123' });
});
after(async () => { await t.stop(); });

test('Belastungsstatus: nur Medizin setzt, Pflichtfelder bei Gelb/Orange/Rot, Historie', async () => {
  assert.equal((await trainerLA.post(`/api/athletes/${A1}/status`, { color: 'rot' })).status, 403);
  assert.equal((await physio.post(`/api/athletes/${A1}/status`, { color: 'rot' })).status, 403);
  assert.equal((await koord.post(`/api/athletes/${A1}/status`, { color: 'rot' })).status, 403);
  assert.equal((await arzt.post(`/api/athletes/${A1}/status`, { color: 'orange', allowed: 'Radergometer', restricted: '', next: addDays(today, 3) })).status, 400);
  assert.equal((await arzt.post(`/api/athletes/${A1}/status`, { color: 'orange', allowed: 'Radergometer', restricted: 'Sprints, Sprünge', next: '' })).status, 400);
  assert.equal((await arzt.post(`/api/athletes/${A1}/status`, { color: 'violett' })).status, 400);
  const ok = await arzt.post(`/api/athletes/${A1}/status`, { color: 'orange', allowed: 'Radergometer, Oberkörperkraft', restricted: 'Sprints, Sprünge', next: addDays(today, 3) });
  assert.equal(ok.status, 200);
  // Ampel sehen: Trainer, Koordination, Sportwiss, Psych, Athlet:in – Dual Career nicht
  for (const [name, c] of [['trainer', trainerLA], ['koord', koord], ['sportwiss', sportwiss], ['psych', psych]]) {
    const h = await c.get(`/api/athletes/${A1}/health`);
    assert.equal(h.status, 200, name);
    assert.equal(h.data.level, 'status', name);
    assert.equal(h.data.status.color, 'orange', name);
    assert.equal(h.data.injuries, undefined, name + ': keine Diagnosen');
  }
  assert.equal((await dc.get(`/api/athletes/${A1}/health`)).status, 403);
  assert.equal((await trainerSW.get(`/api/athletes/${A1}/health`)).status, 404);
  assert.equal(t.db.get('SELECT COUNT(*) AS n FROM status_history WHERE athlete_id = ?', A1).n, 1);
  // Trainer sieht Status auch im core
  assert.equal((await trainerLA.get('/api/core')).data.status[A1].color, 'orange');
  assert.deepEqual((await dc.get('/api/core')).data.status, {});
  // Zurück auf Grün leert Einschränkung
  await arzt.post(`/api/athletes/${A1}/status`, { color: 'gruen' });
  assert.equal((await koord.get(`/api/athletes/${A1}/health`)).data.status.restricted, '');
  await arzt.post(`/api/athletes/${A1}/status`, { color: 'orange', allowed: 'Radergometer', restricted: 'Sprints', next: addDays(today, 3) });
});

test('Verletzungsregister: Medizin vollständig, Physio fachlich erforderlich (ohne Medikation/Labor), Trainer gar nicht', async () => {
  assert.equal((await trainerLA.post(`/api/athletes/${A1}/injuries`, INJ())).status, 403);
  assert.equal((await arzt.post(`/api/athletes/${A1}/injuries`, INJ({ diagnosis: '' }))).status, 400);
  assert.equal((await arzt.post(`/api/athletes/${A1}/injuries`, INJ({ date: addDays(today, 5) }))).status, 400);
  assert.equal((await arzt.post(`/api/athletes/${A1}/injuries`, INJ({ kind: 'Sonstiges' }))).status, 400);
  const mk = await arzt.post(`/api/athletes/${A1}/injuries`, INJ({ color: 'orange', allowed: 'Rad', restricted: 'Sprints', next: addDays(today, 4) }));
  assert.equal(mk.status, 200);
  const id = mk.data.id;
  const full = (await arzt.get(`/api/athletes/${A1}/health`)).data;
  assert.equal(full.injuries[0].diagnosis, 'Muskelfaserriss Grad I');
  assert.equal(full.injuries[0].meds, 'keine');
  assert.equal(full.injuries[0].daysLost, 3);
  const ph = (await physio.get(`/api/athletes/${A1}/health`)).data;
  assert.equal(ph.level, 'physio');
  assert.equal(ph.injuries[0].diagnosis, 'Muskelfaserriss Grad I');
  assert.equal(ph.injuries[0].meds, undefined);
  assert.equal(ph.injuries[0].labs, undefined);
  assert.equal(ph.canRtp, true); assert.equal(ph.canSetStatus, false);
  // Register-Übersicht
  const reg = (await arzt.get('/api/injuries')).data;
  assert.equal(reg.injuries.length, 1);
  assert.equal(reg.canWrite, true);
  assert.equal((await physio.get('/api/injuries')).data.canWrite, false);
  for (const c of [trainerLA, koord, psych, dc, lena]) assert.equal((await c.get('/api/injuries')).status, 403);
  // Reha-Stufen: Physio darf, Trainer nicht
  assert.equal((await physio.put(`/api/injuries/${id}/rtp`, { delta: 1 })).data.rtp, 2);
  assert.equal((await trainerLA.put(`/api/injuries/${id}/rtp`, { delta: 1 })).status, 403);
  assert.equal((await physio.put(`/api/injuries/${id}/rtp`, { delta: 2 })).data.rtp, 4);
  assert.equal((await physio.put(`/api/injuries/${id}/rtp`, { delta: 10 })).data.rtp, 6);
  assert.equal((await physio.put(`/api/injuries/${id}/rtp`, { delta: -10 })).data.rtp, 1);
  await arzt.put(`/api/injuries/${id}/rtp`, { delta: 3 });
  assert.ok((await arzt.get(`/api/athletes/${A1}/health`)).data.injuries[0].returnDate, 'Rückkehrdatum bei Stufe 4 gesetzt');
  // Physio darf nicht ändern/abschließen/löschen
  assert.equal((await physio.put(`/api/injuries/${id}`, INJ())).status, 403);
  assert.equal((await physio.post(`/api/injuries/${id}/close`)).status, 403);
  assert.equal((await physio.del(`/api/injuries/${id}`)).status, 403);
  assert.equal((await arzt.post(`/api/injuries/${id}/close`)).status, 200);
  assert.equal((await arzt.put(`/api/injuries/${id}/rtp`, { delta: 1 })).status, 400); // abgeschlossen
  const closed = (await arzt.get(`/api/athletes/${A1}/health`)).data.injuries[0];
  assert.equal(closed.closed, true); assert.equal(closed.rtp, 6);
  // Athletin sieht ihre eigenen Fälle (ohne Medikation)
  const own = (await lena.get(`/api/athletes/${A1}/health`)).data;
  assert.equal(own.level, 'own');
  assert.equal(own.injuries[0].meds, undefined);
  assert.equal(own.status.color, 'orange');
  // Zugriffe wurden protokolliert
  const log = (await admin.get('/api/audit?area=Medizin&q=Gesundheitsreiter')).data.rows;
  assert.ok(log.some((r) => r.result === 'nur Status') && log.some((r) => r.result === 'vollständig') && log.some((r) => r.result === 'fachlich erforderlich'));
  assert.ok((await admin.get('/api/audit?result=verweigert&area=Medizin')).data.rows.length >= 1);
});

test('Athletinnengesundheit nur mit Einwilligung', async () => {
  assert.equal((await arzt.put(`/api/athletes/${A1}/cycle`, { note: 'regelmäßig' })).status, 400);
  assert.equal((await arzt.get(`/api/athletes/${A1}/health`)).data.cycle.consent, false);
  await lena.put(`/api/athletes/${A1}/consents/cycle`, { status: 'erteilt' });
  assert.equal((await arzt.put(`/api/athletes/${A1}/cycle`, { note: 'Zyklus regelmäßig, Eisenstatus im Normbereich' })).status, 200);
  assert.equal((await arzt.get(`/api/athletes/${A1}/health`)).data.cycle.note, 'Zyklus regelmäßig, Eisenstatus im Normbereich');
  assert.equal((await lena.get(`/api/athletes/${A1}/health`)).data.cycle.note, 'Zyklus regelmäßig, Eisenstatus im Normbereich');
  assert.equal((await physio.get(`/api/athletes/${A1}/health`)).data.cycle, undefined);
  assert.equal((await trainerLA.get(`/api/athletes/${A1}/health`)).data.cycle, undefined);
  // Widerruf blendet die Notiz aus
  await lena.put(`/api/athletes/${A1}/consents/cycle`, { status: 'widerrufen' });
  assert.equal((await arzt.get(`/api/athletes/${A1}/health`)).data.cycle.note, '');
});

test('Psychologie: geschützter Bereich, Freigabe nur mit Zustimmung, Trainer sehen nur den Hinweistext', async () => {
  // Psychologin legt Notiz an
  assert.equal((await trainerLA.post(`/api/athletes/${A1}/psych/notes`, { text: 'x' })).status, 403);
  assert.equal((await arzt.post(`/api/athletes/${A1}/psych/notes`, { text: 'x' })).status, 403);
  assert.equal((await psych.post(`/api/athletes/${A1}/psych/notes`, { text: '' })).status, 400);
  assert.equal((await psych.post(`/api/athletes/${A1}/psych/notes`, { text: 'Prüfungsdruck und Heimweh im Internat.' })).status, 200);
  // Freigabe: ohne Zustimmung abgelehnt
  assert.equal((await psych.post(`/api/athletes/${A1}/psych/hints`, { text: 'Keine Abendtermine' })).status, 400);
  assert.equal((await psych.post(`/api/athletes/${A1}/psych/hints`, { text: 'Keine Abendtermine', consent: true })).status, 200);
  assert.equal((await trainerLA.post(`/api/athletes/${A1}/psych/hints`, { text: 'y', consent: true })).status, 403);
  // Wer sieht was?
  const p = (await psych.get(`/api/athletes/${A1}/psych`)).data;
  assert.equal(p.level, 'full'); assert.equal(p.notes.length, 1); assert.equal(p.released.length, 1);
  for (const [name, c, lvl] of [['trainer', trainerLA, 'released'], ['koord', koord, 'released'], ['arzt', arzt, 'released']]) {
    const g = await c.get(`/api/athletes/${A1}/psych`);
    assert.equal(g.data.level, lvl, name);
    assert.equal(g.data.notes, undefined, name + ' sieht keine Gesprächsnotizen');
    assert.equal(g.data.released[0].text, 'Keine Abendtermine');
    assert.ok(!JSON.stringify(g.data).includes('Heimweh'), name);
  }
  for (const c of [physio, dc, sportwiss]) assert.equal((await c.get(`/api/athletes/${A1}/psych`)).status, 403);
  const own = (await lena.get(`/api/athletes/${A1}/psych`)).data;
  assert.equal(own.level, 'own'); assert.equal(own.notes, undefined); assert.equal(own.released.length, 1);
  // core: freigegebene Hinweise für Trainer, nichts Vertrauliches
  const core = (await trainerLA.get('/api/core')).data;
  assert.equal(core.released[A1][0].text, 'Keine Abendtermine');
  assert.ok(!JSON.stringify(core).includes('Heimweh'));
  // Zurückziehen
  const hid = p.released[0].id;
  assert.equal((await trainerLA.del(`/api/psych/hints/${hid}`)).status, 403);
  assert.equal((await psych.del(`/api/psych/hints/${hid}`)).status, 200);
  assert.equal((await trainerLA.get(`/api/athletes/${A1}/psych`)).data.released.length, 0);
  // Protokoll
  const log = (await admin.get('/api/audit?area=Psychologie')).data.rows;
  assert.ok(log.some((r) => r.result === 'nur freigegebene Hinweise') && log.some((r) => r.result === 'vollständig'));
});

test('Gesprächsanfrage: nur die Athlet:in selbst, landet vertraulich bei der Psychologie', async () => {
  assert.equal((await trainerLA.post(`/api/athletes/${A1}/contact-request`, {})).status, 403);
  assert.equal((await lena.post(`/api/athletes/${A1}/contact-request`, {})).status, 200);
  assert.equal((await lena.post(`/api/athletes/${A1}/contact-request`, {})).status, 200); // keine Doppelung
  const ov = (await psych.get('/api/psych/overview')).data;
  assert.equal(ov.requests.filter((r) => r.status === 'offen').length, 1);
  assert.equal((await trainerLA.get('/api/psych/overview')).status, 403);
  assert.equal((await koord.get('/api/psych/overview')).status, 403);
  assert.ok((await psych.get('/api/alerts')).data.alerts.some((a) => a.confidential));
  assert.equal((await lena.get(`/api/athletes/${A1}/psych`)).data.openRequest, true);
  assert.equal((await psych.post(`/api/psych/requests/${ov.requests[0].id}/close`)).status, 200);
  assert.equal((await psych.get('/api/psych/overview')).data.requests.filter((r) => r.status === 'offen').length, 0);
});

test('Schule: Planungsdaten vs. voller Schulstatus, Prüfungen, Konflikte mit Wettkämpfen', async () => {
  const ev = await koord.post('/api/events', { date: addDays(today, 10), title: 'Hallenmeeting Linz', type: 'Wettkampf', sport: 'Leichtathletik' });
  assert.equal(ev.status, 200);
  assert.equal((await trainerLA.post(`/api/athletes/${A1}/exams`, { date: addDays(today, 9), subject: 'Mathematik' })).status, 403);
  assert.equal((await dc.post(`/api/athletes/${A1}/exams`, { date: '', subject: 'Mathematik' })).status, 400);
  assert.equal((await dc.post(`/api/athletes/${A1}/exams`, { date: addDays(today, 9), subject: 'Mathematik-Schularbeit' })).status, 200);
  assert.equal((await dc.post(`/api/athletes/${A1}/exams`, { date: addDays(today, 25), subject: 'Englisch' })).status, 200);
  assert.equal((await dc.put(`/api/athletes/${A1}/school`, { absences: 7, trend: 'fallend' })).status, 200);
  assert.equal((await dc.put(`/api/athletes/${A1}/school`, { absences: -1, trend: 'fallend' })).status, 400);
  assert.equal((await dc.put(`/api/athletes/${A1}/school`, { absences: 3, trend: 'wild' })).status, 400);
  const full = (await dc.get(`/api/athletes/${A1}/school`)).data;
  assert.equal(full.level, 'full'); assert.equal(full.status.absences, 7); assert.equal(full.status.trend, 'fallend');
  assert.equal(full.conflicts.length, 1);
  assert.equal(full.conflicts[0].exam.subject, 'Mathematik-Schularbeit');
  const plan = (await trainerLA.get(`/api/athletes/${A1}/school`)).data;
  assert.equal(plan.level, 'planning'); assert.equal(plan.status, undefined); assert.equal(plan.exams.length, 2);
  assert.equal((await trainerLA.put(`/api/athletes/${A1}/school`, { absences: 0, trend: 'stabil' })).status, 403);
  const own = (await lena.get(`/api/athletes/${A1}/school`)).data;
  assert.equal(own.level, 'own'); assert.equal(own.canWrite, false); assert.equal(own.status.absences, 7);
  for (const c of [physio, arzt]) assert.equal((await c.get(`/api/athletes/${A1}/school`)).status, 403);
  assert.equal((await trainerSW.get(`/api/athletes/${A1}/school`)).status, 404);
  // Dual-Career-Übersicht
  const ov = (await dc.get('/api/school/overview')).data;
  assert.equal(ov.athletes.length, 2);
  assert.equal(ov.athletes.find((a) => a.id === A1).conflicts.length, 1);
  assert.equal((await trainerLA.get('/api/school/overview')).status, 403);
  // core: Prüfungen für Planung (Trainer), Athlet:in sieht eigene
  const c = (await trainerLA.get('/api/core')).data;
  assert.equal(c.exams.length, 2);
  assert.deepEqual((await physio.get('/api/core')).data.exams, []);
  // Prüfung löschen
  const exId = full.exams[0].id;
  assert.equal((await trainerLA.del(`/api/exams/${exId}`)).status, 403);
  assert.equal((await dc.del(`/api/exams/${exId}`)).status, 200);
});

test('Austritt/Löschung: Medizin-, Psychologie- und Schuldaten werden mitgelöscht', async () => {
  const id = (await koord.post('/api/athletes', ath({ name: 'Wegwerf', born: '2009-05-05' }))).data.id;
  await arzt.post(`/api/athletes/${id}/injuries`, INJ({ color: 'rot', restricted: 'alles', next: addDays(today, 2) }));
  await psych.post(`/api/athletes/${id}/psych/notes`, { text: 'geheim' });
  await dc.put(`/api/athletes/${id}/school`, { absences: 1, trend: 'stabil' });
  await koord.req('DELETE', `/api/athletes/${id}`, { confirm: id });
  for (const tb of ['injuries', 'load_status', 'status_history', 'psych_notes', 'released_hints', 'school', 'exams', 'cycle_notes']) {
    assert.equal(t.db.get(`SELECT COUNT(*) AS n FROM ${tb} WHERE athlete_id = ?`, id).n, 0, tb);
  }
});

test('Migration 4 auf bestehender Phase-3-Datenbank', async () => {
  const t4 = await startTestApp();
  try {
    downgrade(t4.db, 3);
    t4.db.migrate();
    assert.ok(t4.db.version >= 4);
    assert.equal(t4.db.get('SELECT COUNT(*) AS n FROM injuries').n, 0);
  } finally { await t4.stop(); }
});
