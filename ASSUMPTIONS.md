# ASSUMPTIONS.md

Begründete Annahmen, wo die Spezifikation offen ist oder die Referenzdaten abweichen. Jede Annahme ist über die
Konfiguration (`packages/core/src/config`) bzw. Einstellungen änderbar, wo sinnvoll.

## Referenzdaten (/reference) haben Vorrang

| #   | Spezifikation                                   | Referenz zeigt                                                                   | Entscheidung                                                                                                   |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| R1  | Onset: erster Verlauf > 20 N von BW             | Sample **vor** der ersten _anhaltenden_ 20-N-Abweichung; Suche erst nach Ruhe    | Genau so implementiert (`onset.ts`); anhaltend = ≥ 4 ms. Index-Regressionstest gegen alle 4 Dateien.           |
| R2  | Körpermasse = mittlere Gesamtkraft / g (Wiegen) | Session-„Weight“ treibt die Integration; lokaler Ruhemittelwert weicht ±0,2 % ab | Session-Masse ist Referenz (`bwSource: 'session'`). Ohne Wiegen: Masse aus der Ruhephase vor der 1. Bewegung.  |
| R3  | 1-s-Ruhefenster                                 | Crops enthalten nur 0,9–1,4 s Vorlauf, teils mit Einschwingen                    | Fallback-Fenster 1000 → 500 → 300 ms mit Warnung `short_quiet`.                                                |
| R4  | Power                                           | `Power = \|F·v\|` (unsigned)                                                     | Metriken nutzen konzentrische Phase (v>0, F>0): identisch. Rohreihe (`power`) vorzeichenlos wie die Referenz.  |
| R5  | Ende nach Landung + Beruhigung                  | Kein Ausschwingen in Ruhe; Abtreten mit Flackern                                 | Blockende = Ruhe ≥ 500 ms ∣ Leerlauf (> 1,2 s unbelastet) ∣ Datenende; Flüge < 80 ms / ohne Landung ignoriert. |
| R6  | Höhe-Spalte                                     | `Height` = COM-Verschiebung, nicht Sprunghöhe                                    | Nur für Gegenbewegungstiefe/Plot genutzt. Sprunghöhe = v_takeoff²/2g.                                          |

Die Dateien selbst enthalten die `AthleteId`-UUID der Ursprungs-App; Dateinamen wurden pseudonymisiert. **Bitte vor einem
Push in ein öffentliches Repository prüfen**, ob die Daten dort liegen dürfen.

## Altbestand im Repo

`app.js`, `styles.css`, `download` (macOS-`.DS_Store`) im Repo-Root gehören zu einer älteren, nicht verwandten statischen Seite
(„Endurance Map Tool“). Sie bleiben **unverändet** liegen und werden von Lint/Format/Tests ausgeschlossen. Die Markenfarben
(Teal/Bronze) der Seite wurden als Designanker für die neue App übernommen; das Logo wurde nicht übernommen.

## Architektur / Stack

- **Lokale DB**: Statt SQLite wird für „lokal ohne Installation“ **PGlite** (eingebettetes PostgreSQL/WASM) verwendet, weil
  Drizzle-Schema, Migrationen und SQL dadurch ein einziger PostgreSQL-Dialekt bleiben (kein doppeltes Schema, keine
  Dialektabweichungen). Produktion: PostgreSQL via `DATABASE_URL`. Tests laufen gegen PGlite (in-memory) und optional gegen echtes PG.
- **i18n**: kleines, typisiertes Wörterbuch-System (de/en, Standard de) statt i18next; ein Test erzwingt Schlüssel-Parität.
- **Plot**: eigener Canvas-2D-Renderer (Min/Max-Dezimierung pro Pixelspalte) statt uPlot, um Phasenflächen, Marker und
  Ringpuffer-Streaming ohne Library-Hacks zu zeichnen.
- **Blob-Format** `BFB1`: Header + quantisierte (1 mN) Delta-/Zigzag-Varint-Kanäle + Kompression `deflate` (browsernativ per
  `CompressionStream`) oder `zstd` (Server, `node:zlib`, Web dekodiert mit `fzstd`). Quantisierung 1 mN liegt > 1000× unter dem Sensorrauschen.
- **Aufnahme vs. Test**: Eine Aufnahme (ein Blob) kann mehrere Tests (je ein erkannter Typ) erzeugen; die Tests teilen sich
  das Blob, `Rep.startIdx/endIdx` indizieren hinein. Eine Neutestung erzeugt immer neue Tests/Blobs.
- **Zero-Offsets** werden bei der Aufnahme angewendet; gespeichert werden genullte Kräfte + Offsets in den Metadaten.

## Biomechanik / Definitionen

- g = 9,80665 m/s². Sprunghöhe (Standard) = Impuls-Momentum `v_to²/2g`, `v_to` an der 20-N-Takeoff-Kante interpoliert.
- Flugzeit-Sprunghöhe = `g·t²/8`; „Imp-Dis“ = `s_to + v_to²/2g` (s_to = COM-Verschiebung bei Takeoff relativ zum Stand).
- Gegenbewegungstiefe, exzentrische Spitzengeschwindigkeit: **negative** Werte (Richtung nach unten), Betrag in der UI.
- Phasen: Entlastung (Onset → v_min) · Exzentrische Bremsung (v_min → v=0) · Konzentrisch (v=0 → Takeoff) · Flug · Landung
  (Landing → +500 ms). Braking-Phase für RFD: min. Kraft → v=0.
- Takeoff Peak Force = Spitzenkraft der konzentrischen Phase (Alias von Concentric Peak Force, separat registriert für Asymmetrie).
- **Asymmetrie** (`asym_*`, Einheit %): `(größere − kleinere Seite) / größere Seite · 100`, **vorzeichenbehaftet**: `+` = rechts höher,
  `−` = links höher. UI zeigt „R 5,2 %“ / „L 5,2 %“ mit Tooltip der Formel. Impuls-Asymmetrie: Netto-Impuls je Platte mit
  plattenspezifischem BW-Anteil aus der Ruhephase.
- Relative Größen beziehen sich auf die **Körpermasse** (ohne externe Last); Kinematik auf die **Systemmasse** (Körper + Last).
- DJ: Imp-Mom nicht unabhängig bestimmbar (Anfangsgeschwindigkeit unbekannt) → Sprunghöhe = Flugzeit; Fallhöhe wird aus
  `v_land = Δv_Kontakt − v_to` geschätzt. Active Stiffness = F_max,Kontakt / max. COM-Absenkung (N/m).
- Hop: jeder Kontakt+Flug ist eine Rep; bei > 5 Hops werden standardmäßig die besten 5 nach RSI eingeschlossen (Einstellung `hopBestN`).
- „Single Leg Hop and Return“ = 2 Flüge einbeinig, kurzer erster Kontakt (kein tiefes Gegenbewegen); mit tiefem erstem Kontakt = SL CMRJ.
- Auto-Detect erkennt **nicht**: Abalakov (Armeinsatz nicht messbar), Isometrics (+ Presets), Balance. Diese werden manuell gesetzt.
- Isometrics: Onset per Yank (40 N/s bei Peak < 250 N, 350 N/s sonst, geglättet über 50 ms) oder 5-SD; umschaltbar. Presets
  (IMTP, Isometric Squat, Shoulder ISO-I/Y/T) steuern nur Kacheln/Fenster/Hinweise, nicht die Mathematik.
- Balance: CoP aus 4 Eckensensoren je Platte (Geometrie konfigurierbar), 95-%-Ellipse `5,991·π·√(λ₁λ₂)`; ohne Ecksensoren nur ML-Schätzung aus L/R.
- Einbeinigkeit: > 90 % der Kontaktlast auf einer Platte.

## Produkt / Compliance

- Hardware-Protokoll von VALD ist proprietär: nichts erfunden; Adapter sind austauschbar, Transporte (WebSerial/WebSocket/WebBluetooth)
  sind generische Stubs mit injizierbarem `FrameDecoder`.
- Normdaten: keine mitgeliefert; nur Import eigener Normsets (CSV) mit Alters-/Geschlechts-/Sport-Strata.
- Rollen: `admin` (alles), `tester` (Tests aufnehmen, Profile bearbeiten), `viewer` (lesen). Gruppen-Scoping: Nutzer mit
  `groupScope = restricted` sehen/bearbeiten nur Profile, die in einer ihnen zugewiesenen Gruppe (read/write) liegen.
- Auth: E-Mail/Passwort (scrypt), opake Session-Tokens in httpOnly-Cookie (SameSite=Lax); Mandant = Organisation, jede Abfrage org-gescoped.
- DSGVO: Art.-9-Einwilligung pro Profil (Zeitstempel/Version), Foto/Video-Einwilligung unter 18 nur mit Erziehungsberechtigten-Einwilligung,
  Export (JSON+CSV) und Löschung (Hard-Delete inkl. Blobs) pro Person, Audit-Log (wer/was/wann, ohne Messwerte).

## Genauigkeit (gemessen, `packages/core/test/accuracy.test.ts`)

Monte-Carlo-Läufe mit physikalisch simulierten Sprüngen (Masse 55–110 kg, 18–60 cm, variierte Tempo/Entlastung/Asymmetrie, Rauschen
1 N SD je Platte, Sway 1,5 N, Rocking 2 % BW, 60 Seeds je Abtastrate):

| Größe                            | Ziel      | gemessen (1000 Hz) | gemessen (500 Hz) |
| -------------------------------- | --------- | ------------------ | ----------------- |
| Sprunghöhe Imp-Mom               | ±0,5 cm   | max. 0,15 cm       | ≤ 0,5 cm          |
| Flugzeit, Takeoff, v=0           | ±2 ms     | max. 1,2 ms        | ≤ 4 ms            |
| Kontraktions-/exzentrische Dauer | ±2 ms (*) | max. 4,3 ms        | ≤ 8 ms            |
| Gegenbewegungstiefe              | –         | max. 3,5 mm        |                   |

(\*) Onset-abhängige Zeiten sind rauschbegrenzt: die 20-N-Schwelle schneidet einen flachen Kraftanstieg; die Toleranz beträgt dort ±5 ms.
Die Abhebegeschwindigkeit wird bei F = 0 statt an der 20-N-Kante bewertet (`kinematics.takeoffCorrection`, ≈ −0,3 cm); mit `false`
entspricht sie exakt der Referenz-App (Regressionstest).
