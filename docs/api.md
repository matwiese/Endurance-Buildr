# HTTP-API (apps/server)

Alle Pfade unter `/api`, JSON (UTF-8), Authentifizierung per httpOnly-Cookie `bf_session` (SameSite=Lax). Schreibende Anfragen mit
`Origin`-Header müssen vom eigenen Host (oder `ALLOWED_ORIGINS`) stammen. Fehler: `{ "error": "<code>", … }`, Validierungsfehler 400
mit `issues`. Alle Abfragen sind auf die Organisation des Nutzers beschränkt; Gruppen-Scoping siehe unten. Eingabeschemata: `packages/shared/src/api.ts`.

| Methode · Pfad                                                 | Recht                | Zweck                                                                                                                     |
| -------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                                  | öffentlich           | Lebenszeichen, DB-Art                                                                                                     |
| `GET /auth/status`                                             | öffentlich           | `{ setupRequired }` (Wizard nötig, solange kein Nutzer existiert)                                                         |
| `POST /auth/setup`                                             | öffentlich, einmalig | Organisation + Admin anlegen, Standardgruppe „Alle Athleten“                                                              |
| `POST /auth/login` · `POST /auth/logout` · `GET /auth/me`      | –                    | Sitzung; Login gedrosselt (429), kein Hinweis ob die E-Mail existiert                                                     |
| `POST /auth/password`                                          | angemeldet           | Eigenes Passwort ändern (beendet alle anderen Sitzungen)                                                                  |
| `GET/POST /users` · `PATCH /users/:id`                         | admin                | Nutzer, Rolle, Gruppen-Scope, Passwort-Reset; letzter Admin ist geschützt                                                 |
| `GET /reference`                                               | angemeldet           | Kategorien, Gruppen (gescoped), Tag-Typen, Tags                                                                           |
| `PUT/DELETE /reference/categories\|groups/:id`                 | admin                | Idempotentes Anlegen/Ändern (Client-UUID), Löschen mit Tombstones                                                         |
| `PUT /reference/tag-types\|tags/:id`                           | admin, tester        | Tags dürfen Tester anlegen, Löschen nur admin                                                                             |
| `GET /profiles?q&groupId&limit&offset` · `GET /profiles/:id`   | profile.read         | Profile (nur sichtbare Gruppen)                                                                                           |
| `PUT /profiles/:id`                                            | profile.write        | Idempotent, letzter Schreiber gewinnt (`updatedAt`) → `{ profile, applied }`                                              |
| `DELETE /profiles/:id`                                         | admin                | DSGVO-Löschung inkl. Tests, Messwerte, Roh-Aufnahmen (Blobs)                                                              |
| `PUT /recordings/:id[?profileId]`                              | test.write           | BFB1-Blob (`application/octet-stream`); CRC/Struktur geprüft; idempotent (409 bei Abweichung)                             |
| `GET /recordings/:id`                                          | test.read            | Roh-Aufnahme (ETag = SHA-256)                                                                                             |
| `PUT /tests/:id`                                               | test.write           | Idempotenter Upload; gleicher Inhalt → 200, anderer → 409 (Tests sind unveränderlich)                                     |
| `GET /tests?profileId&sessionId&testType&from&to&limit&offset` | test.read            | Tests inkl. Wiederholungen und Metriken                                                                                   |
| `PATCH /tests/:id` · `DELETE /tests/:id`                       | test.write · admin   | Notiz, Tags, Zuordnung, Rep ein-/ausschließen · Löschen                                                                   |
| `GET /sessions?status&limit` · `GET /sessions/:id`             | test.read            | Gruppentests (eingeschränkte Nutzer sehen nur eigene)                                                                     |
| `PUT /sessions/:id` · `DELETE /sessions/:id`                   | test.write           | Idempotent, letzter Schreiber gewinnt (`updatedAt`); Warteschlange/Status/Rangliste-Auswahl. Löschen lässt Tests bestehen |
| `GET /sync/pull?since=<rev>`                                   | profile.read         | Stammdaten-Delta (Profile, Gruppen, Tags, Löschungen), `cursor` für den nächsten Aufruf                                   |
| `GET /norms` · `GET /norms/:id`                                | angemeldet           | Eigene Normsets der Organisation (Liste / mit Zeilen)                                                                     |
| `PUT /norms/:id` · `DELETE /norms/:id`                         | admin                | Normset anlegen/ersetzen (Zeilen komplett), löschen                                                                       |
| `GET /metrics`                                                 | angemeldet           | Metrik-Definitionen (aus der Registry des Kerns)                                                                          |
| `GET /audit?limit&before`                                      | admin                | Audit-Log (wer/was/wann, keine Messwerte)                                                                                 |

## Rollen

`admin` alles · `tester` Profile/Tests schreiben, Tags anlegen · `viewer` nur lesen. Nutzer mit `groupScope = restricted` sehen und
bearbeiten nur Profile, die in einer ihnen zugewiesenen Gruppe (`read`/`write`) liegen; fremde Objekte antworten mit 404.
Bei Profilen in mehreren Gruppen kann ein eingeschränkter Nutzer nur seine Schreibgruppen ändern, die übrigen bleiben erhalten.

## Offline-Abgleich

Der Client erzeugt IDs (UUID) selbst, speichert lokal (IndexedDB) und reiht Uploads in eine Outbox ein: Profile → Aufnahme (`PUT /recordings`)
→ Test (`PUT /tests`). Jede Anfrage ist idempotent, ein Wiederholen nach unklarem Ausgang ist gefahrlos. Fehlerklassen: Netz/5xx/429 →
Backoff (2 s · 2ⁿ, max. 5 min) · 401 → Anmeldung nötig, Warteschlange bleibt · übrige 4xx → endgültig fehlgeschlagen („Erneut versuchen“).
`sync/pull` liefert Änderungen seit einer monotonen Änderungsnummer (`rev`, Datenbank-Sequenz) mit 64er-Sicherheitsfenster gegen
noch nicht committete Transaktionen; bei `since = 0` ersetzt der Client seinen Bestand.

## BFB1 (Roh-Aufnahmen)

`"BFB1" | version u8 | compression u8 | reserved u16 | headerLen u32 | Header-JSON | Payload`. Pro Kanal (links, rechts, optional CoP) Zigzag-Varints
der Differenzen quantisierter Werte (Kraft 1 mN, CoP 0,01 mm); Kompression 0 = keine, 1 = deflate-raw (Browser `CompressionStream`,
Server `node:zlib`). Der Header enthält Abtastrate, Länge, Kanäle, Unterbrechungen (`breaks`) und CRC-32 des rohen Payloads.
Implementierung: `packages/core/src/blob`.
