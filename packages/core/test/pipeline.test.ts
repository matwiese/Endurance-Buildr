import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANALYSIS_CONFIG as cfg,
  G,
  WeighTracker,
  asymmetryPct,
  computeZero,
  createRng,
  detectOnset,
  findQuietAdaptive,
  findQuietIntervals,
  mean,
  mergeConfig,
  parseCsvText,
  parseForceTraceCsv,
  parseNumberLoose,
  renderScript,
  rollingStats,
  scanUnloaded,
  sd,
  standProfile,
  stepOnProfile,
  emptyProfile,
  toCsv,
  trapzRange,
  weighFromQuiet,
} from '../src/index.ts';

const noise = (n: number, s: number, seed = 1) => {
  const r = createRng(seed);
  return Float64Array.from({ length: n }, () => r.normal() * s);
};

describe('Statistik', () => {
  it('rollingStats stimmt mit der Direktberechnung überein (auch bei großem Offset)', () => {
    const x = Float64Array.from(noise(500, 3, 4), (v) => v + 900);
    const rs = rollingStats(x, 100);
    for (const i of [0, 77, 200, 400]) {
      expect(rs.mean[i]!).toBeCloseTo(mean(x, i, i + 100), 9);
      expect(rs.sd[i]!).toBeCloseTo(sd(x, i, i + 100), 7);
    }
  });
  it('trapzRange integriert gebrochene Grenzen exakt für lineare Funktionen', () => {
    const x = Float64Array.from({ length: 11 }, (_, i) => 2 * i); // x(i)=2i
    expect(trapzRange(x, 2.5, 7.25)).toBeCloseTo(7.25 ** 2 - 2.5 ** 2, 9);
    expect(trapzRange(x, 3.2, 3.9, 1)).toBeCloseTo(3.9 ** 2 - 3.2 ** 2 - 0.7, 9);
    expect(trapzRange(x, 5, 5)).toBe(0);
  });
  it('Asymmetrie: (größere − kleinere)/größere, + = rechts höher', () => {
    expect(asymmetryPct(450, 550)).toBeCloseTo(18.1818, 3);
    expect(asymmetryPct(550, 450)).toBeCloseTo(-18.1818, 3);
    expect(asymmetryPct(500, 500)).toBe(0);
    expect(asymmetryPct(0, 0)).toBeNull();
    expect(asymmetryPct(Number.NaN, 5)).toBeNull();
  });
  it('mergeConfig überschreibt tief, ohne Defaults zu verändern', () => {
    const c = mergeConfig({ onset: { thresholdN: 30 }, flight: { minFlightMs: 100 } });
    expect(c.onset.thresholdN).toBe(30);
    expect(c.onset.sustainMs).toBe(cfg.onset.sustainMs);
    expect(cfg.onset.thresholdN).toBe(20);
  });
});

describe('Zero', () => {
  it('Offsets je Platte aus leerer Platte (±0,3 N), SD und Fenster', () => {
    const l = noise(3000, 0.8, 1).map((v) => v + 12.3);
    const r = noise(3000, 0.8, 2).map((v) => v - 7.9);
    const z = computeZero(l, r, 1000, cfg.zero);
    expect(z.ok).toBe(true);
    expect(z.offsetLeft).toBeCloseTo(12.3, 0);
    expect(z.offsetRight).toBeCloseTo(-7.9, 0);
    expect(Math.abs(z.offsetLeft - 12.3)).toBeLessThan(0.3);
    expect(z.endIdx - z.startIdx).toBe(1000);
  });
  it('Person steht auf der Platte ⇒ not_empty; Erschütterung ⇒ unstable; zu kurz ⇒ not_enough_data', () => {
    const loaded = Float64Array.from(noise(2000, 0.8, 3), (v) => v + 400);
    expect(computeZero(loaded, loaded, 1000, cfg.zero).reason).toBe('not_empty');
    const shaky = Float64Array.from({ length: 2000 }, (_, i) => 30 * Math.sin(i / 7));
    expect(computeZero(shaky, shaky, 1000, cfg.zero).reason).toBe('unstable');
    expect(computeZero(new Float64Array(300), new Float64Array(300), 1000, cfg.zero).reason).toBe(
      'not_enough_data',
    );
  });
  it('findet ein ruhiges Fenster nach anfänglicher Störung', () => {
    const n = 4000;
    const l = Float64Array.from(noise(n, 0.7, 5), (v, i) => (i < 1200 ? v + 40 * Math.sin(i / 5) : v + 3));
    const r = Float64Array.from(noise(n, 0.7, 6));
    const z = computeZero(l, r, 1000, cfg.zero);
    expect(z.ok).toBe(true);
    expect(z.startIdx).toBeGreaterThanOrEqual(1100);
    expect(z.offsetLeft).toBeCloseTo(3, 0);
  });
});

describe('Wiegen', () => {
  const mass = 82.4;
  const rend = renderScript([emptyProfile(0.5), stepOnProfile(mass, 0.9), standProfile(mass, 3)], {
    hz: 1000,
    seed: 9,
    athlete: { bodyMass: mass },
  });
  it('Stabilitäts-Ampel wird erst nach ≥ 1 s Ruhe grün, Masse ±0,3 kg', () => {
    const wt = new WeighTracker(1000, cfg.weigh);
    const { left, right } = rend.trace;
    let firstStable = -1;
    for (let i = 0; i < left.length; i++) {
      const st = wt.push(left[i]!, right[i]!);
      if (st.stable && firstStable < 0) firstStable = i;
    }
    expect(firstStable).toBeGreaterThan(1900); // nicht während des Auftretens (1,4 s) grün; Fenster braucht ≥ 1 s
    expect(wt.state.stable).toBe(true);
    expect(Math.abs(wt.state.massKg - mass)).toBeLessThan(0.3);
    expect(wt.state.leftShare).toBeGreaterThan(0.4);
    expect(wt.state.leftShare).toBeLessThan(0.6);
  });
  it('leere Platte ist nie „stabil“ (keine Last)', () => {
    const wt = new WeighTracker(1000, cfg.weigh);
    for (let i = 0; i < 3000; i++) wt.push(0.3, -0.2);
    expect(wt.state.stable).toBe(false);
    expect(wt.state.loaded).toBe(false);
  });
  it('weighFromQuiet („Wiegen überspringen“) findet die Masse ±0,3 kg', () => {
    const total = Float64Array.from(rend.trace.left, (v, i) => v + rend.trace.right[i]!);
    const w = weighFromQuiet(total, rend.trace.left, 1000, cfg);
    expect(w).not.toBeNull();
    expect(Math.abs(w!.massKg - mass)).toBeLessThan(0.3);
  });
});

describe('Ruhephasen', () => {
  it('findet das ruhige Intervall und fällt auf kürzere Fenster zurück', () => {
    const bw = 800;
    const x = Float64Array.from(noise(3000, 1.5, 7), (v, i) =>
      i >= 1200 && i < 1700 ? v + bw + 200 * Math.sin((i - 1200) / 8) : v + bw,
    );
    const iv = findQuietIntervals(x, 1000, cfg.quiet, { bw, windowMs: 500 });
    expect(iv.length).toBe(2);
    expect(iv[0]!.start).toBe(0);
    expect(iv[1]!.end).toBe(3000);
    // nur 700 ms Ruhe vor Bewegung: 1-s-Fenster scheitert, 500-ms-Fenster greift
    const short = x.slice(500, 1500);
    const ad = findQuietAdaptive(short, 1000, cfg.quiet, { bw });
    expect(ad.usedWindowMs).toBe(500);
    expect(ad.intervals.length).toBeGreaterThan(0);
  });
});

describe('Onset', () => {
  const bw = 800;
  const base = (n: number, seed = 8) => Float64Array.from(noise(n, 1.2, seed), (v) => v + bw);
  it('Schwellenverfahren: Sample vor der ersten anhaltenden 20-N-Abweichung', () => {
    const x = base(2000);
    for (let i = 1000; i < 1100; i++) x[i] = bw - (i - 999) * 5; // Rampe −5 N/ms
    const on = detectOnset(x, 1000, bw, cfg, 0, 1100)!;
    // |dev| > 20 ab i = 1004 (−25 N) ⇒ Crossing 1004, Onset 1003
    expect(on.crossingIdx).toBeGreaterThanOrEqual(1003);
    expect(on.crossingIdx).toBeLessThanOrEqual(1005);
    expect(on.index).toBe(on.crossingIdx - 1);
  });
  it('einzelne Rauschspitzen (< sustain) und Schwankungen VOR dem letzten Lauf zählen nicht', () => {
    const x = base(2000);
    x[300] = bw + 40; // Spike
    for (let i = 500; i < 700; i++) x[i] = bw + 35; // früherer langer Ausschlag (Einbeinstand-Sway)
    for (let i = 1200; i < 1300; i++) x[i] = bw - 100; // eigentliche Bewegung
    const on = detectOnset(x, 1000, bw, cfg, 0, 1300)!;
    expect(on.index).toBe(1199);
  });
  it('kurzer Durchgang durch das BW-Band (≤ 20 ms) verschmilzt zum selben Lauf', () => {
    const x = base(2000);
    for (let i = 1000; i < 1100; i++) x[i] = bw - 80; // Entlastung
    for (let i = 1100; i < 1110; i++) x[i] = bw + 5; // Nulldurchgang der Nettokraft (10 ms)
    for (let i = 1110; i < 1300; i++) x[i] = bw + 300; // Abdruck
    const on = detectOnset(x, 1000, bw, cfg, 0, 1300)!;
    expect(on.index).toBe(999);
  });
  it('5-SD-Verfahren: Schwelle aus der Ruhe-SD, Referenz ist der Ruhemittelwert', () => {
    const x = Float64Array.from(noise(2000, 1.0, 9), (v) => v + 790); // Ruhe 10 N unter „Session-BW“
    for (let i = 1000; i < 1100; i++) x[i] = 790 - (i - 999) * 2; // flache Rampe: 5·SD ≈ 5 N ⇒ früh erkannt
    const sd5 = mergeConfig({ onset: { method: 'sd5' } });
    const on = detectOnset(x, 1000, bw, sd5, 0, 1100, { start: 0, end: 900 })!;
    expect(on.method).toBe('sd5');
    expect(on.thresholdN).toBeLessThan(10);
    const thr = detectOnset(x, 1000, bw, cfg, 0, 1100);
    expect(thr).not.toBeNull();
    expect(on.index).toBeLessThan(thr!.index);
  });
});

describe('Flugphasen', () => {
  const bw = 800;
  const mk = (parts: Array<[number, number]>) => {
    const out: number[] = [];
    for (const [v, n] of parts) for (let i = 0; i < n; i++) out.push(v);
    return Float64Array.from(out);
  };
  it('Flug zwischen zwei Kontakten wird mit interpolierten 20-N-Kreuzungen erkannt', () => {
    const x = mk([
      [bw, 300],
      [100, 1],
      [0, 400],
      [300, 1],
      [bw, 300],
    ]);
    const { flights, runs } = scanUnloaded(x, 1000, bw, cfg.flight);
    expect(flights).toHaveLength(1);
    expect(runs.map((r) => r.kind)).toEqual(['flight']);
    const f = flights[0]!;
    expect(f.takeoff).toBeCloseTo(300 + (100 - 20) / 100, 6);
    expect(f.landing).toBeCloseTo(700 + (20 - 0) / 300, 6);
  });
  it('Klassifikation der unbelasteten Läufe: leading, flicker, step_off, empty, trailing', () => {
    const x = mk([
      [0, 200], // leading
      [bw, 400],
      [0, 30], // flicker (< 80 ms)
      [bw, 400],
      [60, 90], // 90 ms unbelastet, aber nie ≥ 0,5·BW vor dem Abheben ⇒ step_off
      [bw, 5],
      [0, 100],
    ]);
    // Abtreten: Kraft vor dem Abheben niedrig
    for (let i = 1000; i < 1090; i++) x[i] = 5;
    const y = Float64Array.from(x);
    // step_off-Lauf: vorher fällt die Kraft gleitend auf < 0,5·BW
    for (let i = 920; i < 1000; i++) y[i] = 100;
    const { runs } = scanUnloaded(y, 1000, bw, cfg.flight);
    const kinds = runs.map((r) => r.kind);
    expect(kinds[0]).toBe('leading');
    expect(kinds).toContain('flicker');
    expect(kinds).toContain('step_off');
    expect(kinds[kinds.length - 1]).toBe('trailing');
  });
  it('zu langer unbelasteter Lauf ⇒ empty (kein Sprung)', () => {
    const x = mk([
      [bw, 500],
      [0, 3000],
      [bw, 500],
    ]);
    const { runs, flights } = scanUnloaded(x, 1000, bw, cfg.flight);
    expect(flights).toHaveLength(0);
    expect(runs[0]!.kind).toBe('empty');
  });
});

describe('CSV', () => {
  it('Dezimalkomma/-punkt, Anführungszeichen, Trennzeichenerkennung', () => {
    expect(parseNumberLoose('"88,77"'.replace(/"/g, ''))).toBe(88.77);
    expect(parseNumberLoose('1.234,5')).toBe(1234.5);
    expect(parseNumberLoose('1,234.5')).toBe(1234.5);
    expect(parseNumberLoose('abc')).toBeNaN();
    expect(parseCsvText('a;b\n1;"x;y"\n')).toEqual([
      ['a', 'b'],
      ['1', 'x;y'],
    ]);
    expect(parseCsvText('a,b\r\n"1,5",2\r\n')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
  });
  it('liest einfaches Time/Left/Right-CSV mit Punkt-Dezimal; Frequenz aus der Zeitspalte', () => {
    const rows = ['Time;Left;Right'];
    for (let i = 0; i < 50; i++) rows.push(`${(i * 0.002).toFixed(3)};${400 + i};${410 - i}`);
    const p = parseForceTraceCsv(rows.join('\n'));
    expect(p.trace.hz).toBe(500);
    expect(p.trace.left[3]).toBe(403);
    expect(p.weightKg).toBeUndefined();
    expect(p.reference).toBeUndefined();
  });
  it('wirft bei fehlenden Spalten', () => {
    expect(() => parseForceTraceCsv('a,b\n1,2')).toThrow(/Left/);
  });
  it('toCsv: Dezimalkomma, Quoting und Formel-Injection-Schutz', () => {
    const out = toCsv(
      [
        ['Name', 'Wert'],
        ['=cmd|calc', 1.5],
        ['a;b', null],
      ],
      { delimiter: ';' },
    );
    expect(out).toContain("'=cmd|calc;1,5");
    expect(out).toContain('"a;b";');
  });
});

describe('Konstanten', () => {
  it('g = 9,80665', () => expect(G).toBe(9.80665));
});
