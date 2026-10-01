// Datenbank-Schema. Jede Phase hängt eine Migration an; vorhandene Daten bleiben beim Update erhalten.
// Die Versionsnummer steht in der Datenbank (PRAGMA user_version).

export const MIGRATIONS = [
  // ---------- 1: Fundament (Phase 1) – Einstellungen, Benutzer, Sitzungen, Protokoll ----------
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name   TEXT NOT NULL,
    email          TEXT NOT NULL DEFAULT '',
    phone          TEXT NOT NULL DEFAULT '',
    function_title TEXT NOT NULL DEFAULT '',
    role           TEXT NOT NULL,
    pw_hash        TEXT NOT NULL,
    must_change_pw INTEGER NOT NULL DEFAULT 1,
    active         INTEGER NOT NULL DEFAULT 1,
    athlete_id     TEXT,                              -- nur Rolle "athlet": verknüpfte Akte
    scope_all      INTEGER NOT NULL DEFAULT 0,        -- Zugriff auf alle Athlet:innen
    scope_sports   TEXT NOT NULL DEFAULT '[]',        -- Zugriff auf diese Sportarten (JSON-Liste)
    overrides      TEXT NOT NULL DEFAULT '{}',        -- Einzelrechte: {"tabs":{...},"features":{...}}
    notes          TEXT NOT NULL DEFAULT '',
    demo           INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    created_by     TEXT NOT NULL DEFAULT '',
    updated_at     TEXT NOT NULL,
    last_login_at  TEXT,
    failed_logins  INTEGER NOT NULL DEFAULT 0,
    locked_until   TEXT,
    pw_changed_at  TEXT
  );

  CREATE TABLE sessions (
    id             TEXT PRIMARY KEY,                  -- SHA-256 des Cookie-Tokens
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    acting_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- Testansicht: Admin, der als user_id agiert
    created_at     TEXT NOT NULL,
    last_seen      TEXT NOT NULL,
    expires_at     TEXT NOT NULL
  );

  CREATE TABLE audit (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ts             TEXT NOT NULL,
    user_id        INTEGER,
    user_name      TEXT NOT NULL DEFAULT '',
    role           TEXT NOT NULL DEFAULT '',
    real_user_name TEXT NOT NULL DEFAULT '',          -- gesetzt, wenn in der Testansicht gehandelt wurde
    athlete_id     TEXT,
    area           TEXT NOT NULL DEFAULT '',
    action         TEXT NOT NULL,
    result         TEXT NOT NULL DEFAULT 'erlaubt',
    detail         TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX audit_ts ON audit(ts);
  CREATE INDEX audit_athlete ON audit(athlete_id, ts);
  `,
];
