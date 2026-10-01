// Sicherungen: Datenbank (konsistent per VACUUM INTO) + hochgeladene Dokumente.
import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from './util.js';
import { VERSION } from './config.js';

const stamp = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export function createBackup(db, config, { label = 'manuell', withDocs = true } = {}) {
  const name = `${stamp()}_${label}`;
  const dir = path.join(config.backupDir, name);
  fs.mkdirSync(dir, { recursive: true });
  db.backupTo(path.join(dir, 'lsa.sqlite'));
  let docs = 0;
  if (withDocs && fs.existsSync(config.docsDir)) {
    fs.cpSync(config.docsDir, path.join(dir, 'dokumente'), { recursive: true });
    docs = countFiles(path.join(dir, 'dokumente'));
  }
  const manifest = { created: nowIso(), label, version: VERSION, schemaVersion: db.version, documents: docs, withDocs };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { name, dir, ...manifest };
}

function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1;
  return n;
}

export function listBackups(config) {
  if (!fs.existsSync(config.backupDir)) return [];
  return fs.readdirSync(config.backupDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const dir = path.join(config.backupDir, e.name);
      let m = {};
      try { m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { /* ohne Manifest */ }
      let size = 0;
      try { size = fs.statSync(path.join(dir, 'lsa.sqlite')).size; } catch { /* leer */ }
      return { name: e.name, path: dir, created: m.created || null, label: m.label || '', documents: m.documents ?? null, dbSize: size };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

// Tägliche automatische Sicherung der Datenbank beim Start; behält die letzten 14.
export function autoBackup(db, config) {
  const today = stamp().slice(0, 10);
  const existing = listBackups(config);
  if (existing.some((b) => b.name.startsWith(today) && b.label === 'auto')) return null;
  const b = createBackup(db, config, { label: 'auto', withDocs: false });
  const autos = listBackups(config).filter((x) => x.label === 'auto');
  for (const old of autos.slice(14)) fs.rmSync(old.path, { recursive: true, force: true });
  return b;
}
