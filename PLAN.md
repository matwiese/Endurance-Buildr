# PLAN.md – Meilensteine M0–M9

Status: ☐ offen · ◐ in Arbeit · ☑ fertig. Nach jedem Meilenstein: Tests grün, Commit, Push auf den Entwicklungsbranch.

## M0 – Repo, CI, Typen, Metrik-Registry ☑

- pnpm-Monorepo (`packages/core`, `packages/device`, `apps/server`, `apps/web`, `e2e`), strict TS, ESLint, Prettier, Vitest, GitHub-Actions-CI.
- `CLAUDE.md`, `PLAN.md`, `ASSUMPTIONS.md`, `/reference` (+ README mit den aus den Referenzdaten abgeleiteten Konventionen).
- Core: Typen (`ForceTrace`, `TestType`, …), Konfiguration, Metrik-Registry (Definition, Registrierung, Doku-Generator), VALD-CSV-Parser.
- **Abnahme**: `pnpm check` grün; Registry-/Parser-Tests; CI-Workflow vorhanden.

## M1 – Simulator + Signal-Pipeline ☑

- `core/synth`: physikbasierter Athlet (Kraft-Kontrollpunkte, PCHIP, Wahrheit durch feine Integration), Rauschen/Rocking/Asymmetrie.
- `device`: `DeviceAdapter`, `SimulatorAdapter` (Szenarien, Fehlversuche), `FileReplayAdapter`, Jitterbuffer + Paketverlust, Stubs.
- `core`: Statistik, Zero, Weigh (Stabilität), Ruhephasen, Onset (20 N/5-SD/Yank), Flugphasen, Rohdaten-Blobformat.
- **Abnahme**: Onset-Index == Referenz in allen 4 CSVs; Zero/Weigh/Re-Zero-Tests; Jitterbuffer-Tests.

## M2 – Phasen + Metriken ☑

- Geschwindigkeit/Weg/Phasen (CMJ/SJ/DJ/Hop/CMRJ/Landing), Metriken als Registry-Einträge inkl. Asymmetrie.
- `docs/metrics.md` wird aus der Registry generiert (Test gegen Drift).
- **Abnahme**: Sprunghöhe ±0,5 cm und Zeiten ±2 ms gegen synthetische Wahrheit (Monte-Carlo über Seeds/Massen); Referenz-Regression der v/s/Impuls-Spalten.

## M3 – Auto-Detect + restliche Testtypen ☑

- Segmentierung in Blöcke, Merkmale, deklarative Regeln in `config/classifier-rules.ts`, Konfidenz, „Unklar“.
- Isometrics (Yank/5-SD, Presets), Balance (CoP, Ellipse), Land & Hold, Hop-Auswahl, SL-Varianten.
- **Abnahme**: Alle Simulator-Testtypen werden korrekt erkannt; die 4 Referenzdateien → cmj / sj / sl_jump (L,R).

## M4 – Live-UI ◐

- Vite/React/Tailwind/PWA/Zustand/TanStack Query/i18n; Live-Engine + Web Worker; Canvas-Plot; Workflow-Schrittleiste; Review; lokale Speicherung (IndexedDB).
- **Abnahme**: Voller Workflow mit Simulator im Browser; Sofortergebnisse < 1 s nach Landung+Beruhigung.

## M5 – Server, DB, Auth, Sync ☐

- Fastify + Drizzle (PostgreSQL / PGlite), Mandanten, Rollen, Gruppen-Scoping, Blob-Speicher, Sync-Queue mit Idempotenz, Offline-first.
- **Abnahme**: API-Integrationstests; Offline-Test → Reconnect → Upload.

## M6 – Profile/Gruppen/Tags/CSV ☐

## M7 – Gruppensession + Leaderboard ☐

## M8 – Hub-Reports, Normen, Export ☐

## M9 – Härtung ☐

- DSGVO (Einwilligung, Export, Löschung, Audit), Performance (60 fps, < 100 ms), A11y, Playwright-E2E, README, Hardware-Adapter-Anleitung.
- Optional: Kamera-Sync (MediaRecorder), Schnellmodus mit bis zu 4 Plattenpaaren.

## Definition of Done

Voller Workflow (Verbinden → Nullen → Wiegen → Auto-Detect mehrerer Testtypen → Sofortergebnisse → Upload) und Gruppensession
mit 10 simulierten Athleten inkl. Leaderboard laufen mit dem Simulator ohne Fehler; alle Tests grün; README mit Start- und Adapter-Anleitung.
