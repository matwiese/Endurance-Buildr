import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, setupAdmin, makeUser, downgrade } from './helpers.js';
import { addDays, todayStr } from '../server/util.js';

let t, admin;
const today = todayStr();
const PW = 'Demo-Passwort-2026';
const asJson = (r) => (Buffer.isBuffer(r.data) ? JSON.parse(r.data.toString('utf8')) : r.data);
const loginAs = async (username, password = PW) => { const c = t.client(); const r = await c.post('/api/login', { username, password }); assert.equal(r.status, 200, `${username}: ${JSON.stringify(r.data)}`); return c; };

before(async () => { t = await startTestApp(); admin = await setupAdmin(t); });
after(async () => { await t.stop(); });

test('Demodaten: laden nur mit gültigem Passwort und nur einmal; legt Personen, Akten und Hinweise an', async () => {
  assert.equal((await admin.post('/api/system/demo', { password: 'kurz' })).status, 400);
  const r = await admin.post('/api/system/demo', { password: PW });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.athletes, 10);
  assert.equal((await admin.post('/api/system/demo', { password: PW })).status, 400);
  const info = (await admin.get('/api/system/demo')).data;
  assert.equal(info.loaded, true);
  assert.ok(info.users.some((u) => u.username === 'demo.markus.huber'));
  assert.ok(t.db.get('SELECT COUNT(*) AS n FROM alerts').n >= 4, 'Regeln erzeugen Hinweise');
  assert.equal(t.db.get('SELECT COUNT(*) AS n FROM readiness').n > 100, true);
  // Rolle: Nicht-Admins dürfen keine Demodaten laden
  const trainer = await loginAs('demo.markus.huber');
  assert.equal((await trainer.post('/api/system/demo', { password: PW })).status, 403);
});

test('Demo: Rechte greifen auch mit den Demodaten (Trainer Leichtathletik vs. Schwimmen, Medizin, Psychologie)', async () => {
  const la = await loginAs('demo.markus.huber'), sw = await loginAs('demo.petra.wagner');
  const nLA = (await la.get('/api/athletes')).data.athletes.map((a) => a.name);
  const nSW = (await sw.get('/api/athletes')).data.athletes.map((a) => a.name);
  assert.equal(nLA.length, 6); assert.equal(nSW.length, 4);
  assert.ok(nLA.includes('Jonas Mayr') && !nLA.includes('Emma Hofer'));
  // Trainer LA sieht Ampel von Jonas (Orange), aber keine Diagnose und keine Gesprächsnotiz
  const core = (await la.get('/api/core')).data;
  const jonas = core.athletes.find((a) => a.name === 'Jonas Mayr');
  assert.equal(core.status[jonas.id].color, 'orange');
  const blob = JSON.stringify(core);
  assert.ok(!blob.includes('Muskelfaserriss') && !blob.includes('Heimweh'));
  const sophie = core.athletes.find((a) => a.name === 'Sophie Gruber');
  assert.ok(core.released[sophie.id][0].text.includes('Abendtermine'));
  // Sportpsychologie sieht die vertrauliche Anfrage und die Notiz, Koordination nicht
  const psych = await loginAs('demo.ruth.aigner');
  assert.equal((await psych.get(`/api/athletes/${sophie.id}/psych`)).data.notes.length, 1);
  assert.equal((await psych.get('/api/psych/overview')).data.requests.filter((r) => r.status === 'offen').length, 1);
  const koord = await loginAs('demo.sabine.kern');
  assert.equal((await koord.get('/api/psych/overview')).status, 403);
  // Arzt vollständig
  const arzt = await loginAs('demo.eva.lang');
  assert.ok((await arzt.get(`/api/athletes/${jonas.id}/health`)).data.injuries[0].diagnosis.includes('Muskelfaserriss'));
  // Athletin Lena: nur eigene Akte
  const lena = await loginAs('demo.lena.berger');
  const own = (await lena.get('/api/athletes')).data.athletes;
  assert.equal(own.length, 1); assert.equal(own[0].name, 'Lena Berger');
  assert.equal((await lena.get(`/api/athletes/${jonas.id}`)).status, 404);
});

test('Datenqualität: Markierungen klären (bestätigen/korrigieren) nur mit Recht; Rohwert bleibt erhalten', async () => {
  const data = await loginAs('demo.andrej.novak');
  const q = (await data.get('/api/quality')).data;
  assert.equal(q.kpi.openFlags, 5);
  assert.ok(q.canResolve);
  assert.ok(q.perAthlete.length === 10);
  const kg = q.flags.find((f) => f.variable === 'Körpermasse');
  const sw = await loginAs('demo.thomas.brandl');
  assert.equal((await sw.get('/api/quality')).status, 200);
  assert.equal((await sw.post(`/api/quality/flags/${kg.id}`, { status: 'bestätigt' })).status, 403);
  assert.equal((await data.post(`/api/quality/flags/${kg.id}`, { status: 'korrigiert', value: 'abc' })).status, 400);
  assert.equal((await data.post(`/api/quality/flags/${kg.id}`, { status: 'unklar' })).status, 400);
  assert.equal((await data.post(`/api/quality/flags/${kg.id}`, { status: 'korrigiert', value: '52', note: 'Tippfehler' })).status, 200);
  const m = t.db.get("SELECT value, raw_value, status FROM measurements WHERE variable = 'Körpermasse' AND raw_value = 520");
  assert.equal(m.value, 52); assert.equal(m.raw_value, 520); assert.equal(m.status, 'korrigiert');
  const jump = q.flags.find((f) => f.rule.includes('Sprung'));
  assert.equal((await data.post(`/api/quality/flags/${jump.id}`, { status: 'bestätigt' })).status, 200);
  assert.equal((await data.get('/api/quality')).data.kpi.openFlags, 3);
  // Rollen ohne Recht
  const trainer = await loginAs('demo.markus.huber');
  assert.equal((await trainer.get('/api/quality')).status, 403);
  // Protokoll enthält die Korrektur mit verantwortlicher Person
  const log = (await admin.get('/api/audit?q=korrigiert')).data.rows;
  assert.ok(log.some((r) => r.user_name === 'Andrej Novak'));
});

test('Kennzahlen: nur aggregiert, kleine Gruppen unterdrückt, keine Namen', async () => {
  const gf = await loginAs('demo.geschaeftsfuehrung');
  const k = (await gf.get('/api/kpi')).data;
  assert.equal(k.athletes, 10);
  assert.equal(typeof k.availability, 'number');
  const la = k.bySport.find((s) => s.sport === 'Leichtathletik'), sw = k.bySport.find((s) => s.sport === 'Schwimmen');
  assert.equal(la.suppressed, false); assert.equal(la.n, 6);
  assert.equal(sw.suppressed, true); assert.equal(sw.availability, undefined); // nur 4 Personen
  const blob = JSON.stringify(k);
  for (const name of ['Lena', 'Jonas', 'Berger', 'Mayr']) assert.ok(!blob.includes(name), name);
  // Geschäftsführung hat keinerlei Akten-Zugriff
  assert.deepEqual((await gf.get('/api/athletes')).data.athletes, []);
  const core = (await gf.get('/api/core')).data;
  assert.deepEqual(core.athletes, []);
  assert.equal((await gf.get('/api/quality')).status, 403);
  const trainer = await loginAs('demo.markus.huber');
  assert.equal((await trainer.get('/api/kpi')).status, 403);
});

test('Datenschutz: Umsetzungsstand, Rechteprüfung, Fristen – nur mit Recht; DSB sieht keine Akteninhalte', async () => {
  const dsb = await loginAs('demo.datenschutz');
  const o = (await dsb.get('/api/privacy/overview')).data;
  assert.equal(o.dpia.length, 6);
  assert.equal(o.rights.length, 13);
  assert.equal(o.retention.length, 10);
  assert.equal(o.canManage, true);
  const item = o.dpia.find((d) => !d.done);
  assert.equal((await dsb.put(`/api/privacy/dpia/${item.id}`, { done: true })).status, 200);
  assert.equal((await dsb.post('/api/privacy/rights-review/trainer')).status, 200);
  assert.equal((await dsb.post('/api/privacy/rights-review/pirat')).status, 404);
  assert.equal((await dsb.put('/api/privacy/retention', { periods: { Stammdaten: '10 Jahre nach Austritt' } })).status, 200);
  const o2 = (await dsb.get('/api/privacy/overview')).data;
  assert.equal(o2.retention.find((r) => r.cat === 'Stammdaten').status, 'festgelegt');
  assert.equal(o2.rights.find((r) => r.role === 'trainer').last, today);
  // DSB: Protokoll ja, Akten nein
  assert.equal((await dsb.get('/api/audit')).status, 200);
  assert.deepEqual((await dsb.get('/api/athletes')).data.athletes, []);
  const first = t.db.get('SELECT id FROM athletes LIMIT 1').id;
  assert.equal((await dsb.get(`/api/athletes/${first}`)).status, 404);
  assert.equal((await dsb.get(`/api/athletes/${first}/export`)).status, 403);
  // Trainer: nein
  const trainer = await loginAs('demo.markus.huber');
  assert.equal((await trainer.get('/api/privacy/overview')).status, 403);
  assert.equal((await trainer.put('/api/privacy/retention', { periods: {} })).status, 403);
  // Administration sieht das Protokoll, aber keine Datenschutz-Verwaltung
  assert.equal((await admin.put('/api/privacy/retention', { periods: {} })).status, 403);
});

test('Datenschutzanfragen der Athlet:in und Auskunfts-Export (nur eigene Daten)', async () => {
  const lena = await loginAs('demo.lena.berger');
  const myId = (await lena.get('/api/athletes')).data.athletes[0].id;
  assert.equal((await lena.post(`/api/athletes/${myId}/data-request`, { type: 'Hacken' })).status, 400);
  assert.equal((await lena.post(`/api/athletes/${myId}/data-request`, { type: 'Auskunft', text: 'Bitte alle Daten' })).status, 200);
  const dsb = await loginAs('demo.datenschutz');
  const req = (await dsb.get('/api/privacy/overview')).data.requests;
  assert.equal(req.length, 1); assert.equal(req[0].type, 'Auskunft'); assert.equal(req[0].status, 'offen');
  assert.equal((await dsb.put(`/api/privacy/requests/${req[0].id}`, {})).status, 200);
  assert.equal((await lena.get(`/api/athletes/${myId}/privacy`)).data.log.some((l) => l.action.includes('Betroffenenrecht')), true);
  // Export der Athletin: eigene Daten, ohne Psychologie-Notizen/Medikation
  const ex = await lena.get(`/api/athletes/${myId}/export`);
  assert.equal(ex.status, 200);
  assert.match(ex.headers.get('content-disposition'), /attachment; filename="LSA-\d+-export-/);
  const j = asJson(ex);
  assert.equal(j.athlete.name, 'Lena Berger');
  assert.ok(j.sections.tagesCheck.length > 5);
  assert.ok(j.sections.einwilligungen.length === 5);
  assert.equal(j.sections.psychologischeNotizen, undefined);
  assert.ok(!JSON.stringify(j).includes('Medikation') || !JSON.stringify(j).includes('"meds"'));
  // Fremde Akte
  const other = t.db.get("SELECT id FROM athletes WHERE name = 'Jonas Mayr'").id;
  assert.equal((await lena.get(`/api/athletes/${other}/export`)).status, 404);
  // Koordination: nach eigenen Rechten (keine Diagnose/Gesprächsnotiz)
  const koord = await loginAs('demo.sabine.kern');
  const ek = asJson(await koord.get(`/api/athletes/${other}/export`));
  assert.ok(ek.nichtEnthalten.includes('Schule') === false);
  assert.equal(ek.sections.verletzungenErkrankungen, undefined);
  assert.equal(ek.sections.psychologischeNotizen, undefined);
  assert.equal(ek.sections.belastungsstatus.color, 'orange');
  // Arzt: Export ist standardmäßig nicht freigegeben – per Einzelrecht zuschalten; dann vollständiger medizinischer Teil, aber nichts aus Schule
  const arzt = await loginAs('demo.eva.lang');
  assert.equal((await arzt.get(`/api/athletes/${other}/export`)).status, 403);
  const arztId = (await admin.get('/api/users')).data.users.find((u) => u.username === 'demo.eva.lang').id;
  assert.equal((await admin.put(`/api/users/${arztId}`, { overrides: { features: { 'export.athlete': true } } })).status, 200);
  const ea = asJson(await arzt.get(`/api/athletes/${other}/export`));
  assert.ok(ea.sections.verletzungenErkrankungen[0].diagnosis.includes('Muskelfaserriss'));
  assert.ok(ea.nichtEnthalten.includes('Schule'));
  // Trainer hat keine Exportfunktion
  const trainer = await loginAs('demo.markus.huber');
  assert.equal((await trainer.get(`/api/athletes/${other}/export`)).status, 403);
});

test('Safeguarding: unabhängiger Meldeweg, Fallbereich nur Officer, Schutzfall-Zugriff mit Begründung protokolliert', async () => {
  const lena = await loginAs('demo.lena.berger');
  assert.equal((await lena.post('/api/safeguarding/report', { text: '' })).status, 400);
  assert.equal((await lena.post('/api/safeguarding/report', { text: 'Abwertende Kommentare im Training', anon: true })).status, 200);
  assert.equal((await lena.post('/api/safeguarding/report', { text: 'Mit Namen', anon: false })).status, 200);
  assert.equal((await lena.get('/api/safeguarding/cases')).status, 403); // Athletin sieht keine Fälle
  const sg = await loginAs('demo.safeguarding');
  const c = (await sg.get('/api/safeguarding/cases')).data;
  assert.equal(c.cases.length, 3);
  const anon = c.cases.find((x) => x.text.startsWith('Abwertende'));
  assert.equal(anon.anon, true); assert.equal(anon.from, null);
  assert.ok(c.cases.find((x) => x.text === 'Mit Namen').from);
  assert.equal((await sg.put(`/api/safeguarding/cases/${anon.id}`, { status: 'in Bearbeitung', steps: 'Gespräch geführt' })).status, 200);
  assert.equal((await sg.put(`/api/safeguarding/cases/${anon.id}`, { status: 'egal' })).status, 400);
  // Alle anderen Rollen: kein Zugriff auf Fälle
  for (const u of ['demo.sabine.kern', 'demo.markus.huber', 'demo.eva.lang', 'demo.datenschutz']) assert.equal((await (await loginAs(u)).get('/api/safeguarding/cases')).status, 403, u);
  assert.equal((await admin.get('/api/safeguarding/cases')).status, 403);
  // Anonyme Meldung: im Protokoll nicht der Name der Athletin
  const log = (await admin.get('/api/audit?q=Meldung')).data.rows;
  assert.ok(log.some((r) => r.user_name === 'anonym'));
  // Schutzfall-Zugriff
  const aid = c.athletes[0].id;
  assert.equal((await sg.post('/api/safeguarding/access', { athleteId: aid, why: 'kurz' })).status, 400);
  const a = await sg.post('/api/safeguarding/access', { athleteId: aid, why: 'Fall SG-02: Schutzmaßnahme prüfen' });
  assert.equal(a.status, 200);
  assert.ok(a.data.athlete.emergency);
  assert.equal(a.data.athlete.diagnosis, undefined);
  const lg = (await admin.get('/api/audit?area=Safeguarding&q=Schutzfall')).data.rows;
  assert.ok(lg.some((r) => r.athlete_id === aid && r.result === 'erlaubt (Schutzfall)'));
});

test('Wiederherstellung/Entfernen: Demodaten lassen sich vollständig entfernen, eigene Daten bleiben', async () => {
  // eigene (nicht-demo) Akte und Person anlegen
  const real = await makeUser(t, admin, { username: 'echte.koordination', displayName: 'Echte Koordination', role: 'koordinator', scope: { all: true } });
  const id = (await real.client.post('/api/athletes', { name: 'Echte Athletin', born: '2009-05-05', sex: 'w', sport: 'Leichtathletik', discipline: 'Sprint' })).data.id;
  await real.client.req('POST', `/api/athletes/${id}/entries/file?category=allgemein&title=T&filename=a.txt`, Buffer.from('Hallo'), { 'content-type': 'application/octet-stream' });
  const r = await admin.del('/api/system/demo');
  assert.equal(r.status, 200);
  assert.equal(r.data.athletes, 10);
  assert.equal(t.db.get('SELECT COUNT(*) AS n FROM athletes').n, 1);
  assert.equal(t.db.get('SELECT COUNT(*) AS n FROM users WHERE demo = 1').n, 0);
  assert.equal(t.db.get('SELECT COUNT(*) AS n FROM readiness').n, 0);
  assert.equal(t.db.get('SELECT COUNT(*) AS n FROM events').n, 0);
  assert.equal(t.db.get('SELECT COUNT(*) AS n FROM safe_cases WHERE demo = 1').n, 0);
  assert.ok(fs.existsSync(path.join(t.dir, 'dokumente', id)), 'echte Dokumente bleiben');
  assert.equal((await real.client.get(`/api/athletes/${id}`)).status, 200);
  assert.equal((await admin.get('/api/system/demo')).data.loaded, false);
  // erneutes Laden möglich
  assert.equal((await admin.post('/api/system/demo', { password: PW })).status, 200);
});

test('Migration 5 auf bestehender Phase-4-Datenbank (Standardwerte werden ergänzt)', async () => {
  const t5 = await startTestApp();
  try {
    downgrade(t5.db, 4);
    t5.db.migrate();
    assert.ok(t5.db.version >= 5);
    const { ensureGovernanceDefaults } = await import('../server/routes/governance.js');
    ensureGovernanceDefaults(t5.db);
    assert.equal(t5.db.get('SELECT COUNT(*) AS n FROM dpia').n, 6);
  } finally { await t5.stop(); }
});
