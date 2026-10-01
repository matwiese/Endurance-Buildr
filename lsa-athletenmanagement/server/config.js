// Konfiguration und Datenordner.
// Standard unter Windows: C:\LSA-Athletenmanagement\daten
// Überschreibbar mit config.json im Paketordner oder mit Umgebungsvariablen (LSA_DATA_DIR, LSA_PORT, LSA_BIND).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function defaultDataDir() {
  if (process.platform === 'win32') return 'C:\\LSA-Athletenmanagement\\daten';
  return path.join(ROOT, 'daten');
}

export function loadConfig(overrides = {}) {
  const file = readJson(path.join(ROOT, 'config.json')) || {};
  const env = process.env;
  const cfg = {
    port: Number(env.LSA_PORT || file.port || 8420),
    bind: env.LSA_BIND || file.bindAddress || '127.0.0.1',
    allowedHosts: Array.isArray(file.allowedHosts) ? file.allowedHosts : [],
    dataDir: env.LSA_DATA_DIR || file.dataDir || defaultDataDir(),
    maxUploadMb: Number(file.maxUploadMb || 25),
    sessionIdleMinutes: Number(file.sessionIdleMinutes || 120),
    sessionMaxHours: Number(file.sessionMaxHours || 12),
    maxLoginFailures: Number(file.maxLoginFailures || 5),
    lockMinutes: Number(file.lockMinutes || 10),
    autoBackup: file.autoBackup !== false,
    ...overrides,
  };
  cfg.dataDirFallback = false;
  return cfg;
}

// Legt den Datenordner mit Unterordnern an. Fällt auf <Paket>/daten zurück, wenn der Zielordner nicht beschreibbar ist.
export function prepareDataDir(cfg) {
  const tryDir = (dir) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    for (const sub of ['dokumente', 'backups', 'logs']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
    return dir;
  };
  try {
    cfg.dataDir = tryDir(path.resolve(cfg.dataDir));
  } catch (e) {
    const fallback = path.join(ROOT, 'daten');
    console.warn(`WARNUNG: Datenordner ${cfg.dataDir} nicht beschreibbar (${e.code || e.message}). Weiche aus auf ${fallback}`);
    cfg.dataDir = tryDir(fallback);
    cfg.dataDirFallback = true;
  }
  cfg.dbFile = path.join(cfg.dataDir, 'lsa.sqlite');
  cfg.docsDir = path.join(cfg.dataDir, 'dokumente');
  cfg.backupDir = path.join(cfg.dataDir, 'backups');
  cfg.logDir = path.join(cfg.dataDir, 'logs');
  const readme = path.join(cfg.dataDir, 'LIESMICH.txt');
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, [
      'LSA Athletenmanagement – Datenordner',
      '',
      'lsa.sqlite   Datenbank (alle Athlet:innen-Akten, Benutzer, Rechte, Protokoll)',
      'dokumente\\   Hochgeladene Dateien, je Athlet:in ein Unterordner (Namen sind zufällig, Zuordnung steht in der Datenbank)',
      'backups\\     Sicherungen (Datenbank + Dokumente)',
      'logs\\        Server-Protokoll',
      '',
      'Diesen Ordner NICHT von Hand verändern, solange das Programm läuft.',
      'Zum Sichern genügt es, den ganzen Ordner zu kopieren, wenn das Programm beendet ist.',
      'Die Daten enthalten Gesundheitsdaten Minderjähriger: Laufwerk verschlüsseln (BitLocker) und Zugriff beschränken.',
      '',
    ].join('\r\n'), 'utf8');
  }
  return cfg;
}
