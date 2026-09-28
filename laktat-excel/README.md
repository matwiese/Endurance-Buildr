# Laktatdiagnostik – Excel-Version

`Laktatdiagnostik.xlsx` ist ein Nachbau der Webapp „Laktatdiagnostik – Auswertung“ (`laktat-auswertung_7.html`) als reine Formel-Arbeitsmappe ohne Makros. Neu erzeugen lässt sie sich mit:

```bash
pip install openpyxl
python3 build_laktat_xlsx.py Laktatdiagnostik.xlsx
```

## Blätter

| Blatt | Inhalt |
|---|---|
| Anleitung | Bedienung, Unterschiede zur Webapp |
| Eingabe | Stammdaten, Protokoll, bis zu 20 Stufen (Belastung, Laktat, HF, Glukose), alle Auswertungsoptionen, manuelle LT1/LT2 und Bereichsgrenzen |
| Auswertung | LT1/LT2/Maximum, Hinweise, Trainingsbereiche A0–A4, Laktatstufen-Tabelle, Laktat- und HF-Diagramm |
| Verfahren | alle 21 Schwellenverfahren, Modellvergleich (Poly 2/3/4, Exponentiell), Modellgleichung |
| Diagramme | Laktatäquivalent, Log-Log (logarithmische Achsen), Glukose (formtreue Interpolation) |
| Bericht | druckfertiger A4-Bericht (3 Seiten), als PDF speicherbar |
| Beispiele | die beiden Beispieldatensätze der Webapp |

Die ausgeblendeten Blätter (Calc, Grid, ExpFit, LTP, LTP3, Guide, VCalc, ChartData, Listen) enthalten die Zwischenrechnungen.

## Abgleich mit der Webapp

Mit dem Original-JavaScript gegengeprüft: beide Beispiele, alle 4 Kurvenmodelle, Radergometer-Daten, freie und korrigierte Hilfsgeraden, manuelle Schwellen und Zonen, 3–5 Stufen, unsortierte Eingaben mit Leer- und Textzeilen, doppelte Belastungen sowie Glukose.

- 20 von 21 Verfahren weichen um höchstens 0,005 km/h ab. Bei 3-Phasen-LTP1/LTP2 und Hofmann-LTP liegt die Abweichung im Bereich der Suchrasterweite der Webapp.
- Schwellen-HF und Trainingsbereiche stimmen überein, ebenso die Laktatstufen-Tabelle, die Hinweistexte, der Hilfsgeraden-RMSE und die Glukose-Interpolation.
- Modified Dmax weicht absichtlich ab: Die Excel-Version rechnet mathematisch korrekt, die Webapp hat hier einen Rundungsfehler (siehe unten).

## Befunde aus der Prüfung der Webapp

1. **Gleitkomma-Vergleiche bei Modified Dmax und Baldari-Guidetti.** `ys[i]-ys[i-1] > 0.4` ist in JavaScript für 2,3 → 2,7 und 1,7 → 2,1 wahr (0,4000000000000004). Ein Anstieg von genau 0,4 mmol/L zählt dadurch als „> 0,4“. In beiden Beispielen startet ModDmax deshalb eine Stufe zu früh:
   - Mayer, Poly 3: 11,04 statt 11,65 km/h
   - Lan, Poly 3: der Start rückt von 10,5 auf 7,5 km/h vor

   Umgekehrt ist `>= 0.5` bei 0,9 → 1,4, 1,8 → 2,3, 3,6 → 4,1 und 7,7 → 8,2 falsch, sodass Baldari solche Anstiege übersieht. Abhilfe: Differenzen vor dem Vergleich runden, z. B. `Math.round(d*1e6)/1e6`.
2. **Der Wechsel Laufband ↔ Rad setzt manuelle Bereichsgrenzen nicht zurück.** `resetManual()` löscht nur LT1/LT2. Die Werte in `zoneMan` bleiben erhalten, sodass km/h-Grenzen danach als Watt verwendet werden.
3. **Der PDF-Bericht zeichnet die Dmax-Sehne immer.** Das passiert auch dann, wenn „Konstruktionslinien zeigen“ ausgeschaltet ist, denn `S.helpers` wird in `makePdf` nicht geprüft.
4. **Die 3-Phasen-Regression ist bei 5 Stufen nicht eindeutig** (RMSE 0, viele gleichwertige Knoten). Das Ergebnis hängt dann von der Rasterreihenfolge ab. Die Webapp warnt zwar mit „wenige Stufen“, die Werte sollten aber nicht verwendet werden.

## Unterschiede zur Webapp

- Nichtlineare Suchen (Nullstellen, Dmax, LEmin, Laktatminimum, Keul) laufen auf einem Raster von 1000 Schritten mit Interpolation bzw. Parabelverfeinerung. Der Exponentialfit nutzt eine Rastersuche mit zweifacher Verfeinerung.
- Linien lassen sich nicht mit der Maus ziehen. Manuelle Werte werden in `Eingabe!I15/I16` (LT1/LT2) und `I26–I30` (Bereichsgrenzen) eingetragen.
- Trainingsbereiche erscheinen in den Diagrammen als gestrichelte Grenzlinien statt als Farbflächen.
- Tests werden als eigene Excel-Dateien gespeichert. Browser-Speicher und JSON-Import/-Export entfallen.
