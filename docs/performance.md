# Leistung

Ziele der Aufgabenstellung: **60 fps** bei 2 × 1000 Hz in der Live-Anzeige und **Sofortergebnis < 100 ms** nach Landung (Rechenzeit der Auswertung) bzw. < 1 s inklusive Beruhigungsphase.

## Gemessene Werte (Sandbox-Container, Node 22, Chromium headless)

| Größe                                                                  | Messung                        | Budget (Test)   | Test                              |
| ---------------------------------------------------------------------- | ------------------------------ | --------------- | --------------------------------- |
| Nachanalyse einer 10-fach-Hop-Serie (≈ 20 s, 2 × 1000 Hz)              | ≈ 8 ms                         | < 500 ms        | `packages/core/test/perf.test.ts` |
| Nachanalyse einer 10-Minuten-Aufnahme mit 60 Sprüngen (Auto-Erkennung) | ≈ 37 ms                        | < 5 s           | `packages/core/test/perf.test.ts` |
| Live-Verarbeitung von 60 s Daten in 10-ms-Paketen                      | ≈ 4 ms (≈ 14 000 × Echtzeit)   | ≥ 20 × Echtzeit | `packages/core/test/perf.test.ts` |
| Sofortauswertung einer Rep nach der Landung                            | < 50 ms                        | < 50 ms         | `packages/core/test/live.test.ts` |
| BFB1-Blob: 10 Minuten (2 × 600 000 Werte) kodieren + dekodieren        | ≈ 90 ms                        | < 3 s           | `packages/core/test/perf.test.ts` |
| Dezimierung für das Canvas: 3 Kurven × 10 000 Samples → 1200 Spalten   | ≈ 0,6 ms je Bild               | < 3 ms          | `apps/web/test/perf.test.ts`      |
| Live-Anzeige im Browser (Playwright, Simulator 2 × 1000 Hz)            | 59,7 fps, längster Frame 33 ms | ≥ 50 fps        | `e2e/tests/live.spec.ts`          |
| Anzeige-Latenz (Ankunft → Pixel)                                       | ≈ 32–34 ms                     | < 100 ms        | `e2e/tests/live.spec.ts`          |

Die Budgets sind bewusst großzügig (CI-Rechner schwanken); die Messwerte oben stammen aus einem Lauf in dieser Umgebung und sind nur Größenordnungen.

## Warum es schnell ist

- Die Analyse läuft in einem **Web Worker** und blockiert den Zeichenthread nie; sie arbeitet streamend (O(n), Ringpuffer, keine erneute Gesamtauswertung je Paket).
- Das Canvas zeichnet **Min/Max je Pixelspalte** (`decimateMinMax`): Kosten hängen von der Bildbreite ab, nicht von der Datenmenge; Extrema bleiben erhalten.
- Kraftkanäle sind `Float32Array`, Rechnen in `Float64Array`; keine Objekte je Sample.
- Die App ist in Teile zerlegt (Hub, Gruppentest, Beamer, Einstellungen werden erst beim Aufruf geladen; Bibliotheken in einem eigenen, selten wechselnden Chunk):
  Start-JS ≈ 244 kB + 300 kB (gzip ≈ 77 + 95 kB), Hub ≈ 98 kB (gzip 29 kB). Die Demo-Aufnahmen werden nur bei Bedarf geladen und nicht vorab gecacht.
- Gehashte Build-Dateien werden mit `immutable` ausgeliefert; Service Worker (Workbox) hält die App-Hülle offline bereit.

## Selbst messen

```bash
pnpm test                       # enthält die Rechenzeit-Budgets
pnpm e2e live                   # FPS und Latenz im echten Browser (Ausgabe „FPS …“, „Latenz-Anzeige …“)
```
