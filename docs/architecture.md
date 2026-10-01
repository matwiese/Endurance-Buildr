# Architektur

Buildr Force ist ein pnpm-Monorepo (ESM, strict TypeScript). Die Abhängigkeitsrichtung ist strikt: `core` ← `device` ← `web`, `core` ← `shared` ← `server`/`web`.
`core` importiert nichts anderes und enthält weder DOM noch Zeit/Zufall (deterministisch, überall testbar).

```
┌──────────────────────────── Browser (PWA, offline-first) ─────────────────────────────┐
│  React UI ── Zustand-Stores ── TanStack Query (Hub)        IndexedDB (Repo, Outbox)  │
│     │                                │                            ▲                   │
│     │ Canvas-Plot (60 fps)           │ SyncEngine (Push/Pull, Backoff, Idempotenz)    │
│     ▼                                ▼                            │                   │
│  LiveEngine ◀── DeviceAdapter (Simulator | CSV | WebSocket | Serial | BLE | eigener)   │
│     │  Jitterbuffer → Ringpuffer (Anzeige)                                            │
│     └──────────▶ Web Worker: LiveAnalyzer (@buildr/core)                              │
└───────────────────────────────────────────────┬───────────────────────────────────────┘
                                                │ HTTPS/JSON + BFB1-Blobs (Cookie-Sitzung)
┌───────────────────────────────────────────────▼───────────────────────────────────────┐
│ Fastify-Server: Auth/Rollen/Mandanten · Sync-API · Sessions · Normen · Export · Audit  │
│ Drizzle ORM ── PostgreSQL (DATABASE_URL) | PGlite (lokal, DATA_DIR/pg)                │
│ Blob-Speicher (BFB1, Dateisystem) · statische Auslieferung der PWA (WEB_DIST)         │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

## Pakete

| Paket             | Inhalt                                                                                                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`   | Signalverarbeitung: Nullen, Wiegen, Ruhe, Onset, Flug, Kinematik, Phasen, Metrik-Registry (`docs/metrics.md` wird daraus generiert), Auto-Detect (Segmentierung/Merkmale/Regeln), Iso/Balance, `LiveAnalyzer`, Blob-Format BFB1, CSV, Simulator-Physik (`synth`) |
| `packages/device` | `DeviceAdapter`, `SimulatorAdapter`, `FileReplayAdapter`, `JitterBuffer`, Transporte (WebSocket/Web Serial/Web Bluetooth) mit `FrameDecoder`-Einsteckstelle – siehe `docs/hardware-adapters.md`                                                                  |
| `packages/shared` | DTOs, zod-Schemas der API, Validierung, Profil-CSV (Import/Export), Rangliste, Normen, Berichte/Verlauf – reine Funktionen, von Server **und** Web genutzt                                                                                                       |
| `apps/server`     | Fastify 5, Drizzle (PostgreSQL/PGlite), Auth, Rechte (`auth/permissions.ts`), Routen je Ressource, Blob-Speicher, Audit, CLI                                                                                                                                     |
| `apps/web`        | React 19 + Vite + Tailwind 4, PWA (Workbox), i18n de/en, Live-Engine + Worker, Hub, Gruppentest, Berichte                                                                                                                                                        |
| `e2e`             | Playwright: Haupt-Workflow, Live, Review, Sync, Hub, Gruppentest, Berichte, DSGVO, Barrierefreiheit (axe), Produktionsbuild                                                                                                                                      |

## Live-Pipeline (Browser)

1. `DeviceAdapter` liefert `Sample[]` (Rohkraft N, `t` µs) in Batches von ≈ 10 ms.
2. `JitterBuffer` → gleichmäßiger Takt (`UniformChunk`), Lücken interpoliert/markiert, Verluste gezählt.
3. `LiveEngine` schreibt **genullte** Daten in den `RingBuffer` (Anzeige, 2 Minuten) und schickt dieselben Chunks an den **Web Worker** (`LiveAnalyzer`).
4. Der Worker führt Nullen → Wiegen (Stabilität) → Aufnahme → Auto-Detect → Sofortauswertung aus und meldet Ereignisse (Marker, Reps, Warnungen).
5. Das Canvas zeichnet je Bild Min/Max-Spalten (`decimateMinMax`) – keine Daten gehen verloren, Kosten ≈ 0,6 ms je Bild (`docs/performance.md`).

Aufnahme und Test sind getrennt: **eine Aufnahme** (ein BFB1-Blob) kann **mehrere Tests** (je erkannter Typ) enthalten; `Rep.startIdx/endIdx` indizieren in das Blob.
Eine Neutestung erzeugt immer neue Objekte.

## Speicherung und Abgleich (offline-first)

- **IndexedDB** (`offline/db.ts`): Profile, Kategorien, Gruppen, Tag-Typen/Tags, Tests, Aufnahmen, Sessions, Outbox, `kv`. Änderungen bumpen `repoEvents` (Zähler + BroadcastChannel),
  Hooks (`useRepoVersion`) laden neu.
- **Outbox** (`kind`: tagType, tag, profile, session, test, delete-profile): Reihenfolge nach Rang (Stammdaten → Profile → Sessions → Tests → Löschungen).
  Fehlerklassen: Netz/5xx/429 → Backoff 2 s·2ⁿ (≤ 5 min); 401 → Anmeldung nötig; sonstige 4xx → „fehlgeschlagen“ (manuell wiederholen). Alle Schreibzugriffe sind idempotent (Client-UUIDs).
- **Pull** (`/api/sync/pull?since=`): Sequenz-Cursor mit 64er Überlappung, Tombstones für Löschungen; offene lokale Änderungen haben Vorrang bis zum Upload.
- **Lokaler Modus** (ohne Server): dieselben Stores, keine Outbox.
- **Konflikte:** Profile/Sessions = letzter Schreiber (Client-`updatedAt`); Tests unveränderlich (gleicher Inhalt idempotent, abweichend → 409; Nachbearbeitung online per `PATCH`).
- **Blob BFB1:** Header-JSON + Zigzag-Varint-Deltas (Kraft 1 mN, CoP 0,01 mm) + CRC-32, `deflate-raw` (Browser `CompressionStream`, Server `node:zlib`).

## Server

- **Mandanten:** `organizations`; jede Abfrage ist an `org_id` gebunden. Rollen `admin`/`tester`/`viewer`, zusätzlich Gruppen-Scoping (`groupScope = restricted` + `user_group_access`).
- **Auth:** scrypt, opake Session-Token (SHA-256-Hash gespeichert), Cookie `HttpOnly`/`SameSite=Lax`/`Secure` (Produktion), Origin-Prüfung, Login-Drosselung, Wizard/Bootstrap für die Erstinstallation.
- **DB:** Drizzle-Schema `apps/server/src/db/schema.ts`, Migrationen `apps/server/drizzle` (`pnpm --filter @buildr/server db:generate`). PGlite ist PostgreSQL – derselbe Dialekt lokal und in Produktion.
- **Header:** CSP (`script-src 'self'`), Permissions-Policy, `nosniff`, `X-Frame-Options`, Cache-Regeln (gehashte Assets immutable, HTML/Service Worker `no-cache`; API `no-store`).
- **API:** `docs/api.md`; Datenschutz: `docs/gdpr.md`; Normen: `docs/norms.md`.

## Tests

| Ebene                     | Werkzeug                 | Umfang                                                                                                                                  |
| ------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (core/device/shared) | Vitest                   | Referenz-Regression gegen `/reference`, Genauigkeit (Monte-Carlo), Auto-Detect, Blob, Jitterbuffer, Berichte/Normen, Rechenzeit-Budgets |
| Server                    | Vitest + Fastify inject  | PGlite (Standard) **und** echtes PostgreSQL (`TEST_DATABASE_URL`): Auth, Rechte, Mandanten, Sync, Sessions, Export, Header              |
| Web                       | Vitest + Testing Library | Engine, Workflow, Review, Hub, Gruppentest, Sync-Integration (echter Server ↔ IndexedDB), DSGVO, Adapter-Registry, i18n                 |
| E2E                       | Playwright (Chromium)    | `pnpm e2e` (Dev-Server) und `pnpm e2e:prod` (gebauter Build, CSP, Service Worker, Offline-Start)                                        |
| Barrierefreiheit          | axe-core in Playwright   | WCAG 2.2 AA, hell/dunkel, alle Hauptseiten + Dialoge; Touch-Ziele ≥ 44 px                                                               |
