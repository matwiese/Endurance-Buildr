# LSA Athletenmanagement – lokaler Prototyp

Betriebsbereiter Prototyp des Athletenmanagements: echte Anmeldung, Benutzer- und Rechteverwaltung, SQLite-Datenbank und Dokumentenablage **auf Ihrem Laptop (Laufwerk C:)**. Es läuft nichts in der Cloud, es braucht keine Installation und keine Fremdpakete.

> **Stand:** alle fünf Phasen sind umgesetzt. Jede Phase ist ein eigener, lauffähiger Commit (siehe „Zwischenstände“) – Ihre Daten bleiben beim Wechsel/Update erhalten, die Datenbank wird beim Start automatisch angepasst.

## Starten (Windows)

1. Ordner `lsa-athletenmanagement` nach `C:\LSA-Athletenmanagement\programm` kopieren (oder entpacken).
2. **`START.bat`** doppelklicken.
   * Ist Node.js nicht installiert, bietet das Programm an, eine **portable** Version (ca. 30 MB) von nodejs.org in den Programmordner zu laden – mit Prüfsummenkontrolle, ohne etwas im System zu installieren. Alternativ selbst installieren: <https://nodejs.org> (LTS 22 oder neuer).
3. Der Browser öffnet sich auf **http://localhost:8420**. Das schwarze Fenster offen lassen, solange Sie arbeiten; Schließen beendet das Programm.
4. Beim ersten Start: **Ersteinrichtung** – Sie legen Ihr Administrationskonto fest (kein Standardpasswort).

macOS/Linux: `./start.sh` (benötigt Node.js 22.13+).

## Wo liegen die Daten?

```
C:\LSA-Athletenmanagement\daten\
  lsa.sqlite        Datenbank: Akten, Personen, Rechte, Protokoll
  dokumente\        hochgeladene Dateien (je Athlet:in ein Ordner)
  backups\          Sicherungen (Datenbank + Dokumente)
  logs\server.log   Server-Protokoll
```

* Anderen Ort wählen: `config.example.json` nach `config.json` kopieren und `dataDir` ändern (oder Umgebungsvariable `LSA_DATA_DIR`).
* Ist der Ordner nicht beschreibbar, weicht das Programm auf `daten\` im Programmordner aus und zeigt das deutlich an (System → Datenspeicher).
* **Sichern:** In der Anwendung unter *System → Jetzt Sicherung erstellen*, oder bei beendetem Programm den ganzen Datenordner kopieren. Beim Start wird zusätzlich täglich automatisch die Datenbank gesichert; vor einem Programm-Update (Datenbank-Anpassung) entsteht automatisch eine Kopie `…_vor-update-vN`. Wiederherstellen: `RESTORE.bat`.
* Die Daten enthalten Gesundheitsdaten Minderjähriger – auch im Prototyp: Laufwerk mit **BitLocker** verschlüsseln und den Datenordner nur für Ihr Windows-Konto zugänglich halten.

## Sicherheitsmodell (Kurzfassung)

* Der Server lauscht **nur auf 127.0.0.1** (dieser Rechner), prüft den Host-Header (Schutz gegen DNS-Rebinding) und verlangt bei Änderungen einen eigenen Header + Cookie `SameSite=Strict` (CSRF-Schutz).
* Passwörter: `scrypt`, mindestens 10 Zeichen; nach 5 Fehlversuchen 10 Minuten Sperre; vorläufige Passwörter müssen beim ersten Login geändert werden.
* **Alle Berechtigungen werden im Server erzwungen**, nicht nur in der Oberfläche. Eine Rolle ist eine Vorlage aus der Konzept-Matrix; pro Person lassen sich Einzelrechte und der Athletenbereich anpassen. Alles Relevante steht im Zugriffsprotokoll.
* Content-Security-Policy ohne Inline-Skripte; keine externen Ressourcen (Schriften liegen lokal).

## Die fünf Phasen

| Phase | Inhalt | Stand |
|---|---|---|
| **1 – Fundament** | Datenspeicher auf C:, Anmeldung, **Personen anlegen**, Rollen + **Einzelrechte**, Athletenbereich, Zugriffsprotokoll, Backup, Testansicht „als Person X“ | **fertig** |
| **2 – Athlet:innen-Akten** | **Akten anlegen**, Stammdaten, Lebenszyklus/Austritt, Betreuungsteam, **Dokumente & Notizen je Bereich**, Einwilligungen, Athletenzugang, Löschung | **fertig** |
| **3 – Performance** | Tages-Check, Trainingserfassung (planen/erfassen), Messwerte mit Validierung, Entwicklungsplan + Wirkungskontrolle, Entscheidungsprotokoll, Termine, **Hinweise & Eskalation**, Rollen-Cockpits | **fertig** |
| **4 – Medizin, Psychologie, Schule** | Belastungsstatus (Ampel), Verletzungsregister mit Return-to-Performance, Athletinnengesundheit, geschützter Beratungsbereich mit Freigabe-Hinweisen, Gesprächswünsche, Schule/Prüfungen mit Konfliktprüfung, Wochenbesprechung | **fertig** |
| **5 – Governance** | Datenqualität (Markieren/Korrigieren), Kennzahlen (aggregiert, k ≥ 5), Datenschutz & Audit (DSFA-Stand, Rechteprüfung, Fristen, Anfragen), Safeguarding, Auskunfts-Export, **Demodaten**, Wiederherstellung (`RESTORE.bat`) | **fertig** |

Was Sie je Phase testen können: [docs/TESTPLAN.md](docs/TESTPLAN.md) · Kurzanleitung: [docs/ANLEITUNG.md](docs/ANLEITUNG.md).

### Zwischenstände (jeweils ein Commit auf dem Branch `claude/jolly-bell-ruba0c`)

| Phase | Commit |
|---|---|
| 1 Fundament, Benutzer & Rechte | `5202d17` |
| 2 Athlet:innen-Akten | `cbb76ce` |
| 3 Performance | `d802b55` |
| 4 Medizin, Psychologie, Schule | `24a6250` |
| 5 Governance, Demodaten (= aktueller Stand) | Spitze des Branches |

Einen Zwischenstand ausprobieren: `git checkout <Commit>` (oder auf GitHub beim Commit „Browse files → Code → Download ZIP“). Danach wieder `git checkout claude/jolly-bell-ruba0c`. Die Datenbank wird nur nach **oben** migriert – zum Zurückgehen auf eine frühere Phase bitte einen eigenen Datenordner verwenden (`LSA_DATA_DIR`).

## Technik

Node.js ≥ 22.13 mit eingebautem SQLite (`node:sqlite`) – **keine** `npm install`-Abhängigkeiten. Backend: `server/` (eigener kleiner HTTP-Server, REST-JSON). Oberfläche: `public/` (Vanilla-JS, kein Build-Schritt, Design aus dem Prototyp). Tests: `npm test` (Node-Testrunner, Server wird mit temporärem Datenordner gestartet).

```
server/    index.js (Start) · app.js · http.js · auth.js · permissions.js · db.js · migrations.js · routes/
public/    index.html · css/ · js/ (app.js, ui.js, api.js, state.js, views/)
test/      API-Tests
tools/     install-node.ps1 (portables Node für Windows)
```

Hinweis: Dies ist ein Prototyp zum Durchspielen der Abläufe, kein freigegebenes System. Für den Echtbetrieb sind u. a. Rechtsgrundlagen (Art. 6/9 DSGVO), Datenschutz-Folgenabschätzung, Löschkonzept und ein Betriebs-/Härtungskonzept nötig.
