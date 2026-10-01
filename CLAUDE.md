# CLAUDE.md – Buildr Force (Kraftmessplatten-Testsystem)

Eigenes Produkt (Marke „Buildr Force“, Teal/Bronze). **Keine** VALD-Logos/-Texte/-Normdaten. Sprache der UI: Deutsch (Standard), Englisch.

## Architektur (pnpm-Monorepo, ESM, strict TypeScript)

```
packages/core     Reine, deterministische Signalverarbeitung. KEINE UI-/Framework-/DOM-Abhängigkeit.
                  types · config · stats · zero · weigh · quiet · onset · flight · kinematics · phases · metrics/ (Registry)
                  detect/ (Segmentierung, Merkmale, Regeln) · iso · balance · analyze · live (LiveAnalyzer) · blob · csv · norms · synth
packages/device   DeviceAdapter-Interface, SimulatorAdapter, FileReplayAdapter, JitterBuffer, WebSerial/WebSocket/WebBluetooth-Stubs
packages/shared   DTOs/zod-Schemas, Validierung, Profil-CSV, Rangliste, Normen, Berichte (reine Funktionen, Server + Web)
apps/server       Fastify + Drizzle (PostgreSQL | PGlite lokal), Auth/Rollen/Mandanten, Sync-API, Blobs, Audit, Export
apps/web          React + Vite + Tailwind + Zustand + TanStack Query, PWA, i18n de/en, Worker (LiveAnalyzer), Canvas-Plot
e2e               Playwright: Workflow, Live, Review, Sync, Hub, Gruppentest, Berichte, DSGVO, a11y (axe); tests-prod/ = gebauter Build
reference/        VALD-Rohdaten (Wahrheit bei Abweichungen) – siehe reference/README.md
docs/             metrics.md (generiert!), api.md, norms.md, hardware-adapters.md, architecture.md, gdpr.md, performance.md
```

Abhängigkeitsrichtung: `core` ← `device` ← `web`; `core` ← `server`. `core` importiert nichts anderes.

## Befehle

```bash
pnpm install
pnpm test                 # alle Vitest-Suiten (core, device, server, web)
pnpm typecheck && pnpm lint
pnpm check                # typecheck + lint + test
pnpm docs:metrics         # docs/metrics.md aus der Metrik-Registry neu erzeugen (Test prüft Aktualität)
pnpm dev                  # Server (PGlite in .data/, Port 3000) + Web (Vite, Proxy /api) parallel; Erstanmeldung über den Wizard
TEST_DATABASE_URL=postgres://… pnpm test   # Server-Suite gegen echtes PostgreSQL statt PGlite
pnpm --filter @buildr/server cli …         # create-org / create-user / reset-password / list-orgs
pnpm --filter @buildr/server db:generate   # Drizzle-Migration nach Schemaänderung (apps/server/drizzle)
pnpm e2e                  # Playwright (startet Server+Web selbst; frische PGlite je Lauf)
pnpm e2e:prod             # Playwright gegen den gebauten Build, vom Server ausgeliefert (CSP, Service Worker, Offline-Start)
node scripts/make-icons.mjs  # PWA-PNG-Icons aus den SVGs neu erzeugen
```

## Konventionen

- Einheiten **intern immer metrisch** (s, m, kg, N, W, m/s); Umrechnung nur in der Anzeige (`core/units`). Zeit in der Pipeline als Sample-Index + `hz`;
  Ereignisse als **gebrochene Sample-Indizes** (Sub-Sample-Interpolation an Schwellen).
- Kraftkanäle sind `Float32Array` (Speicher/Blob), Rechnen in `Float64Array`.
- Kein `Math.random()`/`Date.now()` in `core` – Zufall nur über seedbaren PRNG (`synth/prng`), Zeit wird übergeben.
- Jede Metrik = Registry-Eintrag (`key`, Label de/en, Einheit, Phase, Beschreibung, Formel, Familie, `compute`). UI/Reports/Exporte lesen nur die Registry.
- Schwellen/Regeln stehen in `core/src/config/*` (nie verstreut im Code). `mergeConfig(partial)` für Overrides.
- Asymmetrie: `+` = rechts höher, `−` = links höher (siehe ASSUMPTIONS.md).
- Eine Neutestung erzeugt IMMER ein neues Test-Objekt – nie überschreiben.
- Alle Server-Abfragen sind per `organizationId` gescoped; Rechteprüfung zentral in `server/src/auth/permissions.ts`.
- Tests: Vitest, Dateien `*.test.ts` neben/unter `test/`. Neue Metrik ⇒ Einheitentest + Doku-Neuerzeugung.
- Neue Texte: Schlüssel in `i18n/de.ts` (Quelle) **und** `en.ts`; Tests erzwingen Parität und Verwendung. Seiten brauchen eine h1 (App ergänzt eine unsichtbare), Tabellen in `ScrollArea`,
  Schaltflächen ≥ 44 px auf Touch (`pointer: coarse`). Der axe-E2E (`a11y.spec.ts`) muss in hell und dunkel ohne Befunde laufen.
- Eigene Plattentreiber: `apps/web/src/devices.ts` + `live/adapters.ts` (siehe `docs/hardware-adapters.md`) – nie ein Herstellerprotokoll „raten“.
- Demo-Aufnahmen aus `reference/` werden beim Bauen (Vite-Plugin `buildr-demo-recordings`) auf Zeit/L/R reduziert – keine Kennungen im Bundle.
- Commits: ein Commit pro Meilenstein (plus Zwischen-Commits), Nachricht im Imperativ, Deutsch oder Englisch konsistent (hier: Englisch).

## Referenz-Konventionen (aus /reference verifiziert)

`BW = Weight·g` (Session-Masse) · `a = (F−BW)/m` · Trapez-Integration ab Onset-Sample (v=0) · Onset = Sample vor erster anhaltender
`|F−BW|>20 N`-Abweichung nach einer Ruhephase · `Power = |F·v|` · Impuls netto. Details: `reference/README.md`, `ASSUMPTIONS.md`.
