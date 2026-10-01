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

## M4 – Live-UI ☑

- Vite/React/Tailwind/PWA/Zustand/TanStack Query/i18n; Live-Engine + Web Worker; Canvas-Plot; Workflow-Schrittleiste; Review; lokale Speicherung (IndexedDB).
- **Abnahme**: Voller Workflow mit Simulator im Browser; Sofortergebnisse < 1 s nach Landung+Beruhigung.
- **Ergebnis**: Playwright (`e2e/tests`): Haupt-Workflow, Live (60 fps bei 2 × 1000 Hz, Latenz ≈ 33 ms, Re-Zero während der Aufnahme, Pause/Fortsetzen),
  Review (Relabel, Bereich markieren, Hop „Beste 5“, Löschen/Rückgängig, Speichern → Outbox). Web-Unit-Tests: Engine, Store, Review-Komponente, i18n-Parität.

## M5 – Server, DB, Auth, Sync ☑

- Fastify + Drizzle (PostgreSQL / PGlite), Mandanten, Rollen, Gruppen-Scoping, Blob-Speicher, Sync-Queue mit Idempotenz, Offline-first.
- **Abnahme**: API-Integrationstests; Offline-Test → Reconnect → Upload.
- **Ergebnis**: 29 Server-Tests (PGlite **und** PostgreSQL 16: `TEST_DATABASE_URL=… pnpm test`), Sync-Engine-Integrationstest (echter Server ↔ IndexedDB:
  offline → Upload, verlorene Antwort, Backoff, 4xx, 401, Pull-Merge), Playwright (Login/Rollen/lokaler Modus, Offline → automatischer Upload). `docs/api.md`.

## M6 – Profile/Gruppen/Tags/CSV ☑

- Hub: Athletenliste (Suche, Gruppenfilter, Sortierung, Seiten, Mehrfachauswahl, Sammelzuweisung, Löschen mit Bestätigungswort), Gruppen & Kategorien, Tag-Typen/Tags, Nutzerverwaltung + Audit-Log.
- CSV-Import mit Spaltenzuordnung, Trockenlauf/Prüfbericht, Duplikaterkennung (Externe ID bzw. Name + Geburtsdatum → Update), Export im Round-Trip-Format (`packages/shared/src/profileCsv.ts`).
- **Abnahme**: Unit-Tests (Parser/Plan/Round-Trip), Komponententests (Liste, Bulk, Rollen, Import), Playwright (Gruppen → Import → Re-Import → Bulk → Export → Löschen, Tags, Nutzer).

## M7 – Gruppensession + Leaderboard ☑

- Session-Assistent (Gruppe/Einzelne, Testtyp, Last, Demo mit 10 simulierten Athleten), Warteschlange (Status, umsortieren, hinzufügen/entfernen, überspringen, erneut testen),
  Zero einmal je Session, Wiegen/Aufnahme/Review/Speichern je Athlet, Pause mit Zwischenstand, Beenden mit CSV-Export.
- Live-Rangliste (Testtyp/Kennzahl/Wertung wählbar), Beamer-/Vollbildansicht (auch zweites Fenster/anderer Rechner); Sessions werden über Outbox → Server synchronisiert.
- **Abnahme (DoD)**: Playwright mit 10 simulierten Athleten inkl. Rangliste, Pause, Export, Beamer-Fenster und Serverabgleich (`e2e/tests/session.spec.ts`).

## M8 – Hub-Reports, Normen, Export ☑

- Athletenprofil mit Verlauf je Kennzahl (Baseline, % Änderung, Norm-Band, z-Score/Perzentil), Testliste/-filter, Testdetail (Rohkurve mit Phasen, Kennzahlen, Nachbearbeiten, Löschen).
- Berichte: Zeitraum/Gruppen/Testtyp/≤ 20 Kennzahlen, Tabelle · Diagramm · Gruppenvergleich, z-Score (Team/Norm), % Änderung, CSV und PDF (Druck).
- Normwerte: eigener CSV-Import mit Strata (Geschlecht/Alter/Sport), Prüfbericht, Server-Speicher + Offline-Cache (`docs/norms.md`).
- **Abnahme**: shared-Unit-Tests (Normen/Berichte/Verlauf), Komponententests, Server-Tests, Playwright (`e2e/tests/reports.spec.ts` inkl. PDF und Rollen).

## M9 – Härtung ☑

- **DSGVO:** Einwilligung (Art. 9) mit Zeitpunkt + Fassung, Sperre vor dem Test; Auskunft/Export je Person (JSON + CSV, protokolliert); Löschung je Person (Server inkl. Roh-Aufnahmen, Gerät, Warteschlange); Audit ohne Messwerte (`docs/gdpr.md`).
- **Sicherheit/PWA:** CSP + Permissions-Policy + Cache-Header, PNG-Icons (192/512/maskable), Service Worker (Offline-Start), Demo-Aufnahmen ohne Kennungen im Bundle, Quellkarten nicht verlinkt.
- **Performance:** Routen werden nachgeladen, Bibliotheks-Chunk, Rechenzeit-Budgets als Tests (`packages/core/test/perf.test.ts`, `apps/web/test/perf.test.ts`), Messwerte in `docs/performance.md`.
- **Barrierefreiheit:** axe (WCAG 2.2 AA) hell/dunkel auf allen Hauptseiten, Gruppentest, Beamer, Dialogen; Landmarken, Überschriften, Sprunglink, Seitentitel, Kontraste, Tastatur-Scrollbereiche, Touch-Ziele ≥ 44 px.
- **Hardware:** Adapter-Registry (`devices.ts`) + Anleitung (`docs/hardware-adapters.md`); Docker-Dateien (ungetestet, kein Daemon).
- **Doku:** README (Start-/Betriebsanleitung), Architektur, Leistung, Datenschutz, Adapter-Guide.
- **Abnahme:** `pnpm check` grün (392 Tests), Server-Suite auch auf PostgreSQL 16 (36 Tests), `pnpm e2e` (23 Tests inkl. a11y/DSGVO), `pnpm e2e:prod` (4 Tests).
- **Nicht umgesetzt (optional):** Kamera-Sync (MediaRecorder), Schnellmodus mit bis zu 4 Plattenpaaren – bewusst weggelassen (keine Hardware zur Prüfung; Datenmodell/Adapter-Interface sind dafür offen).

## Definition of Done

Voller Workflow (Verbinden → Nullen → Wiegen → Auto-Detect mehrerer Testtypen → Sofortergebnisse → Upload) und Gruppensession
mit 10 simulierten Athleten inkl. Leaderboard laufen mit dem Simulator ohne Fehler; alle Tests grün; README mit Start- und Adapter-Anleitung.
