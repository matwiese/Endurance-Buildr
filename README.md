# Buildr Force

Kraftmessplatten-Testsystem für die Sprungdiagnostik – eigenes Produkt (Teal/Bronze), PWA für Tablet und Laptop, läuft **offline-first**.

Verbinden → Nullen → Wiegen → automatische Erkennung des Testtyps → Sofortergebnisse → Upload. Dazu Athleten-Hub (Profile, Gruppen, Tags, CSV),
Gruppentest mit Live-Rangliste und Beamer-Ansicht, Verlauf/Berichte/Normwerte, Rollen (Admin/Tester/Betrachter), Mandanten, DSGVO-Funktionen.
Ohne Hardware arbeitet alles mit dem eingebauten **Simulator** (physikbasierte Sprünge inkl. Fehlversuchen) oder der Datei-Wiedergabe (nur zum Ausprobieren: spielt eine CSV-Aufnahme wie ein Live-Gerät ab).

|              |                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testtypen    | CMJ, SJ (auch mit Last), Abalakov, Drop Jump, Hop-Serien, CMRJ, einbeinige Varianten, Land & Hold, Isometrics (IMTP, Squat, Schulter), Balance/Stand |
| Kennzahlen   | 83 Registry-Einträge (Höhe, Zeiten, Kraft, RFD, Impuls, Leistung, RSI, Asymmetrie …) – `docs/metrics.md`                                             |
| Genauigkeit  | Sprunghöhe ±0,5 cm, Zeiten ±2 ms gegen physikalische Wahrheit; Referenz-Regression gegen echte Rohdaten – `ASSUMPTIONS.md`                           |
| Live-Anzeige | 60 fps bei 2 × 1000 Hz, Latenz ≈ 33 ms, Analyse im Web Worker – `docs/performance.md`                                                                |
| Sprachen     | Deutsch (Standard), Englisch                                                                                                                         |
| Einheiten    | intern metrisch; Anzeige metrisch/imperial                                                                                                           |

## Schnellstart (Entwicklung, ohne Hardware)

Voraussetzungen: **Node ≥ 22.5**, **pnpm 10** (`corepack enable`).

```bash
pnpm install
pnpm dev            # Server (Port 3000, eingebettete Datenbank in .data/) + Web (Vite, Port 5173) parallel
```

1. `http://localhost:5173` öffnen. Beim ersten Start führt ein **Einrichtungs-Assistent** durch die Anlage von Organisation und Administrator
   (alternativ ohne Server: auf der Anmeldeseite „Ohne Server fortfahren (nur lokal auf diesem Gerät)“ – dann bleiben alle Daten im Browser).
2. **Testen → Verbinden → Simulator → Verbinden.** Der Simulator-Athlet (Körpermasse, Sprungvermögen, Asymmetrie) ist einstellbar; das Tempo (1×–10×) beschleunigt die Abläufe.
3. Weiter: Testtyp (**Auto**) → Athlet oder Gast → **Nullen** (Platten leer) → Wiegen („Athlet tritt auf“ im Simulator) → Aufnahme starten → im Simulator einen Versuch
   „Ausführen“ (CMJ, SJ, DJ, Hop …) → Sofortergebnisse erscheinen nach der Landung → **Speichern** (lokal sofort, Upload automatisch).
4. **Gruppentest:** _Gruppentest → Demo mit 10 simulierten Athleten_ – Warteschlange, Live-Rangliste, Pause/Zwischenstand, CSV-Export, Beamer-Ansicht (`/session/:id/board`, auch auf einem zweiten Bildschirm).
5. **Hub:** Athleten (CSV-Import/-Export), Gruppen, Tags, Tests, Berichte (CSV/PDF), Normwerte (eigene CSV), Verwaltung (Nutzer, Audit-Log).

## Betrieb

### Ein Prozess (Server liefert die App aus)

```bash
pnpm --filter @buildr/web build
WEB_DIST=apps/web/dist NODE_ENV=production COOKIE_SECURE=false \
  BOOTSTRAP_ORG="Mein Verein" BOOTSTRAP_ADMIN_EMAIL=admin@example.org BOOTSTRAP_ADMIN_PASSWORD='mindestens-10-zeichen' \
  pnpm --filter @buildr/server start          # http://localhost:3000
```

- **Datenbank:** ohne `DATABASE_URL` läuft eine eingebettete PostgreSQL-Variante (PGlite) unter `DATA_DIR/pg` – ideal für ein Einzelgerät/Labor-Laptop.
  Für Mehrbenutzerbetrieb: `DATABASE_URL=postgres://user:pass@host:5432/buildr` (getestet mit PostgreSQL 16); Migrationen laufen beim Start automatisch.
- **HTTPS:** Cookies sind in Produktion `Secure`. Hinter einem TLS-Proxy `TRUST_PROXY=true` setzen; nur im reinen LAN ohne TLS `COOKIE_SECURE=false`.
  Web Serial/Bluetooth und die Installation als PWA brauchen HTTPS (oder `localhost`).
- **Konfiguration:** alle Variablen mit Erklärung in [`.env.example`](.env.example). Relative Pfade (`DATA_DIR`, `BLOB_DIR`, `WEB_DIST`) gelten ab dem Verzeichnis, in dem der Befehl eingegeben wurde.
- **Weitere Mandanten/Nutzer** (CLI): `pnpm --filter @buildr/server cli create-org|create-user|reset-password|list-orgs` (Aufruf ohne Argumente zeigt die Hilfe).
- **Sicherung:** Datenbank (`pg_dump` bzw. Ordner `DATA_DIR/pg`) **und** Roh-Aufnahmen (`DATA_DIR/blobs`) sichern. Aufbewahrungsfristen: siehe [`docs/gdpr.md`](docs/gdpr.md).

### Docker (Dockerfile + docker-compose.yml mit PostgreSQL)

```bash
docker compose up -d --build     # http://localhost:3000
```

> Die Docker-Dateien wurden in der Entwicklungsumgebung **nicht gebaut oder ausgeführt** (kein Docker-Daemon verfügbar); sie folgen dem oben getesteten Ein-Prozess-Betrieb.

### Installation als App

Im Browser (Chrome/Edge/Safari) „Zur Startseite hinzufügen“ bzw. „Installieren“. Die App-Hülle und die zuletzt verwendeten Stammdaten stehen danach **ohne Netz** zur
Verfügung; Tests werden lokal gespeichert und beim nächsten Netz automatisch hochgeladen (Statusleiste: „Warteschlange“).

## Echte Messplatten anbinden

Das Plattenprotokoll kommerzieller Hersteller ist proprietär und **nicht** Teil dieses Repos. Anbindung über das Interface `DeviceAdapter`: eigenen `FrameDecoder` schreiben,
einen mitgelieferten Transport (WebSocket / Web Serial / Web Bluetooth) verwenden und in `apps/web/src/devices.ts` registrieren – Schritt für Schritt in
[`docs/hardware-adapters.md`](docs/hardware-adapters.md). Bis dahin: Simulator und Datei-Wiedergabe. **Eine direkte Verbindung zu echten VALD-ForceDecks-Platten ist derzeit nicht möglich** (proprietäres Protokoll, nicht enthalten).

## Qualitätssicherung

```bash
pnpm check                  # Typecheck + Lint + alle Unit-/Integrationstests (core, device, shared, server, web)
pnpm format:check           # Prettier
TEST_DATABASE_URL=postgres://buildr:buildr@localhost:5432/buildr_test pnpm test    # Server-Suite zusätzlich gegen echtes PostgreSQL
pnpm e2e                    # Playwright mit Simulator: Workflow, Live (fps/Latenz), Review, Offline-Sync, Hub, Gruppentest (10 Athleten), Berichte, DSGVO, Barrierefreiheit (axe)
pnpm e2e:prod               # gebauter Build vom Server ausgeliefert: CSP, Service Worker, Offline-Start, Demo-Wiedergabe
```

Playwright braucht Chromium (`pnpm --filter @buildr/e2e exec playwright install chromium`); Screenshots landen in `e2e/.artifacts/`.

## Aufbau

```
packages/core     reine Signalverarbeitung, Metrik-Registry, Auto-Detect, Blob-Format, Simulator-Physik
packages/device   DeviceAdapter, Simulator, Datei-Wiedergabe, Jitterbuffer, Transport-Stubs
packages/shared   DTOs/Schemas, Validierung, Profil-CSV, Rangliste, Normen, Berichte
apps/server       Fastify + Drizzle (PostgreSQL | PGlite), Auth, Rechte, Sync, Blobs, Audit
apps/web          React-PWA (Live, Hub, Gruppentest, Berichte), Worker, IndexedDB, i18n
e2e               Playwright (+ Produktionsbuild-Prüfung)
reference/        echte Rohdaten-Exporte als Wahrheit für die Konventionen (siehe reference/README.md)
docs/             api · architecture · gdpr · hardware-adapters · metrics (generiert) · norms · performance
```

Weiterführend: [`docs/architecture.md`](docs/architecture.md) · [`docs/api.md`](docs/api.md) · [`docs/metrics.md`](docs/metrics.md) · [`ASSUMPTIONS.md`](ASSUMPTIONS.md) ·
[`PLAN.md`](PLAN.md) · [`CLAUDE.md`](CLAUDE.md).

## Grenzen / nicht enthalten

- **Keine Treiber für proprietäre Platten** (siehe oben) und **keine mitgelieferten Normdaten** – Normsets importiert der Betreiber selbst (CSV).
- Nicht umgesetzt (optional in der Aufgabenstellung): Kamera-Synchronisation (MediaRecorder) und Schnellmodus mit mehreren Plattenpaaren.
- PDF-Berichte entstehen über die Druckfunktion des Browsers (Druckvorlage), nicht serverseitig.
- Das Legacy-Material im Repo-Root (`app.js`, `styles.css`, `download`) gehört zu einer früheren, nicht verwandten Seite und wurde nicht angefasst.
- `reference/` enthält echte Export-Dateien mit einer pseudonymen Personen-Kennung; vor einer Veröffentlichung des Repos prüfen, ob sie dort liegen dürfen (die ausgelieferte App enthält nur bereinigte Demo-Aufnahmen).
