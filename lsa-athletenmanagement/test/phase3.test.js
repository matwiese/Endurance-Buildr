import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, setupAdmin, makeUser, downgrade } from './helpers.js';
import { addDays, todayStr } from '../server/util.js';

let t, admin, koord, trainerLA, trainerSW, arzt, psych, sportwiss, dc, lena, jonas, emma;
let A1, A2, A3;
const today = todayStr();
const ath = (o = {}) => ({ name: 'Lena Berger', born: '2009-03-12', sex: 'w', sport: 'Leichtathletik', discipline: 'Sprint', ...o });
const CHECK = (o = {}) => ({ sleepQ: 4, recovery: 4, soreness: 4, fatigue: 4, stress: 4, ready: 4, sleepH: 8, pain: false, symptoms: false, comment: '', ...o });

async function athleteLogin(adm, id, username) {
  const r = await adm.post(`/api/athletes/${id}/login`, { username });
  const c = t.client();
  await c.post('/api/login', { username, password: r.data.temporaryPassword });
  await c.post('/api/password', { current: r.data.temporaryPassword, next: 'Athlet-Passwort-123' });
  return c;
}

before(async () => {
  t = await startTestApp();
  admin = await setupAdmin(t);
  koord = (await makeUser(t, admin, { username: 'koord', displayName: 'Sabine Kern', role: 'koordinator', scope: { all: true } })).client;
  trainerLA = (await makeUser(t, admin, { username: 'trainer.la', displayName: 'Markus Huber', role: 'trainer', scope: { sports: ['Leichtathletik'] } })).client;
  trainerSW = (await makeUser(t, admin, { username: 'trainer.sw', displayName: 'Petra Wagner', role: 'trainer', scope: { sports: ['Schwimmen'] } })).client;
  arzt = (await makeUser(t, admin, { username: 'arzt', displayName: 'Dr. Eva Lang', role: 'arzt', scope: { all: true } })).client;
  psych = (await makeUser(t, admin, { username: 'psych', displayName: 'Ruth Aigner', role: 'psych', scope: { all: true } })).client;
  sportwiss = (await makeUser(t, admin, { username: 'sportwiss', displayName: 'Thomas Brandl', role: 'sportwiss', scope: { all: true } })).client;
  dc = (await makeUser(t, admin, { username: 'dual.career', displayName: 'Julia Pichler', role: 'dualcareer', scope: { all: true } })).client;
  A1 = (await koord.post('/api/athletes', ath())).data.id;
  A2 = (await koord.post('/api/athletes', ath({ name: 'Jonas Mayr', sex: 'm', born: '2008-07-02' }))).data.id;
  A3 = (await koord.post('/api/athletes', ath({ name: 'Emma Hofer', sport: 'Schwimmen', discipline: 'Freistil', born: '2009-01-30' }))).data.id;
  lena = await athleteLogin(koord, A1, 'lena.berger');
  jonas = await athleteLogin(koord, A2, 'jonas.mayr');
  emma = await athleteLogin(koord, A3, 'emma.hofer');
});
after(async () => { await t.stop(); });

test('Tages-Check: nur Athlet:in selbst, Validierung, Überschreiben am selben Tag', async () => {
  assert.equal((await trainerLA.post('/api/checkin', CHECK())).status, 403);
  assert.equal((await lena.post('/api/checkin', CHECK({ sleepQ: 6 }))).status, 400);
  assert.equal((await lena.post('/api/checkin', CHECK({ stress: 'x' }))).status, 400);
  assert.equal((await lena.post('/api/checkin', CHECK({ sleepH: 30 }))).status, 400);
  const ok = await lena.post('/api/checkin', CHECK());
  assert.equal(ok.status, 200);
  assert.equal(ok.data.alertsCreated, 0);
  await lena.post('/api/checkin', CHECK({ sleepQ: 2, comment: 'schlecht geschlafen' }));
  const g = (await lena.get('/api/checkin')).data;
  assert.equal(g.entry.sleepQ, 2);
  assert.equal(t.db.get('SELECT COUNT(*) AS n FROM readiness WHERE athlete_id = ?', A1).n, 1);
});

test('Hinweis-Engine: Schmerz erzeugt Prüfauftrag, keine Diagnose; Sichtbarkeit je Rolle', async () => {
  const r = await jonas.post('/api/checkin', CHECK({ pain: true, comment: 'Ellbogen zieht' }));
  assert.equal(r.data.alertsCreated, 1);
  // Doppelte Prüfung erzeugt keinen zweiten offenen Hinweis
  assert.equal((await jonas.post('/api/checkin', CHECK({ pain: true }))).data.alertsCreated, 0);
  const seen = async (c) => (await c.get('/api/alerts')).data.alerts.filter((a) => a.status !== 'erledigt').map((a) => a.trigger);
  assert.deepEqual(await seen(trainerLA), ['Akuter Schmerz gemeldet']);
  assert.deepEqual(await seen(koord), ['Akuter Schmerz gemeldet']);
  assert.deepEqual(await seen(arzt), ['Akuter Schmerz gemeldet']);
  assert.deepEqual(await seen(sportwiss), []);      // nur Performance
  assert.deepEqual(await seen(psych), []);          // nur Wohlbefinden
  assert.deepEqual(await seen(trainerSW), []);      // andere Sportart
  assert.equal((await jonas.get('/api/alerts')).status, 403); // Athlet:in sieht keine Hinweise
  assert.equal((await dc.get('/api/alerts')).data.alerts.length, 0);
  const al = (await koord.get('/api/alerts')).data.alerts[0];
  assert.equal(al.resp, 'Sabine Kern'); // Koordination aus dem Team (Ersteller)
  // Trainer darf nicht bearbeiten, Koordination darf
  assert.equal((await trainerLA.put(`/api/alerts/${al.id}`, { stage: 2 })).status, 403);
  assert.equal((await koord.put(`/api/alerts/${al.id}`, { stage: 2, resp: 'Sabine Kern', control: addDays(today, 3), note: 'Gespräch vereinbart' })).data.status, 'in Prüfung');
  assert.equal((await koord.put(`/api/alerts/${al.id}`, { stage: 5, resp: 'Dr. Eva Lang', control: today, note: 'Notfallkette' })).data.status, 'Akutprozess');
  // Akutprozess sieht der Trainer nicht mehr im Dashboard
  assert.deepEqual(await seen(trainerLA), []);
  assert.deepEqual(await seen(arzt), ['Akuter Schmerz gemeldet']);
  // Abschluss braucht Notiz
  assert.equal((await koord.put(`/api/alerts/${al.id}`, { stage: 2, resp: 'x', control: today, note: '', close: true })).status, 400);
  assert.equal((await koord.put(`/api/alerts/${al.id}`, { stage: 2, resp: 'x', control: today, note: 'Abgeklärt', close: true })).data.status, 'erledigt');
  assert.deepEqual(await seen(koord), []);
});

test('vertrauliche Gesprächsanfrage: Hinweis nur für Sportpsychologie', async () => {
  const r = await emma.post('/api/checkin', CHECK({ contact: true }));
  assert.equal(r.data.alertsCreated, 1);
  const p = (await psych.get('/api/alerts')).data.alerts;
  assert.equal(p.length, 1);
  assert.equal(p[0].confidential, true);
  assert.equal((await koord.get('/api/alerts')).data.alerts.filter((a) => a.status !== 'erledigt').length, 0);
  assert.equal((await trainerSW.get('/api/alerts')).data.alerts.length, 0);
  assert.equal((await arzt.get('/api/alerts')).data.alerts.filter((a) => a.status !== 'erledigt').length, 0);
});

test('Trainingserfassung: Planen, Erfassen, nur eigene Gruppe, Pflichtgrund als Warnung', async () => {
  assert.equal((await lena.get('/api/training')).status, 403);
  assert.equal((await dc.get('/api/training')).status, 403);
  const d = today;
  const plan = await trainerLA.post('/api/training/plan', { date: d, title: 'Bahntraining', plannedMin: 90, athleteIds: [A1, A2] });
  assert.deepEqual([plan.data.created, plan.data.skipped], [2, 0]);
  assert.equal((await trainerLA.post('/api/training/plan', { date: d, title: 'Bahntraining', plannedMin: 90, athleteIds: [A1] })).data.skipped, 1);
  assert.equal((await trainerLA.post('/api/training/plan', { date: d, title: 'X', athleteIds: [A3] })).status, 403); // fremde Sportart
  assert.equal((await trainerLA.post('/api/training/plan', { date: 'kein-datum', athleteIds: [A1] })).status, 400);
  const day = (await trainerLA.get(`/api/training?date=${d}`)).data;
  assert.deepEqual(day.athletes.map((a) => a.id).sort(), [A1, A2]);
  const rows = day.athletes.flatMap((a) => a.sessions);
  assert.equal(rows.length, 2);
  const s1 = rows.find((r) => r.aid === A1), s2 = rows.find((r) => r.aid === A2);
  const bad = await trainerLA.post('/api/training/day', { date: d, rows: [{ id: s1.id, status: 'vollständig', duration: 400, rpe: 5 }] });
  assert.equal(bad.status, 400);
  assert.equal((await trainerLA.post('/api/training/day', { date: d, rows: [{ id: s1.id, status: 'vollständig', duration: 90, rpe: 11 }] })).status, 400);
  assert.equal((await trainerSW.post('/api/training/day', { date: d, rows: [{ id: s1.id, status: 'vollständig', duration: 90, rpe: 5 }] })).status, 403);
  const r = await trainerLA.post('/api/training/day', { date: d, rows: [{ id: s1.id, status: 'vollständig', duration: 90, rpe: 6 }, { id: s2.id, status: 'nicht teilgenommen', duration: '', rpe: '', reason: '' }] });
  assert.equal(r.status, 200);
  assert.equal(r.data.missingReason, 1);
  const again = (await trainerLA.get(`/api/training?date=${d}`)).data.athletes.flatMap((a) => a.sessions);
  const saved2 = again.find((x) => x.id === s2.id);
  assert.equal(saved2.status, 'nicht teilgenommen');
  assert.equal(saved2.duration, null); // leer bleibt leer, nicht 0
  assert.equal(saved2.decidedBy, 'Markus Huber');
  // erfasste Einheit lässt sich nicht mehr löschen, geplante schon
  assert.equal((await trainerLA.del(`/api/training/${s1.id}`)).status, 400);
  const extra = await trainerLA.post('/api/training/plan', { date: addDays(d, 1), title: 'Kraft', athleteIds: [A1] });
  const nextDay = (await trainerLA.get(`/api/training?date=${addDays(d, 1)}`)).data.athletes.flatMap((a) => a.sessions);
  assert.equal((await trainerLA.del(`/api/training/${nextDay[0].id}`)).status, 200);
});

test('Session-RPE durch die Athlet:in selbst, nur für eigene Einheiten', async () => {
  const p = (await lena.get('/api/checkin')).data;
  assert.equal(p.pendingRpe.length, 0);
  // geplante Einheit heute ohne RPE
  const id = (await trainerLA.post('/api/training/plan', { date: today, title: 'Technik', athleteIds: [A1] })).data.created;
  const pend = (await lena.get('/api/checkin')).data.pendingRpe;
  assert.equal(pend.length, 1);
  assert.equal((await lena.put(`/api/training/${pend[0].id}/rpe`, { rpe: 14 })).status, 400);
  assert.equal((await lena.put(`/api/training/${pend[0].id}/rpe`, { rpe: 7 })).status, 200);
  assert.equal((await jonas.put(`/api/training/${pend[0].id}/rpe`, { rpe: 5 })).status, 404);
  assert.equal((await lena.get('/api/checkin')).data.pendingRpe.length, 0);
});

test('Lastsprung > 30 % gegenüber der Vorwoche erzeugt Hinweis für Sportwissenschaft', async () => {
  // Vorwoche: Belastung 400, diese Woche: 700
  const mk = async (date, dur, rpe) => {
    const r = await trainerLA.post('/api/training/plan', { date, title: 'Last ' + date, athleteIds: [A2] });
    const s = (await trainerLA.get(`/api/training?date=${date}`)).data.athletes.find((a) => a.id === A2).sessions.find((x) => x.title === 'Last ' + date);
    return trainerLA.post('/api/training/day', { date, rows: [{ id: s.id, status: 'vollständig', duration: dur, rpe }] });
  };
  await mk(addDays(today, -9), 80, 5); // 400 in Vorwoche
  const r = await mk(addDays(today, -2), 100, 7); // 700 diese Woche (+ heutige Einheit von Jonas ohne RPE zählt nicht)
  assert.ok(r.data.alertsCreated >= 1);
  const sw = (await sportwiss.get('/api/alerts')).data.alerts.find((a) => a.athleteId === A2 && a.trigger.startsWith('Starke Veränderung'));
  assert.ok(sw, 'Hinweis für Sportwissenschaft');
  assert.match(sw.trigger, /\+\d+ %/);
  assert.ok((await trainerLA.get('/api/alerts')).data.alerts.some((a) => a.id === sw.id));
});

test('core: gefilterter Schnappschuss je Rolle (Medizin-/Psychologie-Rollen sehen nur ihre Stufe)', async () => {
  const c = (await trainerLA.get('/api/core')).data;
  assert.deepEqual(c.athletes.map((a) => a.id).sort(), [A1, A2]);
  assert.ok(c.readiness[A1][today]);
  assert.equal(c.readiness[A1][today].pain, false);
  assert.ok(c.sessions.length > 0);
  assert.ok(!(A3 in c.readiness));
  // Sportpsychologie: Monitoring nur Wohlbefinden -> keine Schmerz-/Symptom-/Kommentarfelder, keine Einheiten
  const p = (await psych.get('/api/core')).data;
  const e = p.readiness[A2][today];
  assert.deepEqual(Object.keys(e).sort(), ['fatigue', 'sleepH', 'sleepQ', 'stress']);
  assert.equal(p.sessions.length, 0);
  // Dual Career: kein Monitoring
  const d = (await dc.get('/api/core')).data;
  assert.deepEqual(d.readiness, {});
  assert.equal(d.sessions.length, 0);
  // Athlet:in: nur eigene Daten
  const l = (await lena.get('/api/core')).data;
  assert.deepEqual(l.athletes.map((a) => a.id), [A1]);
  assert.deepEqual(Object.keys(l.readiness), [A1]);
  assert.deepEqual(l.alerts, []);
  // Einzelakte
  assert.deepEqual(Object.keys((await koord.get(`/api/core?athlete=${A2}`)).data.readiness), [A2]);
});

test('Messwerte: Datenwörterbuch, Plausibilität, Sprung, Duplikat → markiert statt gelöscht', async () => {
  const post = (c, b) => c.post(`/api/athletes/${A1}/measurements`, b);
  assert.equal((await post(dc, { variable: 'Körpermasse', value: 55 })).status, 403);
  assert.equal((await post(arzt, { variable: 'Körpermasse', value: 55 })).status, 403); // Monitoring nur lesen
  assert.equal((await post(trainerLA, { variable: '', value: 5 })).status, 400);
  assert.equal((await post(trainerLA, { variable: 'Körpermasse', value: 'abc' })).status, 400);
  assert.equal((await post(trainerLA, { variable: 'Eigene Größe', value: 5 })).status, 400); // Einheit fehlt
  const ok = await post(trainerLA, { variable: '10-m-Zeit', value: '1,91', date: addDays(today, -20) });
  assert.deepEqual(ok.data.flags, []);
  const jump = await post(trainerLA, { variable: '10-m-Zeit', value: '1,62', date: addDays(today, -5) });
  assert.equal(jump.data.flags.length, 1);
  assert.match(jump.data.flags[0], /Sprung/);
  const crazy = await post(trainerLA, { variable: 'Körpermasse', value: 520 });
  assert.match(crazy.data.flags[0], /Unmöglicher Wert/);
  const dup = await post(trainerLA, { variable: 'Körpermasse', value: 52 });
  assert.ok(dup.data.flags.some((f) => f.includes('Duplikat')));
  const fut = await post(trainerLA, { variable: 'Ruhepuls', value: 50, date: addDays(today, 3) });
  assert.ok(fut.data.flags.some((f) => f.includes('Zukunft')));
  const list = (await arzt.get(`/api/athletes/${A1}/measurements`)).data;
  assert.equal(list.canWrite, false);
  assert.equal(list.measurements.length, 5);
  assert.equal(list.measurements.find((m) => m.value === 520).status, 'markiert');
  assert.equal(t.db.get("SELECT COUNT(*) AS n FROM quality_flags WHERE status = 'markiert'").n, 4);
  assert.equal((await psych.get(`/api/athletes/${A1}/measurements`)).status, 403);
  assert.equal((await trainerSW.get(`/api/athletes/${A1}/measurements`)).status, 404);
  assert.equal((await trainerLA.del(`/api/measurements/${crazy.data.id}`)).status, 200);
  assert.equal(t.db.get("SELECT COUNT(*) AS n FROM quality_flags WHERE ref_id = ?", crazy.data.id).n, 0);
});

test('Entwicklungsplan: Pflichtfelder bei Maßnahmen, max. 3 Ziele je Bereich, Wirkungskontrolle → Entscheidungsprotokoll', async () => {
  assert.equal((await dc.put(`/api/athletes/${A1}/plan`, { baseline: 'x' })).status, 403);
  assert.equal((await arzt.get(`/api/athletes/${A1}/plan`)).status, 200); // lesen
  assert.equal((await arzt.put(`/api/athletes/${A1}/plan`, { baseline: 'x' })).status, 403);
  assert.equal((await trainerLA.put(`/api/athletes/${A1}/plan`, { baseline: '100 m 12,05 s', longTerm: 'U20-EM 2028' })).status, 200);
  const g = await trainerLA.post(`/api/athletes/${A1}/goals`, { area: 'körperlich', text: 'Beschleunigung verbessern' });
  assert.equal(g.status, 200);
  for (const n of [2, 3]) assert.equal((await trainerLA.post(`/api/athletes/${A1}/goals`, { area: 'körperlich', text: 'Ziel ' + n })).status, 200);
  const four = await trainerLA.post(`/api/athletes/${A1}/goals`, { area: 'körperlich', text: 'Ziel 4' });
  assert.equal(four.status, 400);
  assert.match(four.data.error, /drei Ziele/);
  const m0 = { goalId: g.data.id, text: 'Zwei Beschleunigungseinheiten pro Woche', resp: 'Markus Huber', review: addDays(today, 7), criterion: '10-m-Zeit verbessert' };
  assert.equal((await trainerLA.post(`/api/athletes/${A1}/measures`, { ...m0, resp: '' })).status, 400);
  assert.equal((await trainerLA.post(`/api/athletes/${A1}/measures`, { ...m0, review: '' })).status, 400);
  assert.equal((await trainerLA.post(`/api/athletes/${A1}/measures`, { ...m0, criterion: '' })).status, 400);
  assert.equal((await trainerLA.post(`/api/athletes/${A1}/measures`, { ...m0, goalId: 9999 })).status, 400);
  const m = await trainerLA.post(`/api/athletes/${A1}/measures`, m0);
  assert.equal(m.status, 200);
  const plan = (await trainerLA.get(`/api/athletes/${A1}/plan`)).data;
  assert.equal(plan.goals.length, 3);
  assert.equal(plan.measures[0].status, 'offen');
  // Wirkungskontrolle
  assert.equal((await trainerLA.post(`/api/measures/${m.data.id}/review`, { result: '', next: 'fortführen' })).status, 400);
  assert.equal((await trainerLA.post(`/api/measures/${m.data.id}/review`, { result: 'x', next: 'unklar' })).status, 400);
  const rv = await trainerLA.post(`/api/measures/${m.data.id}/review`, { result: '10-m-Zeit −0,05 s', next: 'anpassen' });
  assert.equal(rv.status, 200);
  const after = (await trainerLA.get(`/api/athletes/${A1}/plan`)).data.measures[0];
  assert.equal(after.status, 'laufend');
  assert.equal(after.review, addDays(today, 28));
  const dec = (await trainerLA.get(`/api/athletes/${A1}/decisions`)).data;
  assert.equal(dec.decisions.length, 1);
  assert.equal(dec.decisions[0].decision, 'Maßnahme anpassen');
  // Athletin sieht den Plan, kann aber nichts ändern
  assert.equal((await lena.get(`/api/athletes/${A1}/plan`)).status, 200);
  assert.equal((await lena.post(`/api/athletes/${A1}/goals`, { area: 'mental', text: 'x' })).status, 403);
  // Ziel löschen entfernt Maßnahmen
  assert.equal((await trainerLA.del(`/api/goals/${g.data.id}`)).status, 200);
  assert.equal((await trainerLA.get(`/api/athletes/${A1}/plan`)).data.measures.length, 0);
  // Fremder Trainer
  assert.equal((await trainerSW.get(`/api/athletes/${A1}/plan`)).status, 404);
});

test('Entscheidungsprotokoll: Pflichtfelder, Ergebnis nachtragen, Rechte', async () => {
  const body = { reason: 'Rückgang Wohlbefinden', info: 'Readiness-Verlauf', decision: 'Keine Abendtermine', resp: 'Sabine Kern', affected: 'Athletin, Trainer', measure: 'M1', review: addDays(today, 22) };
  assert.equal((await koord.post(`/api/athletes/${A1}/decisions`, { ...body, resp: '' })).status, 400);
  assert.equal((await koord.post(`/api/athletes/${A1}/decisions`, { ...body, review: '' })).status, 400);
  assert.equal((await psych.post(`/api/athletes/${A1}/decisions`, body)).status, 403); // psych: nur lesen
  assert.equal((await psych.get(`/api/athletes/${A1}/decisions`)).status, 200);
  assert.equal((await dc.get(`/api/athletes/${A1}/decisions`)).status, 200);
  const r = await koord.post(`/api/athletes/${A1}/decisions`, body);
  assert.equal(r.status, 200);
  assert.equal((await koord.put(`/api/decisions/${r.data.id}`, { result: 'wirkt' })).status, 200);
  assert.equal((await psych.put(`/api/decisions/${r.data.id}`, { result: 'x' })).status, 403);
  const list = (await lena.get(`/api/athletes/${A1}/decisions`)).data;
  assert.equal(list.canWrite, false);
  assert.ok(list.decisions.some((d) => d.result === 'wirkt'));
});

test('Termine: Sportart-Beschränkung, Pflege nur mit Recht', async () => {
  const ev = (o = {}) => ({ date: addDays(today, 5), title: 'Hallenmeeting Linz', type: 'Wettkampf', sport: 'Leichtathletik', ...o });
  assert.equal((await lena.post('/api/events', ev())).status, 403);
  assert.equal((await arzt.post('/api/events', ev())).status, 403);
  assert.equal((await trainerLA.post('/api/events', ev({ sport: 'Schwimmen' }))).status, 403);
  assert.equal((await trainerLA.post('/api/events', ev({ sport: '' }))).status, 403); // alle Sportarten nur mit Vollzugriff
  assert.equal((await trainerLA.post('/api/events', ev({ type: 'Party' }))).status, 400);
  const a = await trainerLA.post('/api/events', ev());
  assert.equal(a.status, 200);
  const b = await koord.post('/api/events', ev({ title: 'Vereinsfest', sport: '', type: 'Sonstiges' }));
  const c = await trainerSW.post('/api/events', ev({ title: 'ÖJM Kurzbahn', sport: 'Schwimmen', type: 'Wettkampf' }));
  const titles = async (cl) => (await cl.get('/api/events')).data.events.map((e) => e.title).sort();
  assert.deepEqual(await titles(trainerLA), ['Hallenmeeting Linz', 'Vereinsfest']);
  assert.deepEqual(await titles(trainerSW), ['Vereinsfest', 'ÖJM Kurzbahn']);
  assert.deepEqual(await titles(lena), ['Hallenmeeting Linz', 'Vereinsfest']);
  assert.equal((await titles(koord)).length, 3);
  assert.equal((await trainerLA.del(`/api/events/${c.data.id}`)).status, 403); // fremde Sportart
  assert.equal((await trainerSW.put(`/api/events/${a.data.id}`, { title: 'gehackt' })).status, 403);
  assert.equal((await trainerLA.put(`/api/events/${a.data.id}`, { title: 'Hallenmeeting Wien' })).status, 200);
  assert.equal((await trainerLA.del(`/api/events/${a.data.id}`)).status, 200);
});

test('Akte löschen entfernt auch Performance-Daten (Kaskade)', async () => {
  const id = (await koord.post('/api/athletes', ath({ name: 'Wegwerf', born: '2009-05-05' }))).data.id;
  const cl = await athleteLogin(koord, id, 'wegwerf.test');
  await cl.post('/api/checkin', CHECK({ pain: true }));
  await koord.post(`/api/athletes/${id}/goals`, { area: 'mental', text: 'x' });
  await koord.post(`/api/athletes/${id}/measurements`, { variable: 'Körpermasse', value: 520 });
  await koord.req('DELETE', `/api/athletes/${id}`, { confirm: id });
  for (const tb of ['readiness', 'goals', 'measurements', 'alerts', 'quality_flags', 'training', 'consents']) {
    assert.equal(t.db.get(`SELECT COUNT(*) AS n FROM ${tb} WHERE athlete_id = ?`, id).n, 0, tb);
  }
});

test('Migration 3 auf bestehender Phase-2-Datenbank', async () => {
  const t3 = await startTestApp();
  try {
    downgrade(t3.db, 2);
    t3.db.migrate();
    assert.ok(t3.db.version >= 3);
    assert.equal(t3.db.get('SELECT COUNT(*) AS n FROM alerts').n, 0);
  } finally { await t3.stop(); }
});
