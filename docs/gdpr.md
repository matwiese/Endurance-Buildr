# Datenschutz (DSGVO) in Buildr Force

Buildr Force verarbeitet **Gesundheitsdaten** (Art. 9 DSGVO: Kraftmessung, Körpergewicht, Geburtsdatum, Leistungsdaten). Dieses Dokument beschreibt,
was die Software technisch dafür bereitstellt. Es ersetzt keine Rechtsberatung – Verantwortlicher ist der Betreiber (Verein, Verband, Institut).

## Was wo gespeichert wird

| Ort                  | Inhalt                                                                      | Hinweis                                                                                     |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Browser (IndexedDB)  | Profile, Tests, Roh-Aufnahmen, Warteschlange                                | Offline-first; bleibt bis zum Upload erhalten. Beim Abmelden werden Zwischenspeicher geleert. |
| Server (PostgreSQL)  | Profile, Tests, Wiederholungen, Kennzahlen, Sessions, Normsets, Protokoll   | Mandantengetrennt (`org_id`) und nach Gruppenrechten gefiltert.                             |
| Server (Dateisystem) | Roh-Aufnahmen (BFB1, komprimiert, CRC-geprüft)                              | `DATA_DIR/blobs`, Schlüssel = Mandant/Aufnahme.                                             |
| Protokoll (Audit)    | Wer hat wann was getan (Anmeldung, Export, Löschung …), **keine Messwerte** | Nur Administratoren; Profil-Auskunft enthält die Einträge zur Person.                       |

Es gibt **keine** Drittanbieter-Dienste, kein Tracking, keine externen Schriftarten oder CDNs im Betrieb. Die Kamera-Synchronisation (optional in der
Aufgabenstellung) ist nicht implementiert – es werden keine Bild-/Videodaten erfasst. Das Profilfeld „Foto/Video erlaubt“ wird gespeichert, aber derzeit nicht verwendet.

## Einwilligung (Art. 9 Abs. 2 lit. a)

- Je Profil: `healthConsentAt` (Zeitpunkt) und `healthConsentVersion` (Fassung des Einwilligungstextes, aktuell `2026-10`, Konstante `CONSENT_VERSION` in
  `packages/shared`).
- **Sperre:** Ohne Einwilligung wird kein Test aufgenommen. Im Einzeltest bleibt „Weiter“ gesperrt, im Gruppentest bleibt der Ablauf ausgeblendet, bis die
  Einwilligung erfasst ist (`ConsentCard`). Die Erfassung speichert Zeitpunkt und Fassung am Profil und wird wie jede Profiländerung synchronisiert.
- Beim Import (CSV) und beim Anlegen per API ist die Einwilligung nicht Pflicht – die Sperre greift erst vor dem Test. So können Profile vorab angelegt werden.
- Ältere Fassungen werden im Athletenprofil markiert („ältere Fassung“); eine erneute Einwilligung ersetzt Zeitpunkt und Fassung.
- Minderjährige: Foto/Video nur mit Zustimmung der Erziehungsberechtigten (Validierung im Formular und Import).
- Widerruf: Löschen des Profils (siehe unten) oder – wenn nur die Einwilligung entfällt – Einwilligung im Profil entfernen (Formular); der Athlet kann dann nicht mehr getestet werden.

## Auskunft und Datenübertragbarkeit (Art. 15, 20)

Hub → Athlet → **Datenschutz (DSGVO)**:

- **Alle Daten exportieren (JSON)**: Profil, Gruppen, alle Tests mit Wiederholungen und Kennzahlen, Verweise auf die Roh-Aufnahmen (`/api/recordings/:id`,
  Format BFB1, SHA-256), Sessions und Protokolleinträge zur Person. Quelle ist der Server (`GET /api/profiles/:id/export`) ergänzt um lokal noch nicht
  hochgeladene Tests. Ohne Server/offline werden die Gerätedaten exportiert (`source: "local"`, mit Hinweis).
- **Kennzahlen (CSV)**: eine Zeile je Wiederholung, Excel-tauglich (UTF-8 mit BOM, `;`).
- Der Export am Server wird protokolliert (`profile.export`) und unterliegt denselben Gruppenrechten wie das Lesen des Profils (auch Betrachter dürfen exportieren).

## Löschung (Art. 17)

Administratoren: Hub → Athlet → „Person und alle Daten endgültig löschen“ (Bestätigungswort) bzw. Mehrfachauswahl in der Athletenliste.

- **Server:** Profil, Tests, Wiederholungen, Kennzahlen, Verknüpfungen und **Roh-Aufnahmen (Dateien)** werden entfernt; ein Tombstone sorgt dafür, dass andere
  Geräte beim nächsten Abgleich ebenfalls löschen. Protokoll: `profile.delete` (nur Anzahl, keine Inhalte).
- **Gerät:** lokale Daten (Profil, Tests, Aufnahmen) werden sofort gelöscht; die Server-Löschung läuft über die Warteschlange und ist idempotent. Offene
  Änderungen am Profil verfallen, die Löschung gewinnt.
- Backups des Betreibers (z. B. `pg_dump`) sind **nicht** automatisch bereinigt – dafür ist der Betreiber zuständig (Aufbewahrungsfrist der Sicherungen festlegen).

## Zugriff, Sicherheit (Art. 32)

- Rollen **Admin / Tester / Betrachter**; zentrale Rechteprüfung (`apps/server/src/auth/permissions.ts`), eingeschränkte Nutzer sehen nur ihre Gruppen.
- Mandantentrennung: jede Abfrage ist an `org_id` gebunden (Tests für fremde IDs → 404).
- Passwörter mit scrypt (N = 2^15), Sitzungs-Token nur als SHA-256-Hash gespeichert, `HttpOnly`/`SameSite=Lax`-Cookie, Origin-Prüfung gegen CSRF,
  Anmelde-Drosselung, Sicherheits-Header (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).
- Transportverschlüsselung ist Sache des Betriebs (Reverse-Proxy mit TLS; `COOKIE_SECURE=true` setzen). Ruhende Daten: Plattenverschlüsselung des Hosts.
- Roh-Aufnahmen sind unveränderlich (Inhalts-Hash); Änderungen an Tests sind nachvollziehbar (Analyseversion, Protokoll).
- Das Protokoll enthält keine Messwerte oder Freitexte.

## Betreiber-Checkliste

1. Einwilligungstext erstellen und `CONSENT_VERSION` bei jeder inhaltlichen Änderung erhöhen.
2. Verzeichnis der Verarbeitungstätigkeiten führen; ggf. Datenschutz-Folgenabschätzung (Gesundheitsdaten, ggf. Minderjährige).
3. TLS, sichere Passwörter (Mindestlänge 10 wird erzwungen), regelmäßige Sicherungen mit definierter Löschfrist.
4. Aufbewahrungsfristen festlegen und alte Tests über „Löschen“ bzw. Personenlöschung entfernen (automatische Fristen sind nicht eingebaut).
5. Auftragsverarbeitung klären, falls ein Dienstleister den Server betreibt.
