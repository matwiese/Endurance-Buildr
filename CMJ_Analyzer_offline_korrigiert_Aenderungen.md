# CMJ Analyzer offline – Prüfung und Korrekturen (Logik, Code, Darstellung)

Grundlage: die hochgeladene `CMJ_Analyzer_offline.html` (6,35 MB, mit Pose-Erkennung, Zeichenwerkzeug, einklappbarer Seitenleiste,
FDL CMJ SL, Rauch-Strategie, neuer Sprungtyp-Erkennung, erweitertem PDF). Die korrigierte Datei ist
`CMJ_Analyzer_offline_korrigiert.html` (2,87 MB).

Diese Datei gehört zur neueren, größeren Linie der App. Sie enthielt die Korrekturen aus `CMJ_Analyzer_offline_30` (Prüfung der Version 29)
**noch nicht**. Sie sind hier übernommen (Abschnitt A), dazu kommen Fehler, die erst im neuen Code liegen (Abschnitt B).
Geprüft wurde der gesamte eigene Code. Die eingebetteten Bibliotheken (Plotly, jsPDF, MediaPipe) sind unverändert; nur Plotly wurde gegen
die schlankere Variante **gleicher Version 2.35.2** getauscht (Optimierung 2).

## A. Fehler, die auch in dieser Datei steckten (aus v30 übernommen)

### Logik / Berechnung
| # | Problem | Folge | Korrektur |
|---|---------|-------|-----------|
| 1 | Zahlen mit US-Tausendertrenner (`"1,234.5"`, typisch nach Speichern aus Excel) wurden als `1,2345` gelesen; `"1,234,567.8"` wurde abgelehnt | **Stille Falschwerte** (Sprunghöhe 23,5 statt 32,1 cm), keine Fehlermeldung | Das letzte Trennzeichen gilt als Dezimaltrenner, mehrere Kommas = Tausender; Unicode-Minus wird erkannt |
| 2 | Kopfzeilen-Erkennung suchte nur Wörter: eine Metazeile wie `Start Time,12:00,Left foot` galt als Kopfzeile | Gültige Datei wurde mit „Spalte Time fehlt“ abgelehnt | Es zählen Spaltennamen (`Time` und `Height` oder `Left` + `Right`) |
| 3 | Zu kurze/defekte Datei: Meldung `line is not iterable` ohne Dateinamen | Unverständliche Fehlermeldung | Vorgesehene Meldung „Datei hat weniger als 10 Zeilen“ mit Dateiname |
| 4 | Squat Jump rechnete die Absprunggeschwindigkeit mit festen 20 N, unabhängig von der eingestellten Absprungschwelle | SJ-Werte passten nicht zur Einstellung und zur Angabe im PDF | Eingestellte Schwelle wird durchgereicht |
| 5 | Beurteilung: Einordnungswert konnte negativ werden („Rot (−13/100)“) | Wert außerhalb der Skala 0–100 | Auf 0–100 begrenzt |
| 6 | Beurteilung, Bremsphase: `Math.max(NaN, x)` verwarf einen gültigen Wert, die Seitenangabe konnte vom anderen Kennwert stammen, bei nicht bestimmbarer Asymmetrie stand „seitengleich“ | Falsche oder irreführende Aussage | Größerer gültiger Wert samt zugehöriger Seite; „nicht bestimmbar“ wird als solches formuliert |
| 7 | Dateinamen: Facette „foo foo“ bei Namen ohne Datum/Trial; Datum `TT-MM-JJJJ` wurde nicht erkannt | Doppelte/unpassende Beschriftung | Facette ohne Duplikat; `27.05.2025` und `27-05-2025` werden erkannt |
| 8 | **PDF:** Ist der erste Sprung nicht auswertbar, wurde er zum „Besten Sprung“ erklärt (Kennwerte „–“), die Titelkurve des Deckblatts war eine **erfundene Demo-Kurve** (15.03.2026) | Falsche Aussage im Report | Bester Sprung = höchster auswertbarer Wert; keine erfundene Kurve mehr |
| 9 | **EUR (CMJ ÷ SJ)** mischte einbeinige Squat Jumps ein (SJ 16,6 statt 23,1 cm → EUR 1,93 statt 1,39), auch im PDF | Falscher Kennwert | EUR nur mit beidbeinigen Squat Jumps |

### Oberfläche / Darstellung
| # | Problem | Korrektur |
|---|---------|-----------|
| 10 | **Die „Offline“-Datei lud Schriften von Google Fonts** (ohne Netz Ersatzschrift, mit Netz IP-Übertragung an Google) | Barlow kommt aus den bereits eingebetteten Schriftdateien; keine externen Anfragen mehr |
| 11 | **Mobil (390 px):** Seite scrollte horizontal (122–149 px Überstand in allen Tabs) | Layout bricht um; in allen 12 Tabs kein Überstand mehr |
| 12 | Eingabefeld „Athlete Name“ ragte über die Seitenleiste, die Zeilen der Sprungtypen („CMJ“, „Trial …“) wurden auf 23 px Breite abgeschnitten. Ursache: Chromium vererbt `box-sizing` nicht in `::details-content` | Feste `border-box`-Regel, Sprungtyp-Zeile einspaltig |
| 13 | Datei knapp neben die Dropzone ziehen: Browser öffnet die Datei und verlässt die App | Ablegen funktioniert überall auf der Seite |
| 14 | File Manager löschte sofort und endgültig; korrigierte Sprungtypen blieben als Altlast im Browser | Zweiter Klick bestätigt („1 Datei wirklich löschen?“); Typ-Korrektur wird mitgelöscht |
| 15 | Erholungsmonate sprangen bei jedem Analyze auf 1…n zurück | Eigene Eingaben bleiben je Sprung erhalten |
| 16 | Video-Sync auf ein nicht vorhandenes Ereignis (z. B. „Landung“) setzte einen ungültigen Versatz | Hinweis statt ungültigem Versatz |
| 17 | Vergrößern-Ansicht teilte die Daten mit dem Original-Diagramm, Fokus ging nicht zurück | Daten werden kopiert; Fokus kehrt zurück |
| 18 | Fehlermeldungen beim Analyze wurden sofort von der Erfolgsmeldung überschrieben; Hinweis mit Mischsprache („Upload and select …“) | Eine kombinierte Meldung, einheitlich deutsch |
| 19 | Tabs: kein `aria-controls`, alle Tabs in der Tab-Reihenfolge; Textfarben (grün/gelb/rot) mit zu wenig Kontrast; Scrollbars/Auswahllisten im Dark Mode hell | Tab-Semantik, Pfeiltasten/Pos1/Ende, Kontrast, `color-scheme` |

## B. Neue Fehler im neuen Code

| # | Bereich | Problem | Korrektur |
|---|---------|---------|-----------|
| 20 | **Sprungtyp-Erkennung** | Ein Single-Leg **Squat** Jump wurde über den VALD-Header als SL-**CMJ** und über den Dateinamen als **SJ** eingeordnet (Header-Kürzel `SL…` und `Single_Leg_Squat_Jump` wurden nicht erkannt) | Eigener Zweig für SL-SJ in Header-Kürzel und Dateiname |
| 21 | Sprungtyp-Erkennung | Begründung „X % der Last“ konnte `NaN %` zeigen, wenn nur einer der beiden Lastanteile bestimmbar war | Nur gültige Werte werden verrechnet |
| 22 | **Zeichenwerkzeug** | Strg+Z / Entf wirkten gleichzeitig auf **alle** Zeichenflächen (Video CMJ, SJ, SL-CMJ); ein Strg+Z löschte Zeichnungen in Tabs, an denen man nichts getan hatte | Nur die zuletzt benutzte Zeichenfläche reagiert |
| 23 | **Pose / Offline-Modell** | Falls der Browser keine Prüfsummen-Funktion hat (`crypto.subtle`, z. B. `http://` im Netzwerk), wurde die SHA-256-Prüfung der aus dem Internet geladenen Modelldateien **stillschweigend übersprungen** | Für Downloads ist die Prüfung verpflichtend; ohne sie werden die Dateien nicht verwendet (klare Fehlermeldung) |
| 24 | Pose | Hinweis „Offline-Version verwenden“ erschien auch dann, wenn man schon in der lokalen Datei ist | Hinweis nur außerhalb von `file:` |
| 25 | **KASR-Diagramm (Pose)** | Die rechte Achse (%) skalierte sich auf den Datenbereich: bei nahezu konstanten Werten wurde Messrauschen zu scheinbar großen Ausschlägen (Bildschirm und PDF) | Feste Mindestspanne 70–110 % (wächst bei größeren Werten) |
| 26 | FDL CMJ / FDL CMJ SL | Ohne darstellbare Daten (alle Versuche abgewählt, alle Werte ungültig) wurden Achsen mit `Infinity` erzeugt | Achse ohne Bereich, Plotly zeichnet leer |
| 27 | Normalisieren (FDL CMJ) | Der Schalter „Normalisieren“ war aktiv, obwohl er nur im Modus „Original (Height-Spalte)“ wirkt | Deaktiviert in den Modi „% der CM-Tiefe“ und „cm“ |

## Optimierung
1. **Analyze ca. 2× schneller** (Demo, 6 Dateien, bis zum ersten Diagramm: ca. 490 ms → ca. 230 ms): Die Grundauswertung wird je Sprung nur noch einmal gerechnet (vorher mehrfach für Typerkennung, CMJ, SJ, SL).
2. **Dateigröße 6,35 MB → 2,87 MB (−55 %)**: Plotly war als vollständiges Bundle (4,5 MB) eingebettet, die App nutzt nur `scatter` und `bar`. Eingebettet ist jetzt `plotly.js-basic-dist-min` in **derselben Version 2.35.2**. Geprüft: identische Kennwerte, alle Diagramme in allen Tabs und im PDF-Export werden gezeichnet.
3. Doppelten Code entfernt (RFD-Tabelle).
4. CSV-/JSON-Export mit passendem MIME-Typ.

## Bewusst nicht geändert (Hinweise)
- Der **VALD-Header „Test / Test Type“ hat Vorrang** vor Dateiname und Kraftkurve. Widerspricht die Kraftkurve (z. B. 100 % Last auf einem Bein bei „Countermovement Jump“), erscheint ein Hinweis „Bitte prüfen“; der Typ lässt sich in der Seitenleiste je Datei korrigieren.
- Ein Sprung mit ruhiger Haltephase gilt als Squat Jump, auch bei flacher Ausholbewegung; ist ein Header vorhanden, gewinnt dieser.
- Mittelwert/SD der Squat-Jump-Tabelle mischen beidbeinige und einbeinige SJ, wenn beide ausgewählt sind.
- Der PDF-Report enthält CMJ, beidbeinige SJ, Video-/Pose-Seiten, aber keine Single-Leg-CMJ und keine Drop Jumps.
- Ein Wert wie `"1,234"` (Komma, genau drei Nachkommastellen, kein Punkt) bleibt mehrdeutig und wird als Dezimalkomma gelesen (ForceDecks-Export, z. B. `"39,505"`).
- Pose-Ergebnisse und -Modelldateien im Browser-Speicher (IndexedDB) werden nie bereinigt; es gibt dafür keine Oberfläche.
- Die Tab-Leiste hat 12 Tabs und scrollt auf schmalen Fenstern horizontal (Tabs, kein Seiten-Überstand).
- Die Beurteilungs-Schwellen beruhen auf drei Beispielathleten und sind keine Normwerte (steht so auch in der App).

## Prüfung
- **Statisch:** `node --check` und ESLint auf beide Skriptblöcke: keine undefinierten Variablen; nur harmlose Warnungen (bewusst unbenutzte Parameter `_s`, `_sig`, `_undo`).
- **Laufzeit (Chromium, offline gesperrtes Netz):** alle 12 Tabs mit Demo- und Single-Leg-Daten ohne JavaScript-Fehler, keine externe Anfrage; Seitenüberstand 0 px bei 390 px (alle 12 Tabs); Dark Mode und Mobilansicht von FDL CMJ SL; Drop außerhalb der Dropzone; Löschen mit Bestätigung; Erholungsmonate; Tastatur-Tabs; Vergrößern-Ansicht; EUR mit einbeinigem SJ (1,39 statt 1,93); Seitenleiste ein-/ausklappen (Griff, Schiene, Taste `[`, Merken nach Reload, Diagramme passen sich an); FDL CMJ SL (überlagert/einzeln/Seite/keine); Weg-Modi und Normalisieren; PDF mit defektem ersten Sprung (Deckblatt zeigt gültigen besten Sprung und echte Kurve, 14 Seiten).
- **Pose/Video:** Testvideo mit Auto-Sync (präzise), Strg+Z nur in der aktiven Zeichenfläche, KASR-Achse, PDF mit Videoseiten (2,9 MB). Die echte MediaPipe-Engine wurde mit lokal bereitgestellten npm-Paketen (Prüfsummen stimmen) gegen die Originaldatei geprüft, weil der Modell-Download (jsdelivr) in der Testumgebung gesperrt ist.
- **Regression:** Kennwerte von 6 synthetischen Sprüngen (CMJ, SJ, SL-CMJ) mit allen ForceDecks-Metriken identisch zur Originaldatei (6 Nachkommastellen). Abweichungen nur dort, wo oben ein Fehler korrigiert wurde (Einordnungswert, US-Zahlenformat, Datei mit Zeit in der Metazeile, Fehlermeldungen, Facetten).
- **Nicht getestet:** Safari und Firefox (nicht verfügbar), echte Athletenvideos, echte VALD-Originaldateien über die vorhandenen Beispiele hinaus.
