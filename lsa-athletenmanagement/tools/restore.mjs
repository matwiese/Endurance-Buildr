// Stellt eine Sicherung wieder her:  node tools/restore.mjs [Sicherungsname]
// Das Programm muss vorher beendet sein. Der aktuelle Stand wird vorher selbst gesichert ("vor-wiederherstellung_…").
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig, prepareDataDir } from '../server/config.js';

const cfg = prepareDataDir(loadConfig());
const say = (...a) => console.log(...a);

// Läuft der Server noch? (Ports 8420–8429 und der konfigurierte Port)
async function serverRunning() {
  for (const port of new Set([cfg.port, ...Array.from({ length: 10 }, (_, i) => 8420 + i)])) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/session`, { signal: AbortSignal.timeout(700) });
      if (r.headers.get('content-type')?.includes('json')) return port;
    } catch { /* kein Server */ }
  }
  return null;
}

const backups = fs.existsSync(cfg.backupDir)
  ? fs.readdirSync(cfg.backupDir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(cfg.backupDir, e.name, 'lsa.sqlite'))).map((e) => e.name).sort().reverse()
  : [];

say('');
say('  LSA Athletenmanagement – Wiederherstellung');
say('  Datenordner: ' + cfg.dataDir);
say('');
if (!backups.length) { say('  Keine Sicherungen gefunden in ' + cfg.backupDir); process.exit(1); }

const port = await serverRunning();
if (port) { say(`  FEHLER: Das Programm läuft noch (Port ${port}). Bitte zuerst das Programm-Fenster schließen und dann erneut starten.`); process.exit(2); }

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let name = process.argv[2];
if (!name) {
  backups.slice(0, 20).forEach((b, i) => {
    let info = '';
    try { const m = JSON.parse(fs.readFileSync(path.join(cfg.backupDir, b, 'manifest.json'), 'utf8')); info = `  (${m.label}, ${m.withDocs ? m.documents + ' Dokumente' : 'nur Datenbank'})`; } catch { /* ohne Manifest */ }
    say(`  [${i + 1}] ${b}${info}`);
  });
  const a = (await rl.question('\n  Nummer der Sicherung (Enter = Abbruch): ')).trim();
  if (!a) { say('  Abgebrochen.'); process.exit(0); }
  name = backups[Number(a) - 1];
  if (!name) { say('  Ungültige Nummer.'); process.exit(1); }
}
const src = path.join(cfg.backupDir, name);
if (!fs.existsSync(path.join(src, 'lsa.sqlite'))) { say('  Sicherung nicht gefunden: ' + src); process.exit(1); }

// Integrität der Sicherung prüfen
try {
  const t = new DatabaseSync(path.join(src, 'lsa.sqlite'), { readOnly: true });
  const ok = t.prepare('PRAGMA integrity_check').get().integrity_check;
  t.close();
  if (ok !== 'ok') throw new Error(ok);
} catch (e) { say('  Die Sicherung ist beschädigt: ' + e.message); process.exit(1); }

say(`\n  Wiederherstellen aus: ${name}`);
say('  Der aktuelle Stand wird vorher gesichert, wird danach aber NICHT mehr verwendet.');
const yes = (await rl.question('  Zum Bestätigen WIEDERHERSTELLEN eingeben: ')).trim();
rl.close();
if (yes !== 'WIEDERHERSTELLEN') { say('  Abgebrochen.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const safe = path.join(cfg.backupDir, `vor-wiederherstellung_${stamp}`);
fs.mkdirSync(safe, { recursive: true });
for (const f of ['lsa.sqlite', 'lsa.sqlite-wal', 'lsa.sqlite-shm']) if (fs.existsSync(path.join(cfg.dataDir, f))) fs.copyFileSync(path.join(cfg.dataDir, f), path.join(safe, f));
if (fs.existsSync(cfg.docsDir)) fs.cpSync(cfg.docsDir, path.join(safe, 'dokumente'), { recursive: true });
say('  Aktueller Stand gesichert in: ' + safe);

for (const f of ['lsa.sqlite-wal', 'lsa.sqlite-shm']) fs.rmSync(path.join(cfg.dataDir, f), { force: true });
fs.copyFileSync(path.join(src, 'lsa.sqlite'), cfg.dbFile);
if (fs.existsSync(path.join(src, 'dokumente'))) {
  fs.rmSync(cfg.docsDir, { recursive: true, force: true });
  fs.cpSync(path.join(src, 'dokumente'), cfg.docsDir, { recursive: true });
  say('  Dokumente wiederhergestellt.');
} else {
  say('  Hinweis: Diese Sicherung enthält nur die Datenbank – vorhandene Dokumente blieben unverändert.');
}
say('\n  Fertig. Das Programm kann jetzt wieder gestartet werden.\n');
