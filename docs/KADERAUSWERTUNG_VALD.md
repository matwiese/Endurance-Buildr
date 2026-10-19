# Kaderauswertung Segeln mit VALD-Sprungdaten

Datei: **`kaderauswertung_segeln_vald.html`** – eine einzelne HTML-Datei, per Doppelklick im Browser öffnen (Chrome oder Edge empfohlen). Sie ist die bisherige Segeln-Auswertung (`kaderauswertung_segeln (3).html`) plus die Rohdaten-Auswertung des CMJ Analyzers. Die Originaldateien sind unverändert geblieben.

## Was neu ist

Drei neue Reiter neben „Datenqualität“:

| Reiter | Inhalt |
|---|---|
| **Sprungdaten** | Sprungspeicher, VALD-Import (Massenimport), CSV-Upload, Zuordnung der Namen, Liste aller Sprünge mit erkannter Art |
| **Parameter** | Auswahl aller 215 ForceDecks-Kennwerte, gespeicherte Kombinationen, Werte-Tabelle je Versuch |
| **Auswertungstemplates** | Vorlagen für Einzelauswertung, PDF und Excel (was angekreuzt ist, erscheint), CSV-Import weiterer Parameter, Speicher und Sicherungsordner |

Oben rechts steht immer die gewählte **Vorlage** (Auswertungsauswahl).

Aus dem CMJ Analyzer ist nur die **Rohdaten-Auswertung** übernommen – ohne Videos, ohne Diagramme. Die Rechen-Engine ist **unverändert** aus dem CMJ Analyzer kopiert (`src/engine.js`), die Kennwerte sind also identisch.

## So arbeitest du damit

1. **Rohdaten laden** (wie bisher oben rechts): das Segeln-Blatt. Es wird im Sprungspeicher gemerkt und beim nächsten Öffnen automatisch wieder geladen.
2. Reiter **Sprungdaten** → **VALD-Import**: *Verbinden*, Gruppe und Zeitraum wählen, *Suchen und alle importieren*. Jeder Sprung wird sofort ausgewertet und gespeichert. Bereits gespeicherte Tests werden übersprungen – ein erneuter Import holt nur Neues.
   Ohne VALD-Zugang: CSV-Dateien (ForceDecks-Export) per Drag & Drop in „CSV-Dateien hochladen“.
3. Reiter **Parameter**: anhaken, welche Kennwerte in die Auswertung gehen; Kombinationen speichern/laden/exportieren.
4. **Einzelauswertung, Leistungsdiagnostik, Entwicklung, Erweiterte Übersicht, Excel und PDF** zeigen die Sprung-Kennwerte jetzt zusätzlich in eigenen Gruppen an.

## Auswertungstemplates

Eine **Vorlage** legt fest, was Einzelauswertung, Profilblatt, **PDF** (inklusive der Statistiken) und **Excel** zeigen – wirklich nur das, was angekreuzt ist.

- **Vorlage wählen** (oben rechts oder im Reiter): „Alle Kennwerte“ (wie bisher), „Sportmotorik komplett (ohne Sprungkennwerte)“, „Kurzprofil (Netzdiagramm-Tests)“, „Sprungleistung mit VALD“ (mit eigenem Netz aus CMJ, SJ, PSA, Hopp und drei Sprungkennwerten) und „Sprungauswertung gesamt“ (siehe unten) sind eingebaut. Eigene Vorlagen entstehen über *Speichern unter …*, lassen sich ändern (*Speichern*), umbenennen, löschen und als Datei austauschen (*Exportieren/Importieren*).
- **Sportmotorische Tests ankreuzen**: Anthropometrie, Movement Screen, Rumpfkraftausdauer, Sprungleistung / Schnellkraft (CMJ, SJ, PSA, EUR, 5er Hopp), Maximalkraft, Schnelligkeit, Oberkörper – mit Suche und „alle/keine“ je Gruppe. Eigene Parameter aus CSV-Importen stehen ebenfalls in der Liste.
- **Sprungkennwerte ankreuzen**: erst die Sprungarten (CMJ, SJ, SL-CMJ links/rechts, Seitenvergleich), dann die Kennwerte aus dem ForceDecks-Katalog – dieselbe Auswahl wie im Reiter „Parameter“, aber je Vorlage gespeichert.
- **Bausteine**: Leistungsprofil (Netzdiagramm; braucht mindestens drei Achsen mit Messwerten, siehe unten), Vergleich zur Gruppe (Regler mit Abweichung und Durchschnitt; aus = nur Name und Wert), Rangplatz im Kader („Platz 3/12“), Durchgänge im Vergleich (Entwicklungstabelle mit den angekreuzten Tests), **Erweiterte Übersicht im PDF** (siehe unten), **Alle Sprünge in einer Kategorie** (Standard, abschaltbar: CMJ, SJ, 5er Hopp, EUR und alle angekreuzten Sprungkennwerte aus VALD stehen gemeinsam in der Kategorie **„Sprungleistung / Schnellkraft“** statt in mehreren Karten; Kennwerte gleichen Namens bekommen die Sprungart in Klammern, z. B. „Concentric Peak Force (CMJ)“).
- **Netzdiagramm: Anzahl und Kennwerte der Achsen** (eigenes Feld „Netzdiagramm (Leistungsprofil)“ unter den Bausteinen): Anzahl der Achsen von 3 bis 12 wählen – es erscheinen entsprechend viele Auswahlfelder „Achse 1 … Achse n“, in denen je Achse ein Kennwert gewählt wird (im Uhrzeigersinn, oben beginnend). Zur Wahl stehen alle sportmotorischen Tests inklusive eigener Parameter aus CSV-Importen und – für die in der Vorlage angekreuzten Sprungarten und Kennwerte – Sprungkennwerte aus VALD. Nur Kennwerte mit klarer Wertung (größer oder kleiner = besser) sind wählbar, also nicht Größe, Masse und BMI. Ein Kennwert kann nur einmal vorkommen; beim Verkleinern bleiben die ersten Achsen, beim Vergrößern schlägt die App passende Kennwerte vor. „Standard (8 Tests)“ stellt die acht bisherigen Achsen wieder her. Unter den Feldern zeigt eine Vorschau das Netz für eine Person (wählbar). Die Auswahl wird mit der Vorlage gespeichert, gesichert und exportiert und gilt für Einzelauswertung, Profilblatt und PDF. Ältere Vorlagen ohne Achsenangabe verhalten sich wie bisher (Standardachsen, soweit angekreuzt). Die Achsen sind unabhängig von den Haken bei den Tests: Der Wert erscheint im Netz, auch wenn der Test nicht als eigene Zeile angekreuzt ist.
- Die **Stammdaten** (Name, Bootsklasse, Kader, Alter) stehen immer im Kopf des PDF; die große **Bootsklasse** oben rechts auf jeder Seite erscheint nur mit Häkchen (siehe „Bootsklasse im Kopf des PDFs“ unten); der Name der Vorlage steht im Kopf der Folgeseiten.
- Nicht von der Vorlage gefiltert: die Teamansichten (Kader, Leistungsdiagnostik mit Rangliste und Gesamtübersicht, Entwicklung, Erweiterte Übersicht). Dort stehen weiterhin alle Kennwerte.
- Die Sprungkennwerte der aktiven Vorlage stehen immer zur Verfügung, auch wenn sie im Reiter „Parameter“ nicht angehakt sind.

### Weitere Parameter per CSV importieren

Für Messwerte, die nicht im Segeln-Blatt stehen oder später dazukommen (neue Tests, Nachträge):

1. CSV wählen oder hineinziehen (Trennzeichen ; oder ,, Zahlen mit Komma oder Punkt, UTF-8 oder Windows-Zeichensatz). Eine Spalte „Name“ ist nötig, „Testdatum“ optional.
2. Je Spalte festlegen: **Name**, **Testdatum**, **Bekannter Test** (z. B. CMJ ohne Arme), **Neuer Parameter** (Bezeichnung, Einheit, Nachkommastellen, Wertung „größer/kleiner = besser“ oder ohne, Gruppe) oder **ignorieren**. Die App schlägt die Zuordnung vor; Überschriften wie „Sprint 10 m [s]“ liefern Bezeichnung und Einheit.
3. *Importieren*: Die Zeilen werden nach Name und Testtag mit den vorhandenen Daten zusammengeführt (neue Namen kommen als eigene Personen dazu). Werte im Segeln-Blatt bleiben bestehen, außer „vorhandene Werte überschreiben“ ist gewählt.
4. Ein späterer Import mit gleicher Bezeichnung ergänzt **denselben** Parameter. Importe lassen sich einzeln entfernen; eigene Parameter lassen sich umbenennen, anders einstellen und löschen.

Eigene Parameter erscheinen unter „Alle Kennwerte“ automatisch (Einzelauswertung, PDF, Excel, Rangliste, Entwicklung …), in eigenen Vorlagen nach dem Anhaken.

## PDF im Design von Leistungssport Austria

Das PDF-Profil nutzt das Briefpapier `LSA_Briefpapier_2026-07-30-druck.pdf` (Formen oben und unten, Logo „Leistungssport Austria“, Adresszeilen am Seitenende):

- Das Briefpapier liegt als **Vektorgrafik** auf jeder Seite (scharf in jeder Vergrößerung, ca. 30 KB). Rot und Grau sind aus dem Druck-PDF (CMYK) in Bildschirmfarben umgerechnet: Rot `#E3000A`, dunkles Rot `#B30500`, Grau `#7A7A7A`.
- Der Inhalt sitzt im freien Bereich zwischen Logo und Fußform (ca. 47 bis 262 mm). Darunter steht nur „Seite x von y“ (keine Zeile mehr mit Name, Erstelldatum und Quelle); die Adresszeilen des Briefpapiers folgen darunter. Überschriften, Linien und das Netzdiagramm sind im LSA-Rot gehalten.
- Lange Namen, Kader- und Klassenbezeichnungen werden verkleinert beziehungsweise gekürzt, damit nichts überlappt. Der Platz ist kleiner als beim alten Layout, deshalb braucht ein PDF mit vielen Kennwerten etwas mehr Seiten.
- Die Adresszeilen sind in **Helvetica** gesetzt (das Original verwendet die Hausschrift Outfit; eine Schrift in der Datei würde das PDF um ein Vielfaches vergrößern). Die Logos in der Bildschirmoberfläche der Auswertung sind unverändert.
- **Ohne Internetzugang** (jsPDF lässt sich nicht laden) öffnet sich der Druckdialog; die Druckansicht trägt dasselbe Briefpapier. Dort „Als PDF speichern“ wählen.
- Anderes Briefpapier verwenden: Datei nach `assets/` legen und `python3 -I tools/letterhead.py assets/<Datei>.pdf src/letterhead.js` ausführen (`pypdf` nötig), danach `node tools/build.mjs`. Das Skript liest Formen, Logo-Umrisse und die Lage der Fußzeilenschrift aus dem PDF und berechnet daraus den freien Bereich. Bei neuen Farben die Tabelle `RGB` in `tools/letterhead.py` anpassen.

## Einzelauswertung: Testtermin wählen und Einzelauswertung-Punkt in den Templates

- **Datumsauswahl**: In der Einzelauswertung wählt das Feld neben der Personenauswahl den **Testtermin** (neuester zuerst, „letzter Test“ ist der Standard). Dieser Test wird ausgewertet: Werte, Regler, Netzdiagramm, Rang und Kopfzeile („früherer Test gewählt“), in der Tabelle „Durchgänge im Vergleich“ als „gewählt“ markiert, und auch das PDF dieser Person (Kopf „Test vom …“, Übersicht mit „gewählt“). Das Häkchen **Verlauf** blendet die Tabelle „Durchgänge im Vergleich“ aus – dann steht dort nur dieser Test. Die Auswahl gilt je Person und nur für die Sitzung.
- **Vergleich zum Testtag**: Bei einem früheren Test vergleichen Durchschnitt, Regler und Rang mit dem Stand zu diesem Tag (je Person der letzte Test bis zu diesem Tag); beim letzten Test wie bisher mit den jeweils letzten Tests aller. Bei „Alle Profile in einem PDF“ zählt für jede Person ihre eigene Auswahl.
- **Punkt „Einzelauswertung“** im Reiter „Auswertungstemplates“: Kategorien wie in der Einzelauswertung (Anthropometrie, Movement Screen, …, **Sprungleistung / Schnellkraft**) lassen sich als Ganzes per Häkchen an- und abwählen, einzelne Tests und die VALD-Sprungkennwerte darunter. **Jede Änderung wirkt sofort** auf den Reiter „Einzelauswertung“ (sowie PDF und Excel) – als **Entwurf**, der im Kopf der Einzelauswertung vermerkt ist („Entwurf: … (nicht gespeichert)“). *Speichern* bzw. *Speichern unter …* macht den Entwurf dauerhaft und die Vorlage gleich zur aktiven Auswertung; *Änderungen verwerfen* (oder das Öffnen einer anderen Vorlage) beendet den Entwurf.
- „Alle Kennwerte“ im Editor bedeutet alle Tests plus die im Reiter „Parameter“ gewählten Sprungkennwerte.

## Rohdatenblatt entfernen („Rohdaten leeren“)

Wurde die falsche Datei geladen: Schaltfläche **„Rohdaten leeren“** oben (neben „Rohdaten laden“). Nach Rückfrage wird das geladene Rohdatenblatt samt Fotos aus der Datei entfernt – aus der Anzeige und aus dem Speicher (es kommt auch nach dem Neu-Öffnen nicht zurück); ohne Blatt erscheinen wieder die Beispieldaten (bzw. nur die VALD-Sprünge, wenn welche gespeichert sind). Sprünge aus VALD, Vorlagen, CSV-Importe, Zuordnungen und Einstellungen bleiben. Alles auf einmal löscht „Alles löschen“ im Reiter „Sprungdaten“ (auch Vorlagen und Importe!); einzelne CSV-Importe lassen sich im Reiter „Auswertungstemplates“ entfernen.

## Erweiterte Übersicht im PDF

Am Ende jedes PDF-Profils hängt die **Erweiterte Übersicht** (eigene Seiten im Design von Leistungssport Austria; bei vielen Kennwerten mehrere Seiten, Seitenzahl „x von y“ läuft durch):

- **Testtermine**: die im Reiter „Erweiterte Übersicht“ gewählten (bis zu fünf, in der dort gewählten Reihenfolge; ohne eigene Wahl die letzten fünf). Beim PDF einer anderen Person als der im Reiter angezeigten erscheinen dieselben Testtage, soweit diese Person an dem Tag getestet wurde, sonst ihre letzten fünf. Bei „Alle Profile in einem PDF“ bekommt so jede Person ihren Anhang mit denselben Testtagen.
- **Inhalt**: je Kennwert der Wert pro Testtermin mit der Veränderung gegenüber dem Test links davon (grün = besser, gelb = schlechter, grau = ohne Wertung; Punkte- und Prozentwerte als Differenz in Pkt bzw. PP), Güte („Q schwach“), Clearing-Test und der aktuelle Test als „aktuell“ markiert – wie im Reiter.
- **Vorlage**: Es erscheinen nur die Kennwerte der aktiven Vorlage (alle Sprünge gemeinsam in der Kategorie „Sprungleistung / Schnellkraft“). Über den Baustein **„Erweiterte Übersicht im PDF“** lässt sich der Anhang je Vorlage ausschalten. Die Druckansicht ohne Internet hängt dieselbe Tabelle an.

## Bootsklasse im Kopf des PDFs (Reiter „Parameter“ → Anzeige)

- Das Häkchen „Bootsklasse im Kopf des PDFs anzeigen“ steuert **nur** die große Klasse oben rechts auf jeder PDF-Seite (Profilseite, Folgeseiten und Erweiterte Übersicht; auch in der Druckansicht). Voreinstellung: **aus**. Die Einstellung wird gespeichert (Browser-Datenbank und Sicherungsordner) und gilt auch nach dem Neu-Öffnen.
- Alles andere bleibt, wie es war: die Zelle „Bootsklasse“ in den Stammdaten des PDFs, die Bezeichnung der Vergleichsgruppe („Durchschnitt ILCA 6“), Einzelauswertung, Profilblatt, Personenauswahl, Dateiname, Team-Ansichten und Excel.

## Fotos aus der Excel-Rohdatendatei

Beim Laden einer **.xlsx-Datei** („Rohdaten laden“) übernimmt die App die darin eingefügten Bilder automatisch als Fotos der Athlet:innen – sie stehen sofort in der Einzelauswertung (Kopf), im Kader und im PDF (Seite 1). Das Foto wird, wie beim manuellen Laden, quadratisch aus der Bildmitte zugeschnitten.

- **Schwebende Bilder** („Einfügen → Bilder“): Das Bild muss in der Zeile der Person liegen (obere linke Ecke des Bildes zählt; bei hohen Bildern die erste Zeile mit einem Namen). Gelesen wird die Spalte „Name“ der Zeile. Das geht im Rohdatenblatt selbst (z. B. in einer Spalte „Foto“) oder auf dem Blatt „Fotos“ (Name in einer Spalte, Bild daneben).
- **„Bild in Zelle“** (Excel 365): Bild in einer Zelle der Zeile der Person.
- Mehrere Bilder für dieselbe Person: das erste von oben. Per „Fotos laden“ oder „Foto wählen“ von Hand gesetzte Fotos gehen immer vor. Die Fotos werden mit dem Rohdatenblatt gespeichert und sind nach dem Neu-Öffnen wieder da.
- Weiter möglich: Bild-URL im Blatt „Fotos“ oder in der Spalte „Foto-URL“. CSV-Dateien können keine Bilder enthalten.
- Nicht lesbar sind Bilder in Formaten, die der Browser nicht darstellt (z. B. EMF/WMF), und – wenn der Browser den Entpacker `DecompressionStream` nicht hat (sehr alte Versionen) – alle Excel-Bilder; dann erscheint ein Hinweis. Chrome und Edge sind aktuell unproblematisch.

## Eccentric Utilization Ratio (EUR) und die Vorlage „Sprungauswertung gesamt“

- **EUR = Sprunghöhe CMJ ÷ Sprunghöhe SJ** (Standardformel). Ein Wert über 1 heißt: Der CMJ springt höher als der SJ, die Vordehnung (Dehnungs-Verkürzungs-Zyklus) wird genutzt; je höher, desto mehr. Der Kennwert steht unter den Sprungkraft-Tests („Eccentric Utilization Ratio (EUR)“, zwei Nachkommastellen, größer ist besser) und ist in Einzelauswertung, Gesamtübersicht, Rangliste, Excel, PDF und im Netzdiagramm wählbar. Er hängt mit dem PSA zusammen: PSA = (EUR − 1) · 100.
- **Woher die Höhen kommen**: aus dem Blatt (CMJ- und SJ-Spalte), sonst aus VALD (Jump Height Imp-Mom, bester Versuch des Tages; auch dann, wenn das Füllen der Blattfelder abgeschaltet ist). Wie beim PSA hat ein Blattwert Vorrang, und der EUR wird immer aus den Höhen nachgerechnet; eine Spalte „EUR“ im Blatt wird erkannt, bei Abweichung gibt es einen Hinweis in „Datenqualität“. Ohne SJ oder CMJ am Testtag gibt es keinen EUR.
- **Vorlage „Sprungauswertung gesamt (CMJ, SJ, EUR, Peak Force, 5er Hopp)“**: eine einzige Karte „Sprungleistung / Schnellkraft“ mit CMJ, SJ, EUR, Concentric Peak Force (absolut in N und relativ in N/kg) für CMJ und SJ, 5er Hopp links und rechts sowie der Seitendifferenz der beiden 5er Hopps (in dieser Reihenfolge), dazu ein Netzdiagramm mit acht Achsen und Rangplätze. Auswählen oben rechts bei „Vorlage“; wer weitere Kennwerte (z. B. Eccentric Peak Force) braucht, legt über *Speichern unter …* eine eigene Kopie an. Alle anderen Tests (Movement Screen, Rumpf, Maximalkraft …) erscheinen dabei nicht; für sie bleibt „Alle Kennwerte“.

## Wie die Sprungart erkannt wird

Wie im CMJ Analyzer (`classifyJump`): Die Testart aus VALD (Dateikopf der Bridge bzw. Dateiname) hat Vorrang, die Kraftkurve prüft sie gegen. Widerspricht die Kraftkurve, steht in der Sprungliste **„prüfen“** – die Art lässt sich dort korrigieren.

- **CMJ**: Ausholbewegung unmittelbar vor dem Abdruck
- **SJ**: ruhige Haltephase vor dem Kraftanstieg, keine Gegenbewegung
- **SL-CMJ links/rechts**: nur eine Platte trägt das Gewicht; die Seite kommt aus der Belastung bzw. dem VALD-Dateikopf
- **Drop Jump** wird erkannt, aber (wie im CMJ Analyzer) noch nicht ausgewertet

## Wie aus Sprüngen die Werte der Auswertung werden

- Je Sprung werden einmal **alle** Kennwerte berechnet und im Speicher abgelegt. Die Auswahl im Reiter „Parameter“ filtert nur noch.
- Mehrere Versuche je Person, Tag und Sprungart werden zusammengefasst (Reiter Sprungdaten → „Mehrere Versuche je Tag“): **bester Versuch** (höchste Sprunghöhe, alle Werte aus diesem Versuch; Voreinstellung), **Mittelwert** oder **Median**. In der Tabelle im Reiter „Parameter“ zeigt die Spalte „→ Auswertung“, welcher Wert in die Auswertung geht.
- Gruppen in der Auswertung: *CMJ (VALD)*, *SJ (VALD)*, *SL-CMJ links (VALD)*, *SL-CMJ rechts (VALD)* und *SL-CMJ Seitenvergleich (VALD)* (Seitendifferenz in %, kleiner ist besser).
- Beim Single Leg entfallen Asymmetrie- und Links/Rechts-Kennwerte (die andere Platte ist unbelastet); beim Squat Jump gibt es die Kennwerte, die der CMJ Analyzer für den SJ berechnet.
- Asymmetrien erscheinen als Betrag in %; die Seite (L/R) zeigt der Reiter „Parameter“.
- **Voreinstellung der Auswahl** beim ersten Start: „Kompakt“ (15 Kennwerte: Sprunghöhe, RSImod, Kraft, Leistung, Impuls, Landekraft, zwei Asymmetrien) – damit Einzel- und Teamauswertung übersichtlich bleiben. Mit der Vorlage „VALD-Standard“ (65 Kennwerte wie im CMJ Analyzer) oder „Alle Metriken“ erscheint entsprechend mehr; eine früher im CMJ Analyzer gespeicherte Auswahl wird übernommen, wenn der Browser denselben Speicher teilt.
- **Gesamtübersicht Leistung** (Reiter Leistungsdiagnostik): zusätzliche Spalten frei wählbar („+ Spalte“, „×“ zum Entfernen). Voreingestellt sind – soweit ausgewählt – RSImod, Peak Power/BM, Sprunghöhe SL-CMJ links/rechts und deren Seitendifferenz.
- **Ampelwertung** (grün/gelb) nur für gängige Leistungskennwerte (Sprunghöhe, RSImod, Kraft, Leistung, Impuls, RFD, Geschwindigkeit: größer ist besser; Asymmetrien: kleiner ist besser). Alle anderen Kennwerte erscheinen ohne Wertung.
- **CMJ- und SJ-Spalte des Blatts**: Sind sie für einen Testtag leer, werden sie mit der Sprunghöhe (Impuls-Impuls) aus VALD gefüllt, PSA und EUR rechnen daraus. Ein Wert im Blatt hat immer Vorrang; weicht er um mehr als 2 cm von VALD ab, steht ein Hinweis in „Datenqualität“. Abschaltbar.
- **VALD an einem anderen Tag als im Blatt**: Liegt der VALD-Test nicht auf demselben Tag wie ein Test im Rohdatenblatt, bleibt er ein eigener Testtermin („nur VALD“ in Tabellen und Datumsauswahl). Der **aktuelle Test** einer Person ist trotzdem der letzte Test aus dem Blatt, und in der Einzelauswertung stehen unter „Sprungleistung / Schnellkraft“ die Kennwerte des **nächstliegenden VALD-Tests** – der letzte davor, sonst der erste danach – mit dem Hinweis „VALD-Kennwerte: Test vom … – am ausgewerteten Testtag gibt es keinen VALD-Test“ (im PDF in der Kategorieüberschrift: „VALD vom …“). Gleiches gilt für Kader, Rangliste und Excel. Wer den VALD-Test selbst als Testtermin sehen will, wählt sein Datum in der Datumsauswahl der Einzelauswertung. Gibt es am Testtag selbst VALD-Daten, gelten diese.
- **Zusammenführen mit dem Blatt**: nach Name (Reihenfolge, Umlaute, Zweitnamen egal) und Testtag. Namen ohne Treffer erscheinen als eigene Personen ohne Bootsklasse und lassen sich im Reiter Sprungdaten → „Zuordnung der Athlet:innen“ von Hand zuordnen.

## Der Speicher

- Ablage in der **Browser-Datenbank (IndexedDB)** dieses Rechners: Sprünge mit Erkennung und allen Kennwerten, optional die Rohkurven, Namenszuordnungen, **Vorlagen und die aktive Vorlage, eigene Parameter, CSV-Importe** und das zuletzt geladene Blatt. Alles bleibt nach Schließen und Neustart erhalten und wird nach jeder Änderung automatisch gespeichert.
- **Sicherungsordner (Chrome/Edge)**: Im Reiter „Auswertungstemplates“ → „Speicher und Sicherung“ lässt sich ein Ordner wählen (auch ein OneDrive-/Cloud-Ordner). Die App schreibt dort nach jeder Änderung selbsttätig `Kaderauswertung_Einstellungen.json` (Vorlagen, Zuordnungen, eigene Parameter, Importe, Rohdatenblatt) und `Kaderauswertung_Sprungdaten.json` (Sprünge ohne Rohkurven). So bleibt alles erhalten, auch wenn der Browser seine Daten löscht, und lässt sich auf einem anderen Rechner mit „Aus Ordner laden“ wieder einlesen. Der Browser verlangt nach jedem Neustart einen Klick („Zugriff bestätigen“). Sicherheitsregeln: ein leerer Speicher (z. B. nach „Alles löschen“) überschreibt nie eine vorhandene Sicherung; liegt im gewählten Ordner eine neuere Sicherung, fragt die App erst, ob sie geladen werden soll.
- Er gehört zu **diesem Browser auf diesem Rechner**. Für einen anderen Rechner oder als Sicherung: *Speicher sichern* (ohne oder mit Rohkurven) und dort *Sicherung laden*.
- Rohkurven brauchen viel Platz (rund 100–300 KB je Sprung). Sie werden nur gebraucht, um alle Sprünge später mit anderer Absprungschwelle *neu auszuwerten*; die Ergebnisse brauchen sie nicht. Abschaltbar.
- Kann der Browser keine Datenbank anlegen (z. B. privates Fenster), läuft die App im Arbeitsspeicher weiter und weist darauf hin.
- Gespeicherte Parameterkombinationen und die Parameterauswahl liegen – wie im CMJ Analyzer – im Browser-Speicher (`localStorage`, gleiche Schlüssel) und lassen sich als JSON exportieren/importieren.

## VALD-Anbindung

Die Seite spricht – wie der CMJ Analyzer – **nie direkt mit VALD**, sondern mit einer lokalen Bridge (`node vald-bridge.mjs`, Adresse standardmäßig `http://127.0.0.1:8787`). Dort liegen Client-ID und Secret. Das Protokoll ist unverändert, eine vorhandene Bridge funktioniert also weiter:

```
GET /api/status | /api/tenants | /api/groups?tenantId | /api/profiles?tenantId[&groupId]
GET /api/tests?tenantId&from&to[&groupId&profileId&testType]  → {tests:[{testId,profileId,athlete,testType,recordedDateUtc,recordedDateOffset,notes}]}
GET /api/import?tenantId&testId&profileId&from                → {files:[{name,text}]}   (je Versuch eine CSV)
```

Die Bridge selbst liegt **nicht** in diesem Repository. Für Tests und zum Ausprobieren gibt es `tools/mock-bridge.mjs` (erfundene Sprünge, gleiches Protokoll): `node tools/mock-bridge.mjs`.

## Entwicklung

```
src/engine.js        CMJ-Engine (aus dem CMJ Analyzer, unverändert)
src/jump-core.js     Verarbeitung je Sprung, Namensabgleich, Aggregation, Metrik-Definitionen
src/templates.js     Auswertungsvorlagen (eingebaute, Filterregeln, Austauschformat)
src/csv-import.js    CSV-Import weiterer Parameter (Spalten erkennen, eigene Parameter, Zeilen)
src/xlsx-photos.js   Fotos aus der Excel-Datei (ZIP lesen, Bilder den Zeilen und damit den Personen zuordnen)
src/jump-store.js    Sprungspeicher (IndexedDB), Sicherung
src/sync.js          Sicherungsordner (File System Access API)
src/app.js           Anbindung an die Auswertung, Vorlagen, Importe, Hinweise für „Datenqualität“
src/tab-sprung.js    Reiter „Sprungdaten“ (inkl. VALD-Import)
src/tab-param.js     Reiter „Parameter“
src/tab-templates.js Reiter „Auswertungstemplates“
src/letterhead.js    Briefpapier Leistungssport Austria als Vektordaten (erzeugt von tools/letterhead.py, nicht von Hand ändern)
src/segeln-base.html Segeln-Auswertung (Original mit wenigen Einhängepunkten; PDF-Export im LSA-Design)
assets/              Briefpapier-PDF (Vorlage für tools/letterhead.py)
tools/letterhead.py  wandelt das Briefpapier-PDF in src/letterhead.js um
tools/build.mjs      setzt alles zur fertigen Einzeldatei zusammen:  node tools/build.mjs
tools/mock-bridge.mjs
tests/               node --test tests/core.test.mjs tests/templates.test.mjs
                     node tests/e2e.mjs · node tests/e2e-edge.mjs · node tests/e2e-templates.mjs · node tests/e2e-photos.mjs   (Browser-Tests, Playwright)
tests/fixtures/      Excel-Testdateien mit eingefügten Fotos (erzeugt mit make_fotos.py, braucht XlsxWriter und Pillow)
```

Die Einhängepunkte in der Segeln-Auswertung sind in `src/segeln-base.html` mit `KVApp`, `setDynamicMetrics`, `rebuildTests`, `AM()` (Kennwerte der Vorlage) und `TB()` (Bausteine) gekennzeichnet; sonst ist der Code des Originals unverändert.
