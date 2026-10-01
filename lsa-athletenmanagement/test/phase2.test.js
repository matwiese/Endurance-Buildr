import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, setupAdmin, makeUser } from './helpers.js';

let t, admin, koord, trainerLA, trainerSW, arzt, psych, dc;
let a1, a2; // Athleten-IDs

const athleteBody = (o = {}) => ({ name: 'Lena Berger', born: '2009-03-12', sex: 'w', sport: 'Leichtathletik', discipline: 'Sprint', group: 'Sprint U18', club: 'ULC Mödling', federation: 'ÖLV', kader: 'Nachwuchskader', school: 'BORG Südstadt', schoolClass: '6B', eduGoal: 'Matura 2027', boarding: true, guardian: 'Eva Berger, 0664 1234567', emergency: 'Eva Berger', ...o });
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');

before(async () => {
  t = await startTestApp();
  admin = await setupAdmin(t);
  koord = (await makeUser(t, admin, { username: 'koord', displayName: 'Sabine Kern', role: 'koordinator', scope: { all: true } })).client;
  trainerLA = (await makeUser(t, admin, { username: 'trainer.la', displayName: 'Markus Huber', role: 'trainer', scope: { sports: ['Leichtathletik'] } })).client;
  trainerSW = (await makeUser(t, admin, { username: 'trainer.sw', displayName: 'Petra Wagner', role: 'trainer', scope: { sports: ['Schwimmen'] } })).client;
  arzt = (await makeUser(t, admin, { username: 'arzt', displayName: 'Dr. Eva Lang', role: 'arzt', scope: { all: true } })).client;
  psych = (await makeUser(t, admin, { username: 'psych', displayName: 'Ruth Aigner', role: 'psych', scope: { all: true } })).client;
  dc = (await makeUser(t, admin, { username: 'dual.career', displayName: 'Julia Pichler', role: 'dualcareer', scope: { all: true } })).client;
});
after(async () => { await t.stop(); });

test('Akte anlegen: nur mit Recht, ID wird vergeben, Koordination kommt automatisch ins Team', async () => {
  assert.equal((await trainerLA.post('/api/athletes', athleteBody())).status, 403);
  const bad = await koord.post('/api/athletes', athleteBody({ born: '2030-01-01' }));
  assert.equal(bad.status, 400);
  assert.equal((await koord.post('/api/athletes', athleteBody({ sport: 'Curling' }))).status, 400);
  const r = await koord.post('/api/athletes', athleteBody());
  assert.equal(r.status, 200);
  a1 = r.data.id;
  assert.match(a1, /^LSA-0001$/);
  const r2 = await koord.post('/api/athletes', athleteBody({ name: 'Emma Hofer', sport: 'Schwimmen', discipline: 'Freistil', born: '2009-01-30' }));
  a2 = r2.data.id;
  assert.equal(a2, 'LSA-0002');
  const g = await koord.get(`/api/athletes/${a1}`);
  assert.equal(g.data.athlete.name, 'Lena Berger');
  assert.deepEqual(g.data.team.map((x) => x.function), ['Koordination']);
  assert.equal(g.data.can.edit, true);
});

test('Athletenbereich: Trainer sehen nur ihre Sportart, nicht fremde Akten', async () => {
  const la = await trainerLA.get('/api/athletes');
  assert.deepEqual(la.data.athletes.map((a) => a.id), [a1]);
  const sw = await trainerSW.get('/api/athletes');
  assert.deepEqual(sw.data.athletes.map((a) => a.id), [a2]);
  assert.equal((await trainerLA.get(`/api/athletes/${a2}`)).status, 404);
  assert.equal((await trainerLA.get(`/api/athletes/${a2}/entries`)).status, 404);
  const log = await admin.get('/api/audit?result=verweigert&q=Akte');
  assert.ok(log.data.rows.some((r) => r.user_name === 'Markus Huber' && r.athlete_id === a2));
});

test('Zuordnung per Betreuungsteam gibt Zugriff auf einzelne Akten', async () => {
  const dir = await koord.get('/api/directory');
  assert.equal(dir.status, 200);
  const swId = dir.data.people.find((p) => p.name === 'Petra Wagner').id;
  const laId = dir.data.people.find((p) => p.name === 'Markus Huber').id;
  assert.equal((await trainerLA.get('/api/directory')).status, 403);
  // SW-Trainerin wird zusätzlich der Akte von Lena zugeordnet
  const r = await koord.put(`/api/athletes/${a1}/team`, { team: [{ userId: laId, function: 'Trainer:in' }, { userId: swId, function: 'Trainer:in' }] });
  assert.equal(r.status, 200);
  assert.equal(r.data.team.length, 2);
  assert.deepEqual((await trainerSW.get('/api/athletes')).data.athletes.map((a) => a.id).sort(), [a1, a2]);
  assert.equal((await trainerSW.get(`/api/athletes/${a1}`)).status, 200);
  // Zuordnung wieder entfernen -> Zugriff weg
  await koord.put(`/api/athletes/${a1}/team`, { team: [{ userId: laId, function: 'Trainer:in' }] });
  assert.equal((await trainerSW.get(`/api/athletes/${a1}`)).status, 404);
  assert.equal((await trainerLA.put(`/api/athletes/${a1}/team`, { team: [] })).status, 403);
  const log = await admin.get('/api/audit?q=Betreuungsteam');
  assert.ok(log.data.rows.some((x) => x.detail.includes('Petra Wagner')));
});

test('Reiter-Stufen je Rolle in der Akte', async () => {
  const lv = async (c) => (await c.get(`/api/athletes/${a1}`)).data.levels;
  assert.equal((await lv(trainerLA)).health, 'status');
  assert.equal((await lv(arzt)).health, 'full');
  assert.equal((await lv(psych)).psych, 'full');
  assert.equal((await lv(dc)).school, 'full');
  assert.equal((await lv(dc)).health, 'none');
  // Verwaltungs-Admin sieht Stammdaten, aber nichts Medizinisches
  const al = (await admin.get(`/api/athletes/${a1}`)).data.levels;
  assert.equal(al.overview, 'full'); assert.equal(al.health, 'none'); assert.equal(al.psych, 'none');
});

test('Stammdaten ändern: nur mit Stufe "vollständig"; Änderungen im Protokoll', async () => {
  assert.equal((await trainerLA.put(`/api/athletes/${a1}`, athleteBody({ club: 'Neu' }))).status, 403);
  const r = await koord.put(`/api/athletes/${a1}`, athleteBody({ club: 'LCA Wien', kader: 'Landeskader' }));
  assert.equal(r.status, 200);
  const g = await koord.get(`/api/athletes/${a1}`);
  assert.equal(g.data.athlete.club, 'LCA Wien');
  const log = await admin.get('/api/audit?q=Stammdaten%20ge%C3%A4ndert');
  assert.ok(log.data.rows.some((x) => x.detail.includes('Verein') && x.detail.includes('Kader')));
});

test('Notizen: Berechtigung folgt der Kategorie (Medizin nur Medizin, Psychologie nur Psychologie)', async () => {
  // Trainer darf Plan-Notiz anlegen, aber keine medizinische
  assert.equal((await trainerLA.post(`/api/athletes/${a1}/entries`, { category: 'plan', title: 'Saisonziel', text: 'Beschleunigung' })).status, 200);
  assert.equal((await trainerLA.post(`/api/athletes/${a1}/entries`, { category: 'medizin', title: 'X', text: 'Y' })).status, 403);
  assert.equal((await trainerLA.post(`/api/athletes/${a1}/entries`, { category: 'psychologie', title: 'X', text: 'Y' })).status, 403);
  // Arzt legt medizinische Notiz an
  const m = await arzt.post(`/api/athletes/${a1}/entries`, { category: 'medizin', title: 'Befund Oberschenkel', text: 'Muskelfaserriss Grad I' });
  assert.equal(m.status, 200);
  // Psychologin legt geschützte Notiz an
  const p = await psych.post(`/api/athletes/${a1}/entries`, { category: 'psychologie', title: 'Gespräch 1', text: 'Prüfungsdruck' });
  assert.equal(p.status, 200);
  // Wer sieht was?
  const titles = async (c) => (await c.get(`/api/athletes/${a1}/entries`)).data.entries.map((e) => e.title).sort();
  assert.deepEqual(await titles(trainerLA), ['Saisonziel']);
  assert.deepEqual(await titles(arzt), ['Befund Oberschenkel', 'Saisonziel']);
  assert.deepEqual(await titles(psych), ['Gespräch 1', 'Saisonziel']);
  assert.deepEqual(await titles(dc), ['Saisonziel']);
  // direkter Zugriff auf fremde Kategorie über die Eintrags-ID wird wie "nicht vorhanden" behandelt
  const medId = (await arzt.get(`/api/athletes/${a1}/entries`)).data.entries.find((e) => e.category === 'medizin').id;
  assert.equal((await trainerLA.put(`/api/entries/${medId}`, { title: 'gehackt' })).status, 404);
  assert.equal((await trainerLA.del(`/api/entries/${medId}`)).status, 404);
  assert.equal((await trainerLA.get(`/api/entries/${medId}/file`)).status, 404);
  const log = await admin.get('/api/audit?result=verweigert&q=Akteneintrag');
  assert.ok(log.data.rows.length >= 1);
  // Medizin-Zugriff wird protokolliert
  const rd = await admin.get('/api/audit?area=Medizin&q=angesehen');
  assert.ok(rd.data.rows.some((r) => r.user_name === 'Dr. Eva Lang'));
});

test('Datei-Upload: Typ- und Inhaltsprüfung, Ablage im Datenordner, Download mit Rechteprüfung', async () => {
  const up = (c, cat, name, buf, extra = '') => c.req('POST', `/api/athletes/${a1}/entries/file?category=${cat}&title=${encodeURIComponent('Foto ' + name)}&filename=${encodeURIComponent(name)}${extra}`, buf, { 'content-type': 'application/octet-stream' });
  assert.equal((await up(koord, 'allgemein', 'virus.exe', Buffer.from('MZ'))).status, 400);
  assert.equal((await up(koord, 'allgemein', 'fake.png', Buffer.from('<html>nope</html>'))).status, 400);
  assert.equal((await up(koord, 'allgemein', 'leer.txt', Buffer.alloc(0))).status, 400);
  assert.equal((await up(trainerLA, 'medizin', 'x.png', PNG)).status, 403);
  const ok = await up(koord, 'allgemein', 'Größe Bär.png', PNG, '&visible=1');
  assert.equal(ok.status, 200);
  const list = (await koord.get(`/api/athletes/${a1}/entries?category=allgemein`)).data.entries;
  assert.equal(list.length, 1);
  assert.equal(list[0].file.name, 'Größe Bär.png');
  assert.equal(list[0].file.image, true);
  // Datei liegt unter dokumente/<ID>/ mit zufälligem Namen
  const dir = path.join(t.dir, 'dokumente', a1);
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1);
  assert.ok(!files[0].includes('png') && !files[0].includes('Bär'));
  const dl = await koord.get(`/api/entries/${list[0].id}/file`);
  assert.equal(dl.status, 200);
  assert.deepEqual(dl.data, PNG);
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  assert.equal(dl.headers.get('x-content-type-options'), 'nosniff');
  const inl = await koord.get(`/api/entries/${list[0].id}/file?inline=1`);
  assert.match(inl.headers.get('content-disposition'), /inline/);
  // Trainer darf lesen (Kategorie "allgemein" = Reiter Überblick: read)
  assert.equal((await trainerLA.get(`/api/entries/${list[0].id}/file`)).status, 200);
  // Fremder Trainer hat keinen Zugriff
  assert.equal((await trainerSW.get(`/api/entries/${list[0].id}/file`)).status, 404);
  // Löschen entfernt Datei vom Datenträger
  assert.equal((await koord.del(`/api/entries/${list[0].id}`)).status, 200);
  assert.equal(fs.readdirSync(dir).length, 0);
});

test('Upload-Größenlimit', async () => {
  const t2 = await startTestApp({ maxUploadMb: 1 });
  try {
    const adm = await setupAdmin(t2);
    const r = await adm.post('/api/athletes', athleteBody());
    const big = Buffer.alloc(1024 * 1024 + 10, 65);
    const res = await adm.req('POST', `/api/athletes/${r.data.id}/entries/file?category=allgemein&title=x&filename=big.txt`, big, { 'content-type': 'application/octet-stream' });
    assert.equal(res.status, 413);
  } finally { await t2.stop(); }
});

test('Athlet:innen-Zugang: sieht nur die eigene Akte und nur freigegebene Einträge', async () => {
  const mk = await koord.post(`/api/athletes/${a1}/login`, {});
  assert.equal(mk.status, 200);
  assert.equal(mk.data.login.username, 'lena.berger');
  assert.equal((await koord.post(`/api/athletes/${a1}/login`, {})).status, 409);
  const lena = t.client();
  assert.equal((await lena.post('/api/login', { username: 'lena.berger', password: mk.data.temporaryPassword })).status, 200);
  assert.equal((await lena.post('/api/password', { current: mk.data.temporaryPassword, next: 'Lena-Passwort-123' })).status, 200);
  const s = await lena.get('/api/session');
  assert.equal(s.data.user.role, 'athlet');
  assert.equal(s.data.user.athleteId, a1);
  assert.deepEqual((await lena.get('/api/athletes')).data.athletes.map((a) => a.id), [a1]);
  assert.equal((await lena.get(`/api/athletes/${a2}`)).status, 404);
  assert.equal((await lena.get('/api/users')).status, 403);
  assert.equal((await lena.post('/api/athletes', athleteBody())).status, 403);
  assert.equal((await lena.put(`/api/athletes/${a1}`, athleteBody({ name: 'Hacker' }))).status, 403);
  // sichtbar sind nur Einträge, die freigegeben wurden
  const e0 = (await lena.get(`/api/athletes/${a1}/entries`)).data;
  assert.equal(e0.entries.length, 0);
  const id = (await koord.post(`/api/athletes/${a1}/entries`, { category: 'plan', title: 'Mein Plan', text: 'Für dich', visibleToAthlete: true })).data.id;
  await koord.post(`/api/athletes/${a1}/entries`, { category: 'plan', title: 'Intern', text: 'nicht für Athletin' });
  const e1 = (await lena.get(`/api/athletes/${a1}/entries`)).data;
  assert.deepEqual(e1.entries.map((e) => e.title), ['Mein Plan']);
  assert.deepEqual(e1.writable, []);
  assert.equal((await lena.post(`/api/athletes/${a1}/entries`, { category: 'plan', title: 'x', text: 'y' })).status, 403);
  assert.equal((await lena.del(`/api/entries/${id}`)).status, 403);
});

test('Einwilligungen: Athletin ändert freiwillige, nicht verpflichtende; Koordination dokumentiert Papier-Einwilligung', async () => {
  const lena = t.client();
  await lena.post('/api/login', { username: 'lena.berger', password: 'Lena-Passwort-123' });
  const p = (await lena.get(`/api/athletes/${a1}/privacy`)).data;
  assert.equal(p.consents.length, 5);
  assert.equal(p.minor, true);
  assert.equal(p.consents.find((c) => c.key === 'cycle').status, 'nicht erteilt');
  const up = await lena.put(`/api/athletes/${a1}/consents/video`, { status: 'erteilt' });
  assert.equal(up.status, 200);
  assert.equal(up.data.consent.givenBy, 'Athlet:in');
  assert.equal((await lena.put(`/api/athletes/${a1}/consents/monitoring`, { status: 'erteilt' })).status, 403);
  assert.equal((await lena.put(`/api/athletes/${a1}/consents/video`, { status: 'informiert' })).status, 400);
  assert.equal((await lena.put(`/api/athletes/${a1}/consents/video`, { status: 'widerrufen' })).status, 200);
  // Koordination: Pflichtangabe "durch wen"
  assert.equal((await koord.put(`/api/athletes/${a1}/consents/research`, { status: 'erteilt' })).status, 400);
  const k = await koord.put(`/api/athletes/${a1}/consents/research`, { status: 'erteilt', givenBy: 'Erziehungsberechtigte', note: 'Formular vom 01.10. liegt vor' });
  assert.equal(k.status, 200);
  assert.equal(k.data.consent.note, 'Formular vom 01.10. liegt vor');
  // Trainer hat keinen Zugriff auf den Reiter
  assert.equal((await trainerLA.get(`/api/athletes/${a1}/privacy`)).status, 403);
  // Athletin sieht, wer zugegriffen hat (Rolle, nicht Name)
  const again = (await lena.get(`/api/athletes/${a1}/privacy`)).data;
  assert.ok(again.log.length > 0);
  assert.ok(!('user_name' in again.log[0]));
});

test('Geschlechtswechsel schaltet die Zyklus-Einwilligung um', async () => {
  const mk = await koord.post('/api/athletes', athleteBody({ name: 'Jonas Mayr', sex: 'm', born: '2008-07-02' }));
  const id = mk.data.id;
  assert.equal((await koord.get(`/api/athletes/${id}/privacy`)).data.consents.find((c) => c.key === 'cycle').status, 'entfällt');
  await koord.put(`/api/athletes/${id}`, athleteBody({ name: 'Jonas Mayr', sex: 'w', born: '2008-07-02' }));
  assert.equal((await koord.get(`/api/athletes/${id}/privacy`)).data.consents.find((c) => c.key === 'cycle').status, 'nicht erteilt');
});

test('Austritt: Zugang wird beendet, Checkliste, Sichtbarkeit nur noch für Koordination', async () => {
  const mk = await koord.post('/api/athletes', athleteBody({ name: 'Paul Moser', born: '2008-09-17' }));
  const id = mk.data.id;
  const lg = await koord.post(`/api/athletes/${id}/login`, {});
  const paul = t.client();
  await paul.post('/api/login', { username: 'paul.moser', password: lg.data.temporaryPassword });
  assert.equal((await trainerLA.get(`/api/athletes/${id}`)).status, 200);
  assert.equal((await koord.post(`/api/athletes/${id}/lifecycle`, { status: 'ausgetreten' })).status, 200);
  assert.equal((await trainerLA.get(`/api/athletes/${id}`)).status, 404);
  assert.ok(!(await trainerLA.get('/api/athletes')).data.athletes.some((a) => a.id === id));
  assert.equal((await paul.get('/api/session')).data.authenticated, false); // Sitzung beendet
  const g = (await koord.get(`/api/athletes/${id}`)).data;
  assert.equal(g.athlete.status, 'ausgetreten');
  assert.equal(g.athlete.exitChecklist[0], true);
  const c = await koord.post(`/api/athletes/${id}/exit-check`, { index: 3, checked: true });
  assert.equal(c.data.exitChecklist[3], true);
  assert.equal((await trainerLA.post(`/api/athletes/${id}/lifecycle`, { status: 'aktiv' })).status, 404);
});

test('Akte löschen: ID-Bestätigung nötig, entfernt Daten, Dokumente und Zugang', async () => {
  const mk = await koord.post('/api/athletes', athleteBody({ name: 'Löschtest', born: '2009-05-05' }));
  const id = mk.data.id;
  await koord.req('POST', `/api/athletes/${id}/entries/file?category=allgemein&title=T&filename=a.txt`, Buffer.from('Hallo'), { 'content-type': 'application/octet-stream' });
  await koord.post(`/api/athletes/${id}/login`, {});
  assert.ok(fs.existsSync(path.join(t.dir, 'dokumente', id)));
  assert.equal((await trainerLA.del(`/api/athletes/${id}`)).status, 403);
  assert.equal((await koord.req('DELETE', `/api/athletes/${id}`, { confirm: 'falsch' })).status, 400);
  assert.equal((await koord.req('DELETE', `/api/athletes/${id}`, { confirm: id })).status, 200);
  assert.ok(!fs.existsSync(path.join(t.dir, 'dokumente', id)));
  assert.equal((await koord.get(`/api/athletes/${id}`)).status, 404);
  assert.equal(t.db.get('SELECT COUNT(*) AS n FROM consents WHERE athlete_id = ?', id).n, 0);
  assert.equal(t.db.get('SELECT COUNT(*) AS n FROM users WHERE athlete_id = ?', id).n, 0);
  const log = await admin.get('/api/audit?q=gel%C3%B6scht');
  assert.ok(log.data.rows.some((r) => r.athlete_id === id));
});

test('Datenbank-Migration: Update von Phase 1 behält Daten', async () => {
  const t3 = await startTestApp();
  try {
    t3.db.exec('PRAGMA foreign_keys=OFF; DROP TABLE consents; DROP TABLE entries; DROP TABLE athlete_staff; DROP TABLE athletes; PRAGMA user_version = 1; PRAGMA foreign_keys=ON;');
    const adm = await setupAdmin(t3);
    t3.db.migrate();
    assert.equal(t3.db.version, 2);
    assert.equal((await adm.get('/api/session')).data.user.username, 'admin');
    assert.equal((await adm.get('/api/athletes')).status, 200);
  } finally { await t3.stop(); }
});
