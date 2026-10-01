// Systemverwaltung: Einstellungen, Backups, Zugriffsprotokoll.
import fs from 'node:fs';
import { badRequest } from '../http.js';
import { audit } from '../auth.js';
import { getSetting, setSetting } from '../db.js';
import { createBackup, listBackups } from '../backup.js';
import { str, bool } from '../util.js';
import { VERSION } from '../config.js';

export function defaultSettings(db) {
  const defaults = {
    org_name: 'LSA',
    sports: ['Leichtathletik', 'Schwimmen'],
    athlete_prefix: 'LSA',
    test_mode: true,
  };
  for (const [k, v] of Object.entries(defaults)) if (db.get('SELECT 1 AS x FROM settings WHERE key = ?', k) == null) setSetting(db, k, v);
}

export function register(app) {
  const { router, db, config } = app;

  router.get('/api/settings', (ctx) => ({
    orgName: getSetting(db, 'org_name', 'LSA'),
    sports: getSetting(db, 'sports', []),
    athletePrefix: getSetting(db, 'athlete_prefix', 'LSA'),
    testMode: !!getSetting(db, 'test_mode', true),
  }));

  router.put('/api/settings', { feature: 'system.manage' }, async (ctx) => {
    const b = await ctx.json();
    const changes = [];
    if (b.orgName !== undefined) {
      const v = str(b.orgName, 100);
      if (!v) throw badRequest('Der Name der Organisation darf nicht leer sein.');
      setSetting(db, 'org_name', v); changes.push('Organisationsname');
    }
    if (b.sports !== undefined) {
      if (!Array.isArray(b.sports)) throw badRequest('Ungültige Sportarten.');
      const list = [...new Set(b.sports.map((s) => str(s, 60)).filter(Boolean))];
      if (!list.length) throw badRequest('Mindestens eine Sportart wird benötigt.');
      // Sportarten, die noch in Verwendung sind, dürfen nicht entfernt werden
      const used = new Set();
      for (const u of db.all('SELECT scope_sports FROM users')) { try { JSON.parse(u.scope_sports).forEach((s) => used.add(s)); } catch { /* leer */ } }
      if (db.get("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='athletes'")) for (const a of db.all('SELECT DISTINCT sport FROM athletes')) used.add(a.sport);
      const missing = [...used].filter((s) => !list.includes(s));
      if (missing.length) throw badRequest(`Sportart(en) noch in Verwendung und nicht entfernbar: ${missing.join(', ')}`);
      setSetting(db, 'sports', list); changes.push('Sportarten');
    }
    if (b.athletePrefix !== undefined) {
      const v = str(b.athletePrefix, 8).toUpperCase();
      if (!/^[A-Z0-9]{2,8}$/.test(v)) throw badRequest('Präfix der Athleten-ID: 2–8 Buchstaben/Ziffern.');
      setSetting(db, 'athlete_prefix', v); changes.push('ID-Präfix');
    }
    if (b.testMode !== undefined) { setSetting(db, 'test_mode', bool(b.testMode)); changes.push(`Testansicht ${bool(b.testMode) ? 'an' : 'aus'}`); }
    audit(db, ctx, { area: 'System', action: 'Einstellungen geändert', detail: changes.join(', ') });
    return { ok: true };
  });

  router.get('/api/system', { feature: 'system.manage' }, () => {
    let dbSize = 0, docSize = 0;
    try { dbSize = fs.statSync(config.dbFile).size; } catch { /* leer */ }
    const walk = (d) => { let n = 0; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) n += e.isDirectory() ? walk(`${d}/${e.name}`) : fs.statSync(`${d}/${e.name}`).size; } catch { /* leer */ } return n; };
    docSize = walk(config.docsDir);
    return {
      version: VERSION, node: process.versions.node, platform: process.platform, schemaVersion: db.version,
      dataDir: config.dataDir, dbFile: config.dbFile, docsDir: config.docsDir, backupDir: config.backupDir, logDir: config.logDir,
      dataDirFallback: config.dataDirFallback, bind: config.bind, port: app.port || config.port, maxUploadMb: config.maxUploadMb,
      dbSize, docSize, uptimeSec: Math.round(process.uptime()),
      counts: {
        users: db.get('SELECT COUNT(*) AS n FROM users').n,
        athletes: db.get("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='athletes'") ? db.get('SELECT COUNT(*) AS n FROM athletes').n : 0,
        audit: db.get('SELECT COUNT(*) AS n FROM audit').n,
      },
      backups: listBackups(config),
    };
  });

  router.post('/api/backup', { feature: 'system.manage' }, (ctx) => {
    const b = createBackup(db, config, { label: 'manuell', withDocs: true });
    audit(db, ctx, { area: 'System', action: 'Backup erstellt', detail: b.name });
    return { backup: { name: b.name, path: b.dir, documents: b.documents } };
  });

  // Zugriffsprotokoll (Administration und Datenschutz). Filter: Ergebnis, Athleten-ID, Bereich, Text.
  router.get('/api/audit', { feature: 'audit.view' }, (ctx) => {
    const q = ctx.query;
    const where = [], args = [];
    if (q.result && q.result !== 'alle') { where.push('result = ?'); args.push(q.result); }
    if (q.athlete) { where.push('athlete_id = ?'); args.push(q.athlete); }
    if (q.area) { where.push('area = ?'); args.push(q.area); }
    if (q.q) { where.push('(action LIKE ? OR user_name LIKE ? OR detail LIKE ?)'); const t = `%${q.q}%`; args.push(t, t, t); }
    const limit = Math.min(500, Number(q.limit) || 100), offset = Math.max(0, Number(q.offset) || 0);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = db.get(`SELECT COUNT(*) AS n FROM audit ${w}`, ...args).n;
    const rows = db.all(`SELECT * FROM audit ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, ...args, limit, offset);
    const results = db.all('SELECT result, COUNT(*) AS n FROM audit GROUP BY result ORDER BY n DESC');
    const areas = db.all("SELECT DISTINCT area FROM audit WHERE area != '' ORDER BY area").map((r) => r.area);
    return { total, rows, results, areas };
  });
}
