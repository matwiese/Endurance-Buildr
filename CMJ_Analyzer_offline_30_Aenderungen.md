# CMJ Analyzer offline 30 – Änderungen gegenüber Version 29

Grundlage: `CMJ_Analyzer_offline_29.html`. Die korrigierte Datei ist `CMJ_Analyzer_offline_30.html`.
Geprüft wurde der gesamte eigene Code (Import, Berechnung, Beurteilung, Oberfläche, PDF-Export, CSS). Die eingebetteten Bibliotheken
(Plotly, jsPDF) wurden nicht verändert, nur Plotly wurde gegen die schlankere Variante gleicher Version getauscht (siehe Optimierung 2).

## Fehler (korrigiert)

### Import und Berechnung
| # | Problem | Folge | Korrektur |
|---|---------|-------|-----------|
| 1 | Zahlenformat mit US-Tausendertrenner, z. B. `"1,234.5"` (typisch nach Speichern aus Excel), wurde als `1,2345` gelesen; `"1,234,567.8"` wurde abgelehnt | **Stille Falschwerte**: Sprunghöhe 23,5 statt 32,1 cm, Peak-Landekraft 1.794 statt 4.154 N, ohne Fehlermeldung | Das letzte Trennzeichen gilt als Dezimaltrenner; mehrere Kommas = Tausender; Unicode-Minus (−) wird erkannt |
| 2 | Kopfzeilen-Erkennung suchte nur Wörter: Eine Metazeile wie `Start Time,12:00,Left foot` galt als Kopfzeile | Gültige Datei wurde mit „Spalte Time fehlt“ abgelehnt | Es zählen Spaltennamen: `Time` und (`Height` oder `Left` + `Right`) |
| 3 | Zu kurze oder defekte Datei | Meldung `line is not iterable` ohne Dateinamen | Vorgesehene Meldung „Datei hat weniger als 10 Zeilen“ mit Dateiname |
| 4 | Squat Jump rechnete die Absprunggeschwindigkeit mit fest 20 N, unabhängig von der eingestellten Absprung-/Landeschwelle | SJ-Werte passten nicht zur Einstellung und zur Angabe im PDF | Eingestellte Schwelle wird durchgereicht (bei 20 N unverändert) |
| 5 | Beurteilung: Einordnungswert konnte negativ werden („Rot (−13/100)“, „Einordnungswert −13 von 100“) | Wert außerhalb der Skala 0–100 | Auf 0–100 begrenzt |
| 6 | Beurteilung, Bremsphase: `Math.max(NaN, x)` verwarf einen gültigen Wert; die Seitenangabe („stärker rechts“) stammte u. U. aus dem anderen Kennwert; bei nicht bestimmbarer Asymmetrie stand „Die Bremsphase ist seitengleich“ | Falsche oder irreführende Aussage zur Seite | Größerer gültiger Wert samt zugehöriger Seite; „nicht bestimmbar“ wird als solches formuliert |
| 7 | Dateinamen: Facette „foo foo“ bei Namen ohne Datum/Trial; Datum im Format `TT-MM-JJJJ` wurde nicht erkannt | Doppelte bzw. unpassende Beschriftung | Facette ohne Duplikat; `27.05.2025` / `27-05-2025` werden erkannt |

### Auswertung, Oberfläche und PDF
| # | Problem | Korrektur |
|---|---------|-----------|
| 8 | **PDF:** Ist der erste Sprung nicht auswertbar, wurde er zum „Besten Sprung“ erklärt (Kennwerte „–“). Die Titelkurve auf dem Cover war in diesem Fall eine **erfundene Demo-Kurve** (Datum 15.03.2026) | Bester Sprung = höchster auswertbarer Wert; keine erfundene Kurve mehr |
| 9 | **EUR (CMJ ÷ SJ)** mischte einbeinige Squat Jumps ein (SJ 16,6 statt 23,1 cm → EUR 1,93 statt 1,39), auch im PDF | EUR nur mit beidbeinigen Squat Jumps |
| 10 | Fehlermeldungen beim Analyze wurden sofort von der Erfolgsmeldung („Erkannt: …“) überschrieben | Eine kombinierte Meldung |
| 11 | Datei knapp neben die Dropzone ziehen: Der Browser öffnet die Datei und verlässt die App | Dateien lassen sich überall auf der Seite ablegen und werden importiert |
| 12 | File Manager löschte sofort und endgültig; korrigierte Sprungtypen blieben als Altlast im Browser | Zweiter Klick bestätigt („1 Datei wirklich löschen?“, ohne Browser-Popup); Typ-Korrektur wird mitgelöscht |
| 13 | Erholungsmonate sprangen bei jedem Analyze auf 1…n zurück (z. B. nach Korrektur eines Sprungtyps) | Eigene Eingaben bleiben je Sprung erhalten |
| 14 | Video-Sync auf ein nicht vorhandenes Ereignis (z. B. „Landung“ ohne erkannte Landung) setzte stillschweigend einen ungültigen Versatz | Hinweis statt ungültigem Versatz (Kamera- und Überblend-Modus) |
| 15 | Vergrößern-Ansicht teilte die Daten-Objekte mit dem Original-Diagramm; der Fokus kehrte nach dem Schließen nicht zurück | Daten werden kopiert; Fokus geht zurück |
| 16 | **Mobil (390 px):** Seite scrollte horizontal (Kopfzeile, Auswahlfelder in FTC- und Video-Tabs); Meldungen ragten aus dem Bild | Layout bricht um; in allen Tabs kein Überstand mehr |
| 17 | Die „Offline“-Datei lud Schriften von Google Fonts: ohne Netz Ersatzschrift, mit Netz IP-Übertragung an Google | Barlow wird aus den bereits eingebetteten Schriftdateien geladen, keine externen Anfragen |
| 18 | Mischsprachiger Hinweis „Upload and select at least one file. Lade CSV-Dateien hoch …“ | Einheitlich deutsch |

## Optimierung
1. **Analyze ca. 2,5× schneller** (6 Dateien: 320–470 ms → 130–260 ms): Die Grundauswertung wird je Sprung nur noch einmal gerechnet (vorher 2–3×: Sprungtyp-Erkennung, CMJ-, SJ- und SL-Auswertung), und eine versteckte O(n²)-Schleife bei der Bein-Impulsberechnung ist beseitigt.
2. **Dateigröße 6,04 MB → 2,56 MB (−58 %):** Plotly war als vollständiges Bundle (4,5 MB) eingebettet, die App nutzt nur `scatter` und `bar`. Eingebettet ist jetzt das offizielle `plotly.js-basic-dist-min` in **derselben Version 2.35.2**. Geprüft: identische Kennwerte, gleiche Diagramm-Anzahl je Tab, PDF-Seiten pixelidentisch.
3. Doppelten Code entfernt (RFD-Tabelle im FTC-Tab entsprach der vorhandenen Hilfsfunktion).
4. Barrierefreiheit: Tabs mit `aria-controls`/`aria-labelledby`, nur der aktive Tab in der Tab-Reihenfolge, Pfeiltasten/Pos1/Ende wechseln den Fokus (Aktivieren mit Enter/Leertaste); ausreichender Kontrast für grünen/gelben/roten Text (u. a. LSI-Werte, Sync-Status); `color-scheme` für Scrollbars und Auswahllisten im Dark Mode.
5. CSV- und JSON-Export mit passendem MIME-Typ.

## Bewusst nicht geändert (Hinweise)
- Mittelwert/SD in der Squat-Jump-Tabelle mischen beidbeinige und einbeinige SJ, wenn beide ausgewählt sind (Designfrage; Sprungtyp je Datei lässt sich in der Seitenleiste korrigieren).
- Der PDF-Report enthält CMJ und beidbeinige SJ, aber keine Single-Leg-CMJ und keine Drop Jumps.
- Ein Wert wie `"1,234"` (Komma, genau drei Nachkommastellen, kein Punkt) bleibt mehrdeutig und wird wie bisher als Dezimalkomma gelesen (ForceDecks-Export, z. B. `"39,505"`).
- Die Beurteilungs-Schwellen beruhen auf drei Beispielathleten und sind keine Normwerte (steht so auch in der App).

## Prüfung
- Statisch: ESLint auf beide Skriptblöcke (keine undefinierten oder ungenutzten Variablen), `node --check`.
- Laufzeit (Chromium, offline): alle 11 Tabs, Demo- und Single-Leg-Daten, Video laden/synchronisieren/abspielen/überblenden, Parameter-Auswahl und -Kombinationen, CSV-/JSON-/PDF-Export, VALD-Import-Fehlerpfad, Dark Mode, Mobilansicht.
- Regression: Kennwerte von 6 synthetischen Sprüngen (CMJ, SJ, SL-CMJ) mit allen ForceDecks-Metriken **identisch** zu Version 29 (verglichen auf 6 Nachkommastellen); einzige Abweichung ist Korrektur 5 (Einordnungswert). 27 Randfälle (Abtastraten 200–2000 Hz, Trennzeichen, BOM/CRLF, Zeit-Offset, Lücken, kurze Wiegephase, defekte Dateien): nur die Fälle zu den Korrekturen 1–3 und 7 unterscheiden sich.
- Nicht getestet: Safari und Firefox (nicht verfügbar). Neuere Syntax, die ältere Safari-Versionen bricht (z. B. Lookbehind), wurde bewusst vermieden.
