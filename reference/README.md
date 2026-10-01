# /reference – Referenzdaten (Wahrheit bei Abweichung von der Spezifikation)

Vier Rohdaten-Exporte einer VALD-ForceDecks-Test-App („ForceDecks Raw Data Export 1.0“). Die Dateinamen wurden
**pseudonymisiert** (Original enthielt den Namen der Person). Der Dateiinhalt ist unverändert (u. a. die
pseudonyme `AthleteId`-UUID und Geräteseriennummern im Header).

| Datei                                  | Test                 | Hz   | Gewicht (Header) | Ursprungs-App      |
| -------------------------------------- | -------------------- | ---- | ---------------- | ------------------ |
| `forcedecks_cmj_trial1.csv`            | Countermovement Jump | 500  | 88,77 kg         | ForceDecks.iOS 3.4 |
| `forcedecks_sj_trial3.csv`             | Squat Jump           | 1000 | 90,49 kg         | ForceDecks.iOS 2.3 |
| `forcedecks_sl_jump_left_trial4.csv`   | Single Leg Jump L    | 1000 | 90,34 kg         | ForceDecks.iOS 2.3 |
| `forcedecks_sl_jump_right_trial1.csv`  | Single Leg Jump R    | 1000 | 90,34 kg         | ForceDecks.iOS 2.3 |

## Format

- UTF-8 mit BOM, Dezimalkomma (`"208,552"`), Felder in Anführungszeichen.
- Kopf: `Weight` (kg, Session-Wiegen), `Frequency` (Hz), `Recording Date`, `Recording Info`, `Data Source`, …
- Spalten: `Time` (s), `Left` (N), `Right` (N), _leere Spalte_, `Acceleration` (m/s²), `Velocity` (m/s),
  `Height` (m, **COM-Verschiebung** ab Onset, nicht Sprunghöhe), `Power` (W), `Impulse` (N·s).
- „Post-analysis“: Die letzten fünf Spalten sind bis zum Onset `0` und danach die Analyse-Ergebnisse der Referenz-App.
  Die Datei beginnt ca. 0,9–1,4 s vor dem Onset und reicht über die Landung hinaus (bis zum Abtreten).

## Aus den Daten abgeleitete Konventionen (numerisch verifiziert, Fehler ≤ 5·10⁻⁶ = Rundung)

1. `BW = Weight · 9,80665` (Session-Masse aus dem Wiegen, **nicht** der lokale Ruhemittelwert).
2. `Acceleration = (F_links + F_rechts − BW) / Weight`.
3. `Velocity`: Trapez-Integration von `Acceleration`, `v = 0` in der Onset-Zeile.
4. `Height`: Trapez-Integration von `Velocity`. `Impulse`: Trapez-Integration von `F − BW` (Netto-Impuls), läuft durch die Flugphase weiter.
5. `Power = |F · v|` (Betrag, auch in der exzentrischen Phase positiv).
6. **Onset-Zeile** (erste Zeile mit Acceleration ≠ 0) = Sample **vor** der ersten _anhaltenden_ (≥ ~3 Samples @1 kHz) Abweichung
   `|F − BW| > 20 N`. Die Suche beginnt erst nach einer ersten ruhigen Phase (SL-Rechts hat ~0,4 s Einschwingen vorher).
   Onset-Zeilen: CMJ 471, SJ 1069, SL-L 925, SL-R 1420.
7. Absoluter Ruhe-SD ≈ 3–6 N bei ~89 kg (reale Standschwankung), Quantisierung der Rohwerte 1 N.
8. Nach der Landung klingt die Kraft nicht in eine stabile Ruhephase aus, sondern fällt beim Abtreten gleitend auf 0
   (mit Flackern von 15–125 ms). Der Blockende-/Flugphasen-Algorithmus muss das ohne Pseudo-„Flüge“ überstehen.

Verwendung: `packages/core/test/reference.test.ts` (Regression), `FileReplayAdapter` (Demo-Wiedergabe im Simulator-Panel).
