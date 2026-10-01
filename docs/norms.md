# Normwerte (eigene Referenzdaten)

Es werden **keine** Normdaten mitgeliefert (keine Daten Dritter). Administratoren importieren eigene Normsets als CSV
(Hub → Normwerte → „Normset importieren“, Vorlage zum Herunterladen). Die Normsets liegen auf dem Server (Organisation) und werden für
den Offline-Betrieb lokal zwischengespeichert.

## CSV-Format

Trennzeichen `;` `,` oder Tab, UTF-8 (mit/ohne BOM), Dezimalkomma oder -punkt. Kopfzeile, Spaltenreihenfolge beliebig (Synonyme de/en):

| Spalte               | Pflicht | Bedeutung                                                                                   |
| -------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `test_type`          | ja      | Testtyp-Schlüssel (`cmj`) oder Bezeichnung („Gegenbewegungssprung (CMJ)“)                   |
| `metric`             | ja      | Kennzahl-Schlüssel (`jump_height_impmom`) oder Bezeichnung (de/en), siehe `docs/metrics.md` |
| `sex`                | nein    | `f`/`w`, `m`, `d` – leer = alle                                                             |
| `age_min`, `age_max` | nein    | Altersklasse in Jahren (inklusive), leer = offen                                            |
| `sport`              | nein    | Sportart – leer = alle (Vergleich ohne Groß-/Kleinschreibung)                               |
| `n`                  | nein    | Stichprobengröße                                                                            |
| `mean`, `sd`         | ja\*    | Mittelwert und Standardabweichung (> 0) in den **Einheiten der Kennzahl** (z. B. cm)        |
| `p5` … `p95`         | nein    | Perzentile (5, 10, 25, 50, 75, 90, 95); \*alternativ zu mean/sd mindestens 3 Perzentile     |

Der Import prüft jede Zeile (unbekannter Testtyp/Kennzahl, ungültiges Geschlecht/Alter, SD ≤ 0, nicht aufsteigende Perzentile, doppelte
Strata) und zeigt vor dem Speichern einen Prüfbericht; fehlerhafte Zeilen werden übersprungen.

## Zuordnung und Auswertung

Für einen Athleten (Geschlecht, **Alter zum Testzeitpunkt**, Sport), einen Testtyp und eine Kennzahl gewinnt die **spezifischste** passende Zeile
(Sport > Geschlecht > Altersklasse, schmaler Altersbereich vor breitem). Ausgewertet werden

- **z-Score** = (Wert − Mittel) / SD (roh, in Richtung des Werts; ob „höher besser“ ist, steht in der Kennzahl-Registry),
- **Perzentil** aus den Perzentilspalten (linear interpoliert), sonst aus der Normalverteilung,
- **Einordnung** (deutlich unter / unter / im Normbereich / über / deutlich über) bei |z| = 0,5 bzw. 1,5.

Verwendung: Athletenprofil (Norm-Band Mittel ± 1 SD/± 2 SD im Verlauf, z-Score/Perzentil des letzten Tests) und Berichte (Darstellung „z-Score (Norm)“).
