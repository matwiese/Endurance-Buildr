# Kaderauswertung Segeln mit VALD-Sprungdaten

Datei: **`kaderauswertung_segeln_vald.html`** – eine einzelne HTML-Datei, per Doppelklick im Browser öffnen (Chrome oder Edge empfohlen). Sie ist die bisherige Segeln-Auswertung (`kaderauswertung_segeln (3).html`) plus die Rohdaten-Auswertung des CMJ Analyzers. Die Originaldateien sind unverändert geblieben.

## Was neu ist

Zwei neue Reiter neben „Datenqualität“:

| Reiter | Inhalt |
|---|---|
| **Sprungdaten** | Sprungspeicher, VALD-Import (Massenimport), CSV-Upload, Zuordnung der Namen, Liste aller Sprünge mit erkannter Art |
| **Parameter** | Auswahl aller 215 ForceDecks-Kennwerte, gespeicherte Kombinationen, Werte-Tabelle je Versuch |

Aus dem CMJ Analyzer ist nur die **Rohdaten-Auswertung** übernommen – ohne Videos, ohne Diagramme. Die Rechen-Engine ist **unverändert** aus dem CMJ Analyzer kopiert (`src/engine.js`), die Kennwerte sind also identisch.

## So arbeitest du damit

1. **Rohdaten laden** (wie bisher oben rechts): das Segeln-Blatt. Es wird im Sprungspeicher gemerkt und beim nächsten Öffnen automatisch wieder geladen.
2. Reiter **Sprungdaten** → **VALD-Import**: *Verbinden*, Gruppe und Zeitraum wählen, *Suchen und alle importieren*. Jeder Sprung wird sofort ausgewertet und gespeichert. Bereits gespeicherte Tests werden übersprungen – ein erneuter Import holt nur Neues.
   Ohne VALD-Zugang: CSV-Dateien (ForceDecks-Export) per Drag & Drop in „CSV-Dateien hochladen“.
3. Reiter **Parameter**: anhaken, welche Kennwerte in die Auswertung gehen; Kombinationen speichern/laden/exportieren.
4. **Einzelauswertung, Leistungsdiagnostik, Entwicklung, Erweiterte Übersicht, Excel und PDF** zeigen die Sprung-Kennwerte jetzt zusätzlich in eigenen Gruppen an.

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
- **CMJ- und SJ-Spalte des Blatts**: Sind sie für einen Testtag leer, werden sie mit der Sprunghöhe (Impuls-Impuls) aus VALD gefüllt, PSA rechnet daraus. Ein Wert im Blatt hat immer Vorrang; weicht er um mehr als 2 cm von VALD ab, steht ein Hinweis in „Datenqualität“. Abschaltbar.
- **Zusammenführen mit dem Blatt**: nach Name (Reihenfolge, Umlaute, Zweitnamen egal) und Testtag. Namen ohne Treffer erscheinen als eigene Personen ohne Bootsklasse und lassen sich im Reiter Sprungdaten → „Zuordnung der Athlet:innen“ von Hand zuordnen.

## Der Speicher

- Ablage in der **Browser-Datenbank (IndexedDB)** dieses Rechners: Sprünge mit Erkennung und allen Kennwerten, optional die Rohkurven, Namenszuordnungen und das zuletzt geladene Blatt. Der Speicher bleibt nach Schließen und Neustart erhalten.
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
src/jump-store.js    Sprungspeicher (IndexedDB), Sicherung
src/app.js           Anbindung an die Auswertung, Import, Hinweise für „Datenqualität“
src/tab-sprung.js    Reiter „Sprungdaten“ (inkl. VALD-Import)
src/tab-param.js     Reiter „Parameter“
src/segeln-base.html Segeln-Auswertung (Original mit wenigen Einhängepunkten)
tools/build.mjs      setzt alles zur fertigen Einzeldatei zusammen:  node tools/build.mjs
tools/mock-bridge.mjs
tests/               node --test tests/core.test.mjs · node tests/e2e.mjs · node tests/e2e-edge.mjs
```

Die Einhängepunkte in der Segeln-Auswertung sind in `src/segeln-base.html` mit `KVApp`/`setDynamicMetrics`/`rebuildTests` gekennzeichnet; sonst ist der Code des Originals unverändert.
