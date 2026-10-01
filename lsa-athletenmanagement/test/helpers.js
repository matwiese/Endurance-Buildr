import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/app.js';

export async function startTestApp(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsa-test-'));
  const config = loadConfig({ dataDir: dir, port: 0, autoBackup: false, ...extra });
  const inst = await createApp(config);
  const port = await inst.listen(0, '127.0.0.1');
  const base = `http://localhost:${port}`;

  function client() {
    let cookie = '';
    const c = {
      async req(method, url, body, headers = {}) {
        const h = { 'x-lsa-request': '1', ...headers };
        if (cookie) h.cookie = cookie;
        let payload = body;
        if (body !== undefined && !(body instanceof Uint8Array) && typeof body !== 'string') { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
        const r = await fetch(base + url, { method, headers: h, body: payload });
        const sc = r.headers.getSetCookie?.() || [];
        for (const s of sc) { const kv = s.split(';')[0]; if (kv.endsWith('=')) cookie = ''; else cookie = kv; }
        const ct = r.headers.get('content-type') || '';
        const data = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
        return { status: r.status, data, headers: r.headers };
      },
      get: (u, h) => c.req('GET', u, undefined, h),
      post: (u, b = {}, h) => c.req('POST', u, b, h),
      put: (u, b = {}, h) => c.req('PUT', u, b, h),
      del: (u, h) => c.req('DELETE', u, undefined, h),
      get cookie() { return cookie; },
      set cookie(v) { cookie = v; },
    };
    return c;
  }

  function rawHttp(pathname, headers = {}, method = 'GET') {
    return new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, (res) => {
        const chunks = []; res.on('data', (d) => chunks.push(d)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString(), headers: res.headers }));
      });
      r.on('error', reject); r.end();
    });
  }

  return {
    inst, base, dir, client, rawHttp, db: inst.db,
    async stop() { await inst.close(); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

// Richtet Administration ein und liefert angemeldeten Client
export async function setupAdmin(t) {
  const a = t.client();
  const r = await a.post('/api/setup', { orgName: 'Test-LSA', displayName: 'Admin Test', username: 'admin', password: 'Sehr-Gutes-Passwort-1' });
  if (r.status !== 200) throw new Error('Setup fehlgeschlagen: ' + JSON.stringify(r.data));
  return a;
}

// Legt Person an und liefert angemeldeten Client (Passwort bereits geändert)
export async function makeUser(t, admin, fields, password = 'Trainer-Passwort-123') {
  const r = await admin.post('/api/users', { password: 'Start-Passwort-123', ...fields });
  if (r.status !== 200) throw new Error('Person anlegen fehlgeschlagen: ' + JSON.stringify(r.data));
  const c = t.client();
  const l = await c.post('/api/login', { username: fields.username, password: 'Start-Passwort-123' });
  if (l.status !== 200) throw new Error('Login fehlgeschlagen: ' + JSON.stringify(l.data));
  const p = await c.post('/api/password', { current: 'Start-Passwort-123', next: password });
  if (p.status !== 200) throw new Error('Passwortwechsel fehlgeschlagen: ' + JSON.stringify(p.data));
  return { client: c, id: r.data.user.id };
}

// Simuliert eine ältere Datenbank: entfernt alle Tabellen, die nach `version` angelegt wurden, und setzt die Schema-Version zurück.
const TABLES_BY_VERSION = {
  2: ['consents', 'entries', 'athlete_staff', 'athletes'],
  3: ['readiness', 'training', 'measurements', 'quality_flags', 'plans', 'measures', 'goals', 'decisions', 'events', 'alerts', 'contact_requests'],
  4: ['load_status', 'status_history', 'injuries', 'cycle_notes', 'psych_notes', 'released_hints', 'school', 'exams'],
};
export function downgrade(db, version) {
  db.exec('PRAGMA foreign_keys=OFF');
  for (const [v, tables] of Object.entries(TABLES_BY_VERSION).sort((a, b) => b[0] - a[0])) {
    if (Number(v) > version) for (const t of tables) db.exec(`DROP TABLE IF EXISTS ${t}`);
  }
  db.exec(`PRAGMA user_version = ${version}; PRAGMA foreign_keys=ON`);
}
