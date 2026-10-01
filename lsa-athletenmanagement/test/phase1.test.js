import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, setupAdmin, makeUser } from './helpers.js';

let t, admin;
before(async () => { t = await startTestApp(); });
after(async () => { await t.stop(); });

test('vor der Einrichtung: setupRequired und kein Zugriff auf Daten', async () => {
  const c = t.client();
  const s = await c.get('/api/session');
  assert.equal(s.data.setupRequired, true);
  assert.equal(s.data.authenticated, false);
  assert.equal((await c.get('/api/users')).status, 401);
});

test('Ersteinrichtung legt Administration an, zweite Einrichtung wird abgelehnt', async () => {
  const weak = await t.client().post('/api/setup', { displayName: 'X', username: 'admin', password: 'kurz' });
  assert.equal(weak.status, 400);
  admin = await setupAdmin(t);
  const s = await admin.get('/api/session');
  assert.equal(s.data.authenticated, true);
  assert.equal(s.data.user.role, 'admin');
  assert.equal(s.data.permissions.features['users.manage'], true);
  assert.equal(s.data.permissions.tabs.health, 'none');
  const again = await t.client().post('/api/setup', { displayName: 'Y', username: 'zweiter', password: 'Sehr-Gutes-Passwort-2' });
  assert.equal(again.status, 409);
});

test('Datenordner mit Unterordnern und Datenbank wurde angelegt', () => {
  for (const f of ['lsa.sqlite', 'dokumente', 'backups', 'logs', 'LIESMICH.txt']) assert.ok(fs.existsSync(path.join(t.dir, f)), f);
});

test('Passwort wird nie im Klartext gespeichert (scrypt)', () => {
  const u = t.db.get("SELECT pw_hash FROM users WHERE username='admin'");
  assert.match(u.pw_hash, /^scrypt\$/);
  assert.ok(!u.pw_hash.includes('Sehr-Gutes'));
});

test('Login: falsches Passwort, Sperre nach Fehlversuchen', async () => {
  await makeUser(t, admin, { username: 'sperre.test', displayName: 'Sperre Test', role: 'trainer' });
  const c = t.client();
  for (let i = 0; i < 4; i++) assert.equal((await c.post('/api/login', { username: 'sperre.test', password: 'falsch' })).status, 401);
  assert.equal((await c.post('/api/login', { username: 'sperre.test', password: 'falsch' })).status, 401); // 5. Fehlversuch sperrt
  const locked = await c.post('/api/login', { username: 'sperre.test', password: 'Trainer-Passwort-123' });
  assert.equal(locked.status, 429);
  const users = await admin.get('/api/users');
  const u = users.data.users.find((x) => x.username === 'sperre.test');
  assert.equal(u.locked, true);
  await admin.post(`/api/users/${u.id}/unlock`);
  assert.equal((await c.post('/api/login', { username: 'sperre.test', password: 'Trainer-Passwort-123' })).status, 200);
});

test('neue Person muss Passwort ändern; vorher sind andere Routen gesperrt', async () => {
  const r = await admin.post('/api/users', { username: 'neu.person', displayName: 'Neu Person', role: 'koordinator' });
  assert.equal(r.status, 200);
  const temp = r.data.temporaryPassword;
  assert.equal(temp.length, 12);
  const c = t.client();
  assert.equal((await c.post('/api/login', { username: 'neu.person', password: temp })).status, 200);
  const blocked = await c.get('/api/settings');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.mustChangePassword, true);
  assert.equal((await c.get('/api/session')).data.user.mustChangePw, true);
  assert.equal((await c.post('/api/password', { current: temp, next: '12345' })).status, 400);
  assert.equal((await c.post('/api/password', { current: temp, next: 'Neues-Passwort-xyz' })).status, 200);
  assert.equal((await c.get('/api/settings')).status, 200);
});

test('Rechte: Trainer darf keine Personen verwalten, Verweigerung wird protokolliert', async () => {
  const { client } = await makeUser(t, admin, { username: 'trainer.a', displayName: 'Trainer A', role: 'trainer', scope: { sports: ['Leichtathletik'] } });
  assert.equal((await client.get('/api/users')).status, 403);
  assert.equal((await client.post('/api/users', { username: 'x.y', displayName: 'X', role: 'admin' })).status, 403);
  assert.equal((await client.get('/api/system')).status, 403);
  assert.equal((await client.get('/api/audit')).status, 403);
  const a = await admin.get('/api/audit?result=verweigert');
  assert.ok(a.data.rows.some((r) => r.user_name === 'Trainer A' && r.action.startsWith('Funktion verweigert')));
  const s = await client.get('/api/session');
  assert.equal(s.data.permissions.tabs.health, 'status');
  assert.equal(s.data.permissions.tabs.psych, 'released');
  assert.equal(s.data.permissions.features['training.record'], true);
  assert.deepEqual(s.data.user.scope.sports, ['Leichtathletik']);
});

test('Einzelrechte: Abweichungen von der Rollenvorlage werden gespeichert und wirken', async () => {
  const { client, id } = await makeUser(t, admin, { username: 'trainer.b', displayName: 'Trainer B', role: 'trainer' });
  const before = await client.get('/api/session');
  assert.equal(before.data.permissions.overridden, false);
  const r = await admin.put(`/api/users/${id}`, {
    overrides: { tabs: { health: 'physio', monitoring: 'full', overview: 'own' /* ungültig für Nicht-Athleten */ }, features: { 'kpi.view': true, 'training.record': true } },
  });
  assert.equal(r.status, 200);
  // monitoring=full und training.record=true entsprechen der Vorlage -> kein Override; overview=own wird verworfen
  assert.deepEqual(r.data.user.overrides, { tabs: { health: 'physio' }, features: { 'kpi.view': true } });
  const after = await client.get('/api/session');
  assert.equal(after.data.permissions.tabs.health, 'physio');
  assert.equal(after.data.permissions.features['kpi.view'], true);
  assert.equal(after.data.permissions.overrideCount, 2);
  const log = await admin.get('/api/audit?q=Person%20ge%C3%A4ndert');
  assert.ok(log.data.rows.some((x) => x.detail.includes('Einzelrechte geändert')));
});

test('Rollenwechsel setzt unpassende Einzelrechte zurück; ungültige Sportart wird abgelehnt', async () => {
  const c = await admin.post('/api/users', { username: 'wechsel', displayName: 'Wechsel', role: 'trainer', password: 'Start-Passwort-123' });
  const id = c.data.user.id;
  const bad = await admin.put(`/api/users/${id}`, { scope: { sports: ['Curling'] } });
  assert.equal(bad.status, 400);
  const r = await admin.put(`/api/users/${id}`, { role: 'arzt', scope: { all: true, sports: [] }, overrides: { tabs: { health: 'full' } } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.user.overrides.tabs, {}); // health=full ist Standard bei arzt
});

test('Athlet:innen-Zugänge können nicht über die Personenverwaltung angelegt werden', async () => {
  const r = await admin.post('/api/users', { username: 'athlet.x', displayName: 'Athlet X', role: 'athlet' });
  assert.equal(r.status, 400);
});

test('letzte Administration kann weder deaktiviert noch entrechtet werden', async () => {
  const me = (await admin.get('/api/session')).data.user;
  assert.equal((await admin.post(`/api/users/${me.id}/active`, { active: false })).status, 400);
  const r = await admin.put(`/api/users/${me.id}`, { role: 'trainer' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /letzte/);
});

test('Deaktivieren beendet laufende Sitzungen und verhindert Anmeldung', async () => {
  const { client, id } = await makeUser(t, admin, { username: 'weg.person', displayName: 'Weg Person', role: 'physio' });
  assert.equal((await client.get('/api/settings')).status, 200);
  await admin.post(`/api/users/${id}/active`, { active: false });
  assert.equal((await client.get('/api/settings')).status, 401);
  const l = await t.client().post('/api/login', { username: 'weg.person', password: 'Trainer-Passwort-123' });
  assert.equal(l.status, 403);
});

test('Passwort zurücksetzen erzwingt Wechsel und beendet alte Sitzung', async () => {
  const { client, id } = await makeUser(t, admin, { username: 'reset.me', displayName: 'Reset Me', role: 'dualcareer' });
  const r = await admin.post(`/api/users/${id}/reset-password`, {});
  assert.equal(r.status, 200);
  assert.equal((await client.get('/api/settings')).status, 401);
  const c2 = t.client();
  assert.equal((await c2.post('/api/login', { username: 'reset.me', password: 'Trainer-Passwort-123' })).status, 401);
  assert.equal((await c2.post('/api/login', { username: 'reset.me', password: r.data.temporaryPassword })).status, 200);
  assert.equal((await c2.get('/api/session')).data.user.mustChangePw, true);
});

test('Testansicht: Administration sieht mit den Rechten einer anderen Person, wird protokolliert', async () => {
  const { id } = await makeUser(t, admin, { username: 'test.arzt', displayName: 'Test Arzt', role: 'arzt', scope: { all: true } });
  const r = await admin.post('/api/impersonate', { userId: id });
  assert.equal(r.status, 200);
  const s = await admin.get('/api/session');
  assert.equal(s.data.user.username, 'test.arzt');
  assert.equal(s.data.realUser.username, 'admin');
  assert.equal(s.data.permissions.tabs.health, 'full');
  assert.equal((await admin.get('/api/users')).status, 403); // Rechte des Arztes, nicht des Admins
  await admin.post('/api/impersonate/stop');
  const back = await admin.get('/api/session');
  assert.equal(back.data.user.username, 'admin');
  assert.equal(back.data.realUser, null);
  const log = await admin.get('/api/audit?q=Testansicht');
  assert.ok(log.data.rows.length >= 2);
});

test('Testansicht kann ausgeschaltet werden; Nicht-Admins dürfen sie nie nutzen', async () => {
  const { client } = await makeUser(t, admin, { username: 'neugier', displayName: 'Neugier', role: 'trainer' });
  const other = (await admin.get('/api/users')).data.users.find((u) => u.username === 'test.arzt');
  assert.equal((await client.post('/api/impersonate', { userId: other.id })).status, 403);
  await admin.put('/api/settings', { testMode: false });
  assert.equal((await admin.post('/api/impersonate', { userId: other.id })).status, 403);
  await admin.put('/api/settings', { testMode: true });
});

test('Sicherheit: Änderungen ohne Header abgelehnt, fremder Origin abgelehnt, falscher Host abgelehnt', async () => {
  const raw = await fetch(t.base + '/api/logout', { method: 'POST' });
  assert.equal(raw.status, 403);
  const foreign = await fetch(t.base + '/api/logout', { method: 'POST', headers: { 'x-lsa-request': '1', origin: 'http://boese.example' } });
  assert.equal(foreign.status, 403);
  const rebind = await t.rawHttp('/api/session', { host: 'boese.example' });
  assert.equal(rebind.status, 421);
  const hdr = await t.rawHttp('/');
  assert.equal(hdr.status, 200);
  assert.match(hdr.headers['content-security-policy'], /script-src 'self'/);
  assert.equal(hdr.headers['x-content-type-options'], 'nosniff');
});

test('statische Dateien: Verzeichnis-Ausbruch wird verhindert', async () => {
  const r = await t.rawHttp('/..%2f..%2fpackage.json');
  assert.ok([403, 404, 400].includes(r.status) || !r.body.includes('"name"'));
  const r2 = await t.rawHttp('/js/../../server/config.js');
  assert.ok(!r2.body.includes('prepareDataDir'));
});

test('Sportarten verwalten: Entfernen verwendeter Sportart ist verboten', async () => {
  assert.equal((await admin.put('/api/settings', { sports: ['Leichtathletik', 'Schwimmen', 'Radsport'] })).status, 200);
  assert.ok((await admin.get('/api/settings')).data.sports.includes('Radsport'));
  const used = await admin.put('/api/settings', { sports: ['Schwimmen', 'Radsport'] }); // Leichtathletik wird von trainer.a verwendet
  assert.equal(used.status, 400);
});

test('Backup erstellt konsistente Kopie der Datenbank', async () => {
  const r = await admin.post('/api/backup');
  assert.equal(r.status, 200);
  const sys = await admin.get('/api/system');
  assert.equal(sys.data.backups.length, 1);
  assert.ok(sys.data.backups[0].dbSize > 0);
  assert.ok(fs.existsSync(path.join(sys.data.backups[0].path, 'lsa.sqlite')));
  assert.equal(sys.data.dataDir, t.dir);
});

test('Sitzung: Abmelden macht Cookie ungültig', async () => {
  const { client } = await makeUser(t, admin, { username: 'logout.test', displayName: 'Logout Test', role: 'trainer' });
  const old = client.cookie;
  await client.post('/api/logout');
  const c2 = t.client(); c2.cookie = old;
  assert.equal((await c2.get('/api/settings')).status, 401);
});
