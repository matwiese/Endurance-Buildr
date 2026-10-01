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

  // ---------- 2: Athlet:innen-Akten (Phase 2) – Stammdaten, Betreuungsteam, Akteneinträge/Dokumente, Einwilligungen ----------
  `
  CREATE TABLE athletes (
    id            TEXT PRIMARY KEY,                    -- z. B. LSA-0001, bleibt über alle Systeme gleich
    name          TEXT NOT NULL,
    sex           TEXT NOT NULL DEFAULT '–',
    born          TEXT NOT NULL,
    sport         TEXT NOT NULL,
    discipline    TEXT NOT NULL DEFAULT '',
    group_name    TEXT NOT NULL DEFAULT '',
    club          TEXT NOT NULL DEFAULT '',
    federation    TEXT NOT NULL DEFAULT '',
    kader         TEXT NOT NULL DEFAULT '',
    school        TEXT NOT NULL DEFAULT '',
    school_class  TEXT NOT NULL DEFAULT '',
    edu_goal      TEXT NOT NULL DEFAULT '',
    boarding      INTEGER NOT NULL DEFAULT 0,
    guardian      TEXT NOT NULL DEFAULT '',
    emergency     TEXT NOT NULL DEFAULT '',
    entry_date    TEXT NOT NULL,
    review_date   TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'aktiv',
    exit_checklist TEXT NOT NULL DEFAULT '[]',
    demo          INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    created_by    TEXT NOT NULL DEFAULT '',
    updated_at    TEXT NOT NULL,
    updated_by    TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX athletes_sport ON athletes(sport);

  CREATE TABLE athlete_staff (
    athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    function   TEXT NOT NULL,
    PRIMARY KEY (athlete_id, user_id, function)
  );
  CREATE INDEX staff_user ON athlete_staff(user_id);

  CREATE TABLE entries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id    TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    category      TEXT NOT NULL,
    title         TEXT NOT NULL,
    text          TEXT NOT NULL DEFAULT '',
    file_name     TEXT,
    stored_name   TEXT,
    mime          TEXT,
    size          INTEGER,
    sha256        TEXT,
    visible_to_athlete INTEGER NOT NULL DEFAULT 0,
    created_by_id INTEGER,
    created_by    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
  CREATE INDEX entries_athlete ON entries(athlete_id, category);

  CREATE TABLE consents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id  TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    purpose_key TEXT NOT NULL,
    purpose     TEXT NOT NULL,
    basis       TEXT NOT NULL DEFAULT '',
    voluntary   INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL,
    given_by    TEXT NOT NULL DEFAULT '',
    note        TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL,
    updated_by  TEXT NOT NULL DEFAULT '',
    UNIQUE (athlete_id, purpose_key)
  );
  `,

  // ---------- 3: Performance (Phase 3) – Tages-Check, Training, Messwerte, Plan, Entscheidungen, Termine, Hinweise ----------
  `
  CREATE TABLE readiness (
    athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    date       TEXT NOT NULL,
    sleep_q    INTEGER NOT NULL,
    recovery   INTEGER NOT NULL,
    soreness   INTEGER NOT NULL,
    fatigue    INTEGER NOT NULL,
    stress     INTEGER NOT NULL,
    ready      INTEGER NOT NULL,
    sleep_h    REAL,
    pain       INTEGER NOT NULL DEFAULT 0,
    symptoms   INTEGER NOT NULL DEFAULT 0,
    comment    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (athlete_id, date)
  );

  CREATE TABLE training (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id  TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT 'Training',
    planned_min INTEGER,
    status      TEXT NOT NULL DEFAULT 'geplant',
    duration    INTEGER,
    rpe         REAL,
    reason      TEXT NOT NULL DEFAULT '',
    decided_by  TEXT NOT NULL DEFAULT '',
    created_by  TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    updated_by  TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX training_athlete_date ON training(athlete_id, date);
  CREATE INDEX training_date ON training(date);

  CREATE TABLE measurements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    date       TEXT NOT NULL,
    variable   TEXT NOT NULL,
    value      REAL NOT NULL,
    raw_value  REAL NOT NULL,
    unit       TEXT NOT NULL DEFAULT '',
    source     TEXT NOT NULL DEFAULT '',
    note       TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'ok',          -- ok | markiert | bestätigt | korrigiert
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX measurements_athlete ON measurements(athlete_id, variable, date);

  CREATE TABLE quality_flags (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id  TEXT REFERENCES athletes(id) ON DELETE CASCADE,
    variable    TEXT NOT NULL,
    value       TEXT NOT NULL DEFAULT '',
    rule        TEXT NOT NULL,
    source      TEXT NOT NULL DEFAULT '',
    ts          TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'markiert',  -- markiert | bestätigt | korrigiert
    ref_type    TEXT NOT NULL DEFAULT '',
    ref_id      INTEGER,
    note        TEXT NOT NULL DEFAULT '',
    resolved_by TEXT NOT NULL DEFAULT '',
    resolved_at TEXT
  );

  CREATE TABLE plans (
    athlete_id TEXT PRIMARY KEY REFERENCES athletes(id) ON DELETE CASCADE,
    baseline   TEXT NOT NULL DEFAULT '',
    long_term  TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE goals (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    area       TEXT NOT NULL,
    text       TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE measures (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id  TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    goal_id     INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    resp        TEXT NOT NULL DEFAULT '',
    start_date  TEXT NOT NULL DEFAULT '',
    review_date TEXT NOT NULL DEFAULT '',
    criterion   TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'offen',     -- offen | laufend | beendet
    result      TEXT NOT NULL DEFAULT '',
    next        TEXT NOT NULL DEFAULT '',
    created_by  TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX measures_athlete ON measures(athlete_id);

  CREATE TABLE decisions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id  TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    reason      TEXT NOT NULL,
    info        TEXT NOT NULL DEFAULT '',
    decision    TEXT NOT NULL,
    resp        TEXT NOT NULL DEFAULT '',
    affected    TEXT NOT NULL DEFAULT '',
    measure     TEXT NOT NULL DEFAULT '',
    review_date TEXT NOT NULL DEFAULT '',
    result      TEXT NOT NULL DEFAULT '',
    created_by  TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX decisions_athlete ON decisions(athlete_id, date);

  CREATE TABLE events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT NOT NULL,
    title      TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'Sonstiges',
    sport      TEXT NOT NULL DEFAULT '',            -- leer = alle Sportarten
    note       TEXT NOT NULL DEFAULT '',
    demo       INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX events_date ON events(date);

  CREATE TABLE alerts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id   TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    rule         TEXT NOT NULL,
    trigger_text TEXT NOT NULL,
    cat          TEXT NOT NULL,                    -- perf | health | well | school | conf
    stage        INTEGER NOT NULL DEFAULT 1,
    resp         TEXT NOT NULL DEFAULT '',
    control      TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'offen',    -- offen | in Prüfung | Akutprozess | erledigt
    note         TEXT NOT NULL DEFAULT '',
    confidential INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    created      TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    updated_by   TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX alerts_athlete ON alerts(athlete_id, status);

  CREATE TABLE contact_requests (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    date       TEXT NOT NULL,
    text       TEXT NOT NULL DEFAULT 'Wunsch nach vertraulichem Gespräch',
    status     TEXT NOT NULL DEFAULT 'offen',
    created_at TEXT NOT NULL
  );
  `,

  // ---------- 4: Medizin, Psychologie, Schule (Phase 4) ----------
  `
  CREATE TABLE load_status (
    athlete_id TEXT PRIMARY KEY REFERENCES athletes(id) ON DELETE CASCADE,
    color      TEXT NOT NULL DEFAULT 'gruen',      -- gruen | gelb | orange | rot
    allowed    TEXT NOT NULL DEFAULT '',
    restricted TEXT NOT NULL DEFAULT '',
    next_check TEXT NOT NULL DEFAULT '',
    set_by     TEXT NOT NULL DEFAULT '',
    updated    TEXT NOT NULL DEFAULT '',           -- Datum der letzten Änderung
    updated_at TEXT NOT NULL
  );
  CREATE TABLE status_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    color      TEXT NOT NULL,
    allowed    TEXT NOT NULL DEFAULT '',
    restricted TEXT NOT NULL DEFAULT '',
    next_check TEXT NOT NULL DEFAULT '',
    set_by     TEXT NOT NULL DEFAULT '',
    ts         TEXT NOT NULL
  );

  CREATE TABLE injuries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id  TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    activity    TEXT NOT NULL DEFAULT '',
    setting     TEXT NOT NULL DEFAULT 'Training',
    region      TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'Verletzung',
    type        TEXT NOT NULL,
    first       TEXT NOT NULL DEFAULT 'Erstauftreten',
    onset       TEXT NOT NULL DEFAULT 'akut',
    mechanism   TEXT NOT NULL DEFAULT '',
    diagnosis   TEXT NOT NULL,
    resp        TEXT NOT NULL DEFAULT '',
    treat       TEXT NOT NULL DEFAULT '',
    rtp         INTEGER NOT NULL DEFAULT 1,
    return_date TEXT NOT NULL DEFAULT '',
    full_date   TEXT NOT NULL DEFAULT '',
    closed      INTEGER NOT NULL DEFAULT 0,
    meds        TEXT NOT NULL DEFAULT '',
    labs        TEXT NOT NULL DEFAULT '',
    created_by  TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX injuries_athlete ON injuries(athlete_id, date);

  CREATE TABLE cycle_notes (
    athlete_id TEXT PRIMARY KEY REFERENCES athletes(id) ON DELETE CASCADE,
    note       TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE psych_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    date       TEXT NOT NULL,
    text       TEXT NOT NULL,
    author     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE released_hints (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    date       TEXT NOT NULL,
    text       TEXT NOT NULL,
    author     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE school (
    athlete_id TEXT PRIMARY KEY REFERENCES athletes(id) ON DELETE CASCADE,
    absences   INTEGER NOT NULL DEFAULT 0,
    trend      TEXT NOT NULL DEFAULT '–',
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE exams (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    date       TEXT NOT NULL,
    subject    TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX exams_athlete ON exams(athlete_id, date);
  `,
];
