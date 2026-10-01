// Dünner Wrapper um node:sqlite (in Node eingebaut, keine Fremdpakete nötig).
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations.js';

const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

export class Db {
  constructor(file) {
    this.file = file;
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;');
    this.cache = new Map();
    this.depth = 0;
  }
  stmt(sql) {
    let s = this.cache.get(sql);
    if (!s) { s = this.raw.prepare(sql); this.cache.set(sql, s); }
    return s;
  }
  get(sql, ...p) { return this.stmt(sql).get(...p.map(norm)); }
  all(sql, ...p) { return this.stmt(sql).all(...p.map(norm)); }
  run(sql, ...p) { return this.stmt(sql).run(...p.map(norm)); }
  exec(sql) { this.raw.exec(sql); }
  // Transaktion mit Savepoints, damit Verschachtelung funktioniert.
  tx(fn) {
    const outer = this.depth === 0;
    const sp = `sp${this.depth}`;
    this.exec(outer ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
    this.depth++;
    try {
      const r = fn();
      this.depth--;
      this.exec(outer ? 'COMMIT' : `RELEASE ${sp}`);
      return r;
    } catch (e) {
      this.depth--;
      try { this.exec(outer ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`); } catch { /* ignorieren */ }
      throw e;
    }
  }
  get version() { return this.raw.prepare('PRAGMA user_version').get().user_version; }
  migrate() {
    let v = this.version;
    for (let i = v; i < MIGRATIONS.length; i++) {
      this.tx(() => {
        const m = MIGRATIONS[i];
        if (typeof m === 'string') this.exec(m); else m(this);
        this.exec(`PRAGMA user_version = ${i + 1}`);
      });
    }
    return this.version;
  }
  backupTo(file) { this.raw.prepare('VACUUM INTO ?').run(file); }
  close() {
    try { this.raw.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* ignorieren */ }
    this.raw.close();
  }
}

export function getSetting(db, key, fallback = null) {
  const r = db.get('SELECT value FROM settings WHERE key = ?', key);
  if (!r) return fallback;
  try { return JSON.parse(r.value); } catch { return fallback; }
}
export function setSetting(db, key, value) {
  db.run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}
