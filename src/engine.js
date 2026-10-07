/* ===== CMJ-Engine: unverändert aus dem CMJ Analyzer (CMJ_Analyzer_offline (33).html) übernommen =====
   Enthält: CSV-Einlesen (readCMJ), Kraft-Zeit-Analyse (analyze), Sprungtyp-Erkennung (classifyJump),
   Squat-Jump-Auswertung (analyzeSJ) und den ForceDecks-Parameterkatalog (VALD_CATALOG, VALD_DEFAULT).
   Bewusst nicht verändert, damit die Werte identisch zum CMJ Analyzer bleiben. ===== */
const CMJ = (() => {
  const REQUIRED = { time: "time", left: "left", right: "right", velocity: "velocity", height: "height" };

  function splitLine(line, delim) {
    const out = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === delim && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  function detectDelim(line) {
    const counts = { ",": 0, ";": 0, "\t": 0 };
    for (const c of line) if (c in counts) counts[c]++;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  function num(s, decimalComma) {
    if (s == null) return NaN;
    s = String(s).trim();
    if (s === "" || /^na$/i.test(s)) return NaN;
    // Dezimalkomma (z. B. ForceDecks-Export: "39,505" in Anführungszeichen trotz Komma als Trennzeichen)
    if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");          // 1.234,5
    else if (decimalComma || s.includes(",")) s = s.replace(",", ".");
    const v = Number(s);
    return Number.isFinite(v) ? v : NaN;
  }

  function findHeader(lines) {
    // Original: skip = 9 → Kopfzeile ist Zeile 10. Zusätzlich robust: suche Zeile mit "Time" und "Height".
    const lim = Math.min(lines.length, 60);
    for (let i = 0; i < lim; i++) {
      const l = lines[i].toLowerCase();
      if (/\btime\b/.test(l) && (/\bheight\b/.test(l) || /\bleft\b/.test(l))) return i;   // ForceDecks-Export oder API-Rohdaten
    }
    return 9;
  }

  function parse(text, name) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    const h = findHeader(lines);
    // Kopfzeilen vor der Datentabelle: Körpergewicht (ForceDecks "Weight", Demo "Body mass (kg)") für Plausibilitätsprüfung
    const meta = {};
    for (let i = 0; i < h; i++) {
      const c = splitLine(lines[i], detectDelim(lines[i]));
      if (/^(weight|body ?mass)/i.test(c[0] || "")) { const w = num(c[1]); if (Number.isFinite(w) && w > 20 && w < 300) meta.weightKg = w; }
      if (/^test( ?type)?$/i.test((c[0] || "").trim()) && c[1]) meta.test = c[1].trim();
      if (/^trial$/i.test((c[0] || "").trim()) && /\((left|right)\)/i.test(c[1] || "")) meta.limb = /\(left\)/i.test(c[1]) ? "L" : "R";
    }
    if (h >= lines.length) throw new Error(`${name}: Datei hat weniger als ${h + 1} Zeilen.`);
    const delim = detectDelim(lines[h]);
    const header = splitLine(lines[h], delim).map(s => s.replace(/^"|"$/g, "").toLowerCase());
    const idx = {};
    for (const [k, label] of Object.entries(REQUIRED)) {
      let j = header.findIndex(x => x === label);
      if (j < 0) j = header.findIndex(x => x.startsWith(label) || x === `z ${label}`);
      // Velocity/Height fehlen bei Rohdaten aus der VALD-API (nur Kraft) → werden in readCMJ aus der Kraft berechnet
      if (j < 0 && (k === "velocity" || k === "height")) { idx[k] = -1; continue; }
      if (j < 0) throw new Error(`${name}: Spalte „${label[0].toUpperCase() + label.slice(1)}“ fehlt. Gefunden: ${header.filter(Boolean).join(", ") || "(keine)"}`);
      idx[k] = j;
    }
    // Dezimalkomma nur, wenn Semikolon- oder Tab-getrennt
    let decimalComma = false;
    if (delim !== ",") {
      const probe = lines.slice(h + 1, h + 20).join("\n");
      decimalComma = /\d,\d/.test(probe);
    }
    const cols = { time: [], left: [], right: [], velocity: [], height: [] };
    for (let i = h + 1; i < lines.length; i++) {
      const l = lines[i];
      if (!l.trim()) continue;
      const cells = splitLine(l, delim);
      for (const k of Object.keys(cols)) cols[k].push(idx[k] < 0 ? NaN : num(cells[idx[k]], decimalComma));
    }
    if (!cols.time.length) throw new Error(`${name}: Keine Datenzeilen nach der Kopfzeile gefunden.`);
    const okShare = k => cols[k].filter(Number.isFinite).length / cols[k].length;
    for (const k of ["time", "left", "right"]) if (okShare(k) < 0.5)
      throw new Error(`${name}: Spalte „${k}“ enthält überwiegend keine lesbaren Zahlen – Zahlenformat prüfen.`);
    cols.meta = meta;
    return cols;
  }

  function readCMJ(text, filename) {
    const raw = parse(text, filename);
    const n = raw.time.length;
    // Rohdaten ohne Velocity/Height (VALD-API): Schwerpunktgeschwindigkeit und -höhe aus der Kraft integrieren
    // (Körpergewicht aus den ersten 0,5 s; die eigentliche Analyse rechnet ohnehin nur mit der Kraft)
    if (!raw.height.some(Number.isFinite)) {
      const Fz = raw.left.map((l, i) => l + raw.right[i]);
      let k = 0; while (k < n - 1 && raw.time[k] - raw.time[0] < 0.5) k++;
      const bw = Fz.slice(0, k + 1).filter(Number.isFinite).reduce((a, b) => a + b, 0) / Math.max(1, k + 1), m = bw / 9.81;
      let v = 0, h = 1.0; raw.velocity[0] = 0; raw.height[0] = h;
      for (let i = 1; i < n; i++) {
        const dt = raw.time[i] - raw.time[i - 1], a0 = (Fz[i - 1] - bw) / m, a1 = (Fz[i] - bw) / m, vn = v + (a0 + a1) / 2 * dt;
        h += (v + vn) / 2 * dt; v = vn; raw.velocity[i] = v; raw.height[i] = h;
      }
      raw.meta = { ...(raw.meta || {}), derivedKinematics: true };
    }
    // Baseline = erste gültige Height-Zeile (Original: df_raw$Height[1])
    const baseline = raw.height.find(Number.isFinite);
    let minH = Infinity;
    for (const v of raw.height) if (Number.isFinite(v) && v < minH) minH = v;
    const squatDepth = baseline - minH;
    // Keine Absenkung (z. B. Squat Jump aus ruhiger Hocke): keine Normierung möglich → normierte Verschiebung bleibt leer
    const noDepth = !(squatDepth > 0);

    // arrange(time)
    const order = [...Array(n).keys()].sort((a, b) => {
      const ta = raw.time[a], tb = raw.time[b];
      if (Number.isNaN(ta)) return 1; if (Number.isNaN(tb)) return -1;
      return ta - tb || a - b;
    });
    const pick = arr => order.map(i => arr[i]);
    const time = pick(raw.time), fL = pick(raw.left), fR = pick(raw.right),
          vel = pick(raw.velocity), height = pick(raw.height);

    const trialFull = filename.replace(/\.[^.]+$/, "");
    // Datum: 2026.03.15 (Original) oder 2025_05_27 / 2025-05-27 (ForceDecks-Dateinamen)
    const dm = trialFull.match(/(\d{4})[._-](\d{2})[._-](\d{2})/);
    const date = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : trialFull;
    const tm = trialFull.match(/Trial\d+/);
    const trial = tm ? tm[0] : trialFull;

    const force = [], dispRaw = [], dispNorm = [], acc = [], phase = [];
    for (let i = 0; i < n; i++) {
      force.push(fL[i] + fR[i]);
      dispRaw.push(height[i] - baseline);
      dispNorm.push(noDepth ? NaN : 100 * (height[i] - baseline) / squatDepth);
      acc.push(i === 0 ? NaN : (vel[i] - vel[i - 1]) / (time[i] - time[i - 1]));
      const v = vel[i], f = force[i];
      // case_when: NA-Vergleiche gelten als FALSE
      let p = null;
      if (v < -0.05) p = "Eccentric";
      else if (v > 0.05 && f > 10) p = "Concentric";
      else if (f < 10) p = "Flight";
      phase.push(p);
    }
    const flightIdx = phase.indexOf("Flight"); // -1 wenn kein Flug erkannt
    return {
      file: filename, trialFull, date, trial, facet: `${date} ${trial}`,
      time, force_L: fL, force_R: fR, vel, height, force, disp_raw: dispRaw, disp_norm: dispNorm,
      acc, phase, flightIdx, takeoffIdx: flightIdx > 0 ? flightIdx - 1 : -1,
      baseline, squatDepth: noDepth ? NaN : squatDepth, noDepth, meta: raw.meta
    };
  }

  // Beispieldaten im gleichen Format (9 Metazeilen + Kopfzeile, 4. Spalte leer/ungenutzt).
  // Erzeugt über ein glattes Beschleunigungsprofil (Wiegen → Entlasten → Bremsen/Abdruck → Flug → Landung).
  function synth({ athlete = "Beispiel", date = "2026.03.15", trial = 1, mass = 78, unw = 5.5, tU = 0.32, tP = 0.4, v0 = 2.5, asym = 0.04, seed = 1, sj = false, single = null, label = "CMJ" } = {}) {
    if (sj) { tU = 0; }
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280) - 0.5;
    const g = 9.81, dt = 0.001, tQ = 1.2;
    const vmin = sj ? 0 : -unw * tU / 2;
    const C = (v0 - vmin + g * tP / 9) * Math.PI / (2 * tP);
    const tFl = 2 * v0 / g, tL1 = 0.045, tL = 0.32, K1 = 42;
    const K2 = Math.max(0, (v0 - 2 * tL1 * K1 / Math.PI)) * Math.PI / (2 * tL);
    const t1 = tQ, t2 = t1 + tU, t3 = t2 + tP, t4 = t3 + tFl, tEnd = t4 + tL + 0.9;
    const acc = t => {
      if (t < t1) return 0;
      if (t < t2) return sj ? 0 : -unw * Math.sin(Math.PI * (t - t1) / tU) ** 2;   // ∫ = −unw·tU/2 = vmin
      if (t < t3) { const u = t - t2; return C * Math.sin(Math.PI * u / tP) - g * (u / tP) ** 8; }
      if (t < t4) return -g;
      const u = t - t4; let a = 0;
      if (u < tL1) a += K1 * Math.sin(Math.PI * u / tL1);
      if (u < tL) a += K2 * Math.sin(Math.PI * u / tL);
      return a;
    };
    const lines = [
      `Athlete,${athlete}`, `Test,Countermovement Jump`, `Date,${date}`, `Trial,${trial}`,
      `Sample rate (Hz),${1 / dt}`, `Body mass (kg),${mass}`, `Device,Dual force plate`, `Units,N; m/s; m`, ``,
      `Time,Left,Right,,Velocity,Height`
    ];
    let v = 0, h = 0, aPrev = 0;
    const n = Math.round(tEnd / dt);
    for (let i = 0; i <= n; i++) {
      const t = i * dt;
      let a = acc(t);
      if (i > 0) { const vn = v + (a + aPrev) / 2 * dt; h += (v + vn) / 2 * dt; v = vn; }
      aPrev = a;
      if (t >= t4 + tL) v = 0;   // nach der Landung wieder ruhiger Stand (numerischen Rest entfernen)
      let F = (t >= t3 && t < t4) ? 0 : Math.max(0, mass * (a + g));
      if (F > 0) F += rnd() * 10;
      const sh = (t >= t4) ? asym * 1.6 : asym;
      let L = F > 0 ? Math.max(0, F * (0.5 - sh / 2) + rnd() * 5) : Math.abs(rnd() * 3);
      let R = F > 0 ? Math.max(0, F * (0.5 + sh / 2) + rnd() * 5) : Math.abs(rnd() * 3);
      if (single === "L") { L = F > 0 ? Math.max(0, F + rnd() * 5) : Math.abs(rnd() * 3); R = Math.abs(rnd() * 3); }
      if (single === "R") { R = F > 0 ? Math.max(0, F + rnd() * 5) : Math.abs(rnd() * 3); L = Math.abs(rnd() * 3); }
      lines.push(`${t.toFixed(3)},${L.toFixed(2)},${R.toFixed(2)},,${v.toFixed(4)},${(h + 1.0).toFixed(5)}`);
    }
    return { name: `${athlete}-${label}_${date}_Trial${trial}.csv`, text: lines.join("\n") };
  }

  /* ===== Kraft-Zeit-Analyse nach Literatur =====
     Körpergewicht: Mittel der Wiegephase (bis 1 s). Bewegungsbeginn: erste Abweichung > 5 SD
     vom Körpergewicht, minus 30 ms (Owen et al. 2014). Schwerpunktgeschwindigkeit/-weg per
     Impuls-Impuls-Methode (Trapezintegration ab Bewegungsbeginn; Linthorne 2001; Chavda et al. 2018).
     Phasen nach McMahon et al. 2018: Entlastung (Beginn → max. neg. Geschwindigkeit),
     Bremsen (→ Geschwindigkeit 0), Abdruck (→ Absprung), Flug, Landung (→ Geschwindigkeit 0). */
  function analyze(t, opt = {}) {
    const thrTO = opt.takeoffThreshold ?? 20, g = 9.81;
    const T = t.time, F = t.force, FL = t.force_L, FR = t.force_R, n = T.length;
    const out = { ok: false, warnings: [], events: {}, phases: [], metrics: {} };
    const ok = i => Number.isFinite(F[i]) && Number.isFinite(T[i]);
    if (n < 50) { out.warnings.push("Zu wenige Messpunkte."); return out; }
    const t0 = T[0];
    // Abtastintervall als Median der Zeitdifferenzen (robust gegen einzelne Lücken)
    const dtMed = (() => { const d = []; for (let i = 1; i < n; i++) { const x = T[i] - T[i - 1]; if (x > 0) d.push(x); } d.sort((a, b) => a - b); return d[d.length >> 1] || 0.001; })();
    const kOf = sec => Math.max(1, Math.round(sec / dtMed));
    // erste Flugphase (grob) begrenzt das Wiegefenster
    let firstLow = F.findIndex((f, i) => f < thrTO && T[i] - t0 > 0.05);
    if (firstLow < 0) firstLow = n;
    let BW = NaN, SD = NaN, onset = -1;
    // Mittelwert und Standardabweichung (zwei Durchläufe, numerisch stabil)
    const stats = (a, b) => { let sum = 0, k = 0; for (let i = a; i <= b; i++) if (ok(i)) { sum += F[i]; k++; }
      if (!k) return [NaN, NaN]; const mu = sum / k; let q = 0; for (let i = a; i <= b; i++) if (ok(i)) q += (F[i] - mu) ** 2;
      return [mu, Math.sqrt(q / Math.max(1, k - 1))]; };
    // Bewegungsbeginn: erste Abweichung > Schwelle, die mindestens 10 ms bestehen bleibt (Schutz gegen Einzelspitzen)
    const kPers = kOf(0.01);
    const findOnset = thr => { for (let i = 0; i < firstLow; i++) { if (!ok(i) || Math.abs(F[i] - BW) <= thr) continue;
        let k = 1; while (k < kPers && i + k < n && ok(i + k) && Math.abs(F[i + k] - BW) > thr) k++;
        if (k >= kPers) return i; } return -1; };
    // Wiegefenster robust bestimmen: Startschätzung aus den ersten 300 ms, dann so lange verlängern (max. 1 s),
    // bis die Kraft für ≥ 10 ms außerhalb der Ruhetoleranz liegt. Endet 30 ms vor dieser Abweichung.
    // (Vorher: starr die erste Sekunde – beginnt die Bewegung früher, wurden Körpergewicht und SD verfälscht.)
    let kMax = 0; while (kMax < n - 1 && T[kMax + 1] - t0 <= 1.0 && kMax + 1 < firstLow) kMax++;
    let wEnd = Math.min(kMax, kOf(0.3));
    {
      const [bw0, sd0] = stats(0, wEnd);
      const tol = Math.max(5 * sd0, 10);
      let i = wEnd + 1;
      for (; i <= kMax; i++) {
        if (!ok(i) || Math.abs(F[i] - bw0) <= tol) continue;
        let k = 1; while (k < kOf(0.01) && i + k <= kMax && Math.abs(F[i + k] - bw0) > tol) k++;
        if (k >= kOf(0.01)) break;
      }
      wEnd = i > kMax ? kMax : Math.max(5, i - kOf(0.03) - 1);
    }
    for (let iter = 0; iter < 3; iter++) {
      [BW, SD] = stats(0, Math.max(5, wEnd));
      const raw = findOnset(Math.max(5 * SD, 10));
      onset = raw;
      if (raw < 0) break;
      if (raw <= wEnd) { wEnd = Math.max(5, raw - kOf(0.03) - 1); continue; }   // Bewegung im Wiegefenster → Fenster verkürzen
      break;
    }
    // Zu kurze oder unruhige Wiegephase: Körpergewicht aus dem Dateikopf übernehmen, falls vorhanden
    const wDur = T[wEnd] - t0, hdrBW = Number.isFinite(t.meta?.weightKg) ? t.meta.weightKg * g : NaN;
    out.bwSource = "Wiegephase";
    if ((wDur < 0.25 || SD > 30) && Number.isFinite(hdrBW)) {
      BW = hdrBW; out.bwSource = "Dateikopf";
      out.warnings.push(`Wiegephase zu kurz oder unruhig (${Math.round(wDur * 1000)} ms, SD ${SD.toFixed(0)} N) – Körpergewicht aus dem Dateikopf übernommen (${t.meta.weightKg} kg).`);
      const raw = findOnset(Math.max(5 * Math.min(SD, 5), 10)); if (raw >= 0) onset = raw;
    }
    out.bw = BW; out.sd = SD; out.weighEnd = wEnd; out.onsetThreshold = Math.max(5 * SD, 10);
    if (!Number.isFinite(BW) || BW <= 0) { out.warnings.push("Körpergewicht nicht bestimmbar."); return out; }
    if (onset < 0) { out.warnings.push("Kein Bewegungsbeginn gefunden."); return out; }
    const rawOnset = onset;
    // ForceDecks-kompatibel: Integration startet am erkannten Bewegungsbeginn (optional um onsetBackoff s zurückgesetzt)
    onset = Math.max(0, onset - Math.round((opt.onsetBackoff ?? 0) / dtMed));
    if (out.bwSource === "Wiegephase" && Number.isFinite(t.meta?.weightKg) && Math.abs(BW / g - t.meta.weightKg) / t.meta.weightKg > 0.02)
      out.warnings.push(`Körpermasse aus der Wiegephase (${(BW / g).toFixed(1)} kg) weicht um mehr als 2 % vom Dateikopf (${t.meta.weightKg} kg) ab – ruhiges Stehen vor dem Sprung prüfen.`);
    if (T[wEnd] - t0 < 0.3) out.warnings.push(`Wiegephase nur ${((T[wEnd] - t0) * 1000).toFixed(0)} ms – Körpergewicht unsicher (empfohlen ≥ 1 s ruhig stehen).`);
    const m = BW / g;
    // Integration
    const v = new Array(n).fill(0), s = new Array(n).fill(0), P = new Array(n).fill(0);
    for (let i = onset + 1; i < n; i++) {
      const dti = T[i] - T[i - 1];
      const a0 = ok(i - 1) ? (F[i - 1] - BW) / m : 0, a1 = ok(i) ? (F[i] - BW) / m : 0;
      v[i] = v[i - 1] + (a0 + a1) / 2 * dti;
      s[i] = s[i - 1] + (v[i - 1] + v[i]) / 2 * dti;
    }
    for (let i = 0; i < n; i++) P[i] = ok(i) ? F[i] * v[i] : NaN;
    out.v = v; out.s = s; out.P = P; out.m = m;
    // Absprung, Landung
    let to = -1; for (let i = onset + 1; i < n; i++) if (ok(i) && F[i] < thrTO && v[i] > 0) { to = i; break; }
    if (to < 0) { out.warnings.push("Kein Absprung (Kraft < Schwelle) gefunden."); return out; }
    let land = -1;
    for (let i = to + kOf(0.02); i < n; i++) {
      if (!ok(i) || F[i] < thrTO) continue;
      let k = 1; while (k < kOf(0.005) && i + k < n && F[i + k] >= thrTO) k++;
      if (k >= kOf(0.005)) { land = i; break; }
    }
    // Ereignisse
    const argBy = (a, b, arr, cmp) => { let k = -1; for (let i = a; i <= b; i++) if (Number.isFinite(arr[i]) && (k < 0 || cmp(arr[i], arr[k]))) k = i; return k; };
    const pnv = argBy(onset, to - 1, v, (x, y) => x < y);
    // Beginn konzentrisch = letzter Messpunkt mit v < 0 vor dem Nulldurchgang (wie ForceDecks)
    let v0 = -1; for (let i = pnv + 1; i < to; i++) if (v[i] >= 0) { v0 = Math.max(pnv + 1, i - 1); break; }
    if (v0 < 0) { out.warnings.push("Kein Umkehrpunkt (v = 0) gefunden."); return out; }
    const minF = argBy(onset, pnv, F, (x, y) => x <= y);   // bei Plateau der letzte Punkt (wie ForceDecks)
    const pkBrake = argBy(pnv, v0, F, (x, y) => x > y);
    const pkProp = argBy(v0, to - 1, F, (x, y) => x > y);
    const pkF = argBy(onset, to - 1, F, (x, y) => x > y);
    const pkV = argBy(onset, to - 1, v, (x, y) => x > y);
    const pkP = argBy(v0, to - 1, P, (x, y) => x > y);
    const minP = argBy(pnv, v0, P, (x, y) => x < y);
    let landEnd = -1, pkLand = -1;
    if (land > 0) {
      for (let i = land + 1; i < n; i++) if (v[i] >= 0) { landEnd = i; break; }
      if (landEnd < 0) { landEnd = n - 1; out.warnings.push("Ende der Landephase nicht eindeutig (Datenende)."); }
      pkLand = argBy(land, landEnd, F, (x, y) => x > y);
    } else out.warnings.push("Keine Landung in den Daten gefunden.");
    out.events = { onset, minF, pnv, pkBrake, v0, pkProp, pkF, pkV, pkP, to, land, pkLand, landEnd };
    out.phases = [
      { key: "weigh", name: "Wiegen", a: 0, b: onset },
      { key: "unw", name: "Entlastung", a: onset, b: pnv },
      { key: "brake", name: "Bremsen", a: pnv, b: v0 },
      { key: "prop", name: "Abdruck", a: v0, b: to },
      ...(land > 0 ? [{ key: "flight", name: "Flug", a: to, b: land }, { key: "land", name: "Landung", a: land, b: landEnd }] : [])
    ];
    // Hilfsfunktionen
    const integ = (arr, a, b) => { let r = 0; for (let i = a + 1; i <= b; i++) if (Number.isFinite(arr[i]) && Number.isFinite(arr[i - 1])) r += (arr[i] + arr[i - 1]) / 2 * (T[i] - T[i - 1]); return r; };
    const net = F.map(f => f - BW);
    const mean = (arr, a, b) => { let r = 0, k = 0; for (let i = a; i <= b; i++) if (Number.isFinite(arr[i])) { r += arr[i]; k++; } return k ? r / k : NaN; };
    const maxIn = (arr, a, b) => { let r = -Infinity; for (let i = a; i <= b; i++) if (Number.isFinite(arr[i]) && arr[i] > r) r = arr[i]; return r; };
    const dur = (a, b) => T[b] - T[a];
    const asym = (l, r) => { if (!Number.isFinite(l) || !Number.isFinite(r) || Math.max(l, r) <= 0) return { v: NaN, side: "" };
      return { v: (Math.max(l, r) - Math.min(l, r)) / Math.max(l, r) * 100, side: l > r ? "L" : r > l ? "R" : "" }; };
    // RFD-Spitze über 20-ms-Fenster
    const k20 = kOf(0.02);
    let pkRFD = -Infinity, pkRFDi = -1;
    for (let i = onset; i + k20 < to; i++) { const r = (F[i + k20] - F[i]) / (T[i + k20] - T[i]); if (r > pkRFD) { pkRFD = r; pkRFDi = i + k20; } }
    // Absprunggeschwindigkeit: lineare Interpolation im Zeitpunkt, an dem F die Absprungschwelle unterschreitet
    const fr = (F[to - 1] - thrTO) / Math.max(1e-9, F[to - 1] - F[to]);
    const vTO = v[to - 1] + Math.min(1, Math.max(0, fr)) * (v[to] - v[to - 1]);
    const FT = land > 0 ? T[land] - T[to] : NaN;
    const jhTOV = vTO * vTO / (2 * g), jhFT = g * FT * FT / 8;
    const ttt = dur(onset, to);
    const devH = (() => { let mx = -Infinity; for (let i = 0; i < n; i++) if (Number.isFinite(t.disp_raw[i]) && t.disp_raw[i] > mx) mx = t.disp_raw[i]; return mx; })();
    const impU = integ(net, onset, pnv), impB = integ(net, pnv, v0), impP = integ(net, v0, to), impNet = integ(net, onset, to);
    const depth = -s[v0];
    const Mx = out.metrics;
    // Ergebnis / Output
    Mx.bw = BW; Mx.mass = m; Mx.sdW = SD;
    Mx.jhTOV = jhTOV * 100; Mx.jhFT = jhFT * 100; Mx.jhDev = devH * 100; Mx.vTO = vTO; Mx.FT = FT; Mx.ttt = ttt;
    Mx.rsimod = jhTOV / ttt; Mx.ftct = FT / ttt; Mx.impNet = impNet; Mx.impNetRel = impNet / m;
    Mx.sTO = s[to] * 100;
    // Entlastung
    Mx.durU = dur(onset, pnv); Mx.minF = F[minF]; Mx.minFrel = F[minF] / BW * 100; Mx.impU = impU; Mx.pnv = v[pnv];
    // Bremsen
    Mx.durB = dur(pnv, v0); Mx.durEcc = dur(onset, v0); Mx.pkBF = F[pkBrake]; Mx.pkBFrel = F[pkBrake] / m;
    Mx.meanBF = mean(F, pnv, v0); Mx.meanBFrel = Mx.meanBF / m; Mx.impB = impB; Mx.impBrel = impB / m;
    Mx.rfdB = (F[pkBrake] - F[pnv]) / Math.max(1e-6, T[pkBrake] - T[pnv]);
    Mx.Fv0 = F[v0]; Mx.Fv0rel = F[v0] / m; Mx.depth = depth * 100;
    Mx.stiff = (F[v0] - F[pnv]) / Math.max(1e-6, s[pnv] - s[v0]);
    Mx.pkBP = -P[minP]; Mx.pkBPrel = -P[minP] / m; Mx.meanBP = -mean(P, pnv, v0);
    // Abdruck
    Mx.durP = dur(v0, to); Mx.eccCon = Mx.durEcc / Mx.durP;
    Mx.pkPF = F[pkProp]; Mx.pkPFrel = F[pkProp] / m; Mx.meanPF = mean(F, v0, to); Mx.meanPFrel = Mx.meanPF / m;
    Mx.impP = impP; Mx.impPrel = impP / m; Mx.impRatio = impP / impB;
    Mx.pkV = v[pkV]; Mx.meanPV = mean(v, v0, to);
    Mx.pkP = P[pkP]; Mx.pkPrel = P[pkP] / m; Mx.meanPP = mean(P, v0, to); Mx.meanPPrel = Mx.meanPP / m;
    Mx.pkF = F[pkF]; Mx.pkFrel = F[pkF] / m; Mx.tPkF = T[pkF] - T[onset]; Mx.tPkP = T[pkP] - T[onset];
    Mx.pkRFD = pkRFD;
    // Landung
    if (land > 0) {
      Mx.pkLF = F[pkLand]; Mx.pkLFbw = F[pkLand] / BW; Mx.tPkLF = T[pkLand] - T[land];
      Mx.rfdL = (F[pkLand] - F[land]) / Math.max(1e-6, T[pkLand] - T[land]);
      Mx.impL = integ(net, land, landEnd); Mx.durL = dur(land, landEnd); Mx.depthL = (s[land] - s[landEnd]) * 100;
    }
    // Asymmetrien (Bishop et al. 2016: (stark − schwach)/stark × 100)
    Mx.asW = asym(mean(FL, 0, wEnd), mean(FR, 0, wEnd));
    Mx.asU = asym(integ(FL, onset, pnv), integ(FR, onset, pnv));
    Mx.asBF = asym(maxIn(FL, pnv, v0), maxIn(FR, pnv, v0));
    Mx.asBI = asym(integ(FL, pnv, v0), integ(FR, pnv, v0));
    Mx.asPF = asym(maxIn(FL, v0, to), maxIn(FR, v0, to));
    Mx.asPI = asym(integ(FL, v0, to), integ(FR, v0, to));
    if (land > 0) { Mx.asLF = asym(maxIn(FL, land, landEnd), maxIn(FR, land, landEnd)); Mx.asLI = asym(integ(FL, land, landEnd), integ(FR, land, landEnd)); }
    // ===== ForceDecks-Katalog (VALD-Bezeichnungen) =====
    // Phasen: Eccentric = Bewegungsbeginn → v = 0; Eccentric Acceleration (Unloading) = Beginn → max. neg. Geschwindigkeit;
    // Eccentric Deceleration = max. neg. Geschwindigkeit → v = 0; Braking = minimale Kraft → v = 0; Concentric = v = 0 → Absprung.
    {
      const V = {}; Mx.vald = V;
      const ms = x => x * 1000;
      const idxAfter = (a0, sec, lim) => { let j = a0; while (j < lim && T[j] - T[a0] < sec - 1e-9) j++; return j; };
      const rate = (arr, i, j) => (arr[j] - arr[i]) / Math.max(1e-6, T[j] - T[i]);
      const k50 = kOf(0.05);
      const maxRate = (arr, a0, b0, k = k20) => { let r = -Infinity; for (let i = a0; i + k <= b0; i++) { const q = (arr[i + k] - arr[i]) / (T[i + k] - T[i]); if (q > r) r = q; } return r; };
      const pos = arr => arr.map(x => x > 0 ? x : 0);
      const hasL = land > 0 && landEnd > land;
      const mid = idxAfter(v0, (T[to] - T[v0]) / 2, to);
      // Fenster ab Beginn konzentrisch: Impulse enden spätestens am Absprung, RFD/RPD-Fenster laufen wie bei ForceDecks
      // auch über den Absprung hinaus (bei kurzer Konzentrik wird Concentric RFD - 200ms dadurch negativ)
      const c50 = idxAfter(v0, 0.05, to), c100 = idxAfter(v0, 0.1, to);
      const r50 = idxAfter(v0, 0.05, n - 1), r100 = idxAfter(v0, 0.1, n - 1), r200 = idxAfter(v0, 0.2, n - 1);
      const l50 = hasL ? idxAfter(land, 0.05, landEnd) : -1;
      const pkPc = argBy(v0, to - 1, P, (x, y) => x > y);          // Peak Power (konzentrisch)
      // Kennwerte einer Kraftkurve (gesamt oder ein Bein) mit dem zugehörigen Körpergewichtsanteil
      function set(FX, bwx, leg = false) {
        const netX = FX.map(f => f - bwx);
        const bS = leg ? argBy(onset, pnv, FX, (x, y) => x <= y) : minF;   // Bremsbeginn je Bein am eigenen Kraftminimum
        const b100x = idxAfter(bS, 0.1, n - 1);
        const pkC = argBy(v0, to - 1, FX, (x, y) => x > y);
        const cImp = integ(netX, v0, to), cImp100 = integ(netX, v0, c100);
        const p1 = integ(netX, v0, mid), p2 = integ(netX, mid, to);
        const r = {
          cImp, cImp50: integ(netX, v0, c50), cImp100, cImp100r: cImp100 / cImp, cImpAbs: integ(FX, v0, to),
          cMaxRFD: maxRate(FX, v0, to, k50), cMeanF: mean(FX, v0, to), cPkF: FX[pkC],
          cRFD: rate(FX, v0, pkC), cRFD50: rate(FX, v0, r50), cRFD100: rate(FX, v0, r100), cRFD200: rate(FX, v0, r200),
          cTPkF: ms(T[pkC] - T[v0]), ecMFR: mean(FX, onset, v0) / mean(FX, v0, to) * 100,
          eBImp: integ(netX, bS, v0), eBRFD: rate(FX, bS, v0), eBRFD100: rate(FX, bS, b100x),
          eDImp: integ(netX, pnv, v0), eDRFD: rate(FX, pnv, v0), eMeanF: mean(FX, onset, v0), ePkF: maxIn(FX, onset, v0),
          eUImp: integ(netX, onset, pnv), FatPP: FX[pkPc], Fv0: FX[v0], p1, p2, p21: p2 / p1,
          posImp: leg ? 2 * integ(pos(FX.map(f => f - legBW(FX))), onset, n - 1) : integ(pos(netX), onset, n - 1), posTOImp: integ(netX, pnv, to), toPkF: maxIn(FX, onset, to - 1),
          stiff: maxIn(FX, onset, to - 1) / Math.max(1e-6, -s[v0])   // VALD: Takeoff Peak Force / Countermovement Depth
        };
        if (hasL) { const pl = argBy(land, landEnd, FX, (x, y) => x > y);   // VALD: Landeimpuls = Brutto-Impuls vom Aufsetzen bis zur Peak-Landekraft
          Object.assign(r, { lImp: integ(FX, land, pl), lRFD: rate(FX, land, pl), lRFD50: rate(FX, land, l50), lPkF: FX[pl] }); }
        return r;
      }
      // VALD: Impulse gesamt netto (F − KG), je Bein brutto (∫F dt)
      const legBW = FX => mean(FX, 0, wEnd);
      const A = set(F, BW), L = set(FL, 0, true), R = set(FR, 0, true);
      const eD = dur(onset, v0), cD = dur(v0, to), ct = dur(onset, to), bD = dur(minF, v0);
      const pkEccP = argBy(onset, v0, P, (x, y) => x < y), pkEccV = argBy(onset, v0, v, (x, y) => x < y);
      const pkAll = argBy(onset, to - 1, F, (x, y) => x > y);
      const cPkP = P[pkPc], cMeanP = mean(P, v0, to);
      const absP = P.map(Math.abs);
      const jhFTcm = jhFT * 100;
      Object.assign(V, {
        "Bodyweight in Kilograms": m, "Bodyweight in Pounds": m * 2.20462,
        "Braking Phase Duration": ms(bD), "Braking Phase Duration:Concentric Duration": bD / cD * 100, "Braking Phase Duration:Contraction Time": bD / ct * 100,
        "CMJ Stiffness": A.stiff, "Concentric Duration": ms(cD), "Concentric Impulse": A.cImp, "Concentric Impulse (Abs) / BM": A.cImpAbs / m,
        "Concentric Impulse-50ms": A.cImp50, "Concentric Impulse-100ms": A.cImp100, "Concentric Impulse-100ms:Concentric Impulse": A.cImp100r,
        "Concentric Maximum RFD": A.cMaxRFD, "Concentric Mean Force": A.cMeanF, "Concentric Mean Force / BM": A.cMeanF / m,
        "Concentric Mean Power": cMeanP, "Concentric Mean Power / BM": cMeanP / m, "Concentric Mean Velocity": mean(v, v0, to),
        "Concentric Peak Force": A.cPkF, "Concentric Peak Force / BM": A.cPkF / m, "Concentric Peak Velocity": maxIn(v, v0, to),
        "Concentric RFD": A.cRFD, "Concentric RFD / BM": A.cRFD / m, "Concentric RFD - 50ms": A.cRFD50, "Concentric RFD - 100ms": A.cRFD100, "Concentric RFD - 200ms": A.cRFD200,
        "Concentric RPD": rate(P, v0, pkPc), "Concentric RPD / BM": rate(P, v0, pkPc) / m,
        "Concentric RPD - 50ms": rate(P, v0, r50), "Concentric RPD-50ms / BM": rate(P, v0, r50) / m,
        "Concentric RPD - 100ms": rate(P, v0, r100), "Concentric RPD-100ms / BM": rate(P, v0, r100) / m,
        "Concentric Time to Peak Force": A.cTPkF, "Contraction Time": ms(ct), "Contraction Time:Eccentric Duration": ct / eD * 100,
        "Countermovement Depth": s[v0] * 100, "Displacement at Takeoff": s[to] * 100, "Eccentric:Concentric Duration": eD / cD * 100,
        "Eccentric:Concentric Mean Force Ratio": A.ecMFR, "Eccentric Acceleration Phase Duration": dur(onset, pnv),
        "Eccentric Braking Impulse": A.eBImp, "Eccentric Braking RFD": A.eBRFD, "Eccentric Braking RFD / BM": A.eBRFD / m,
        "Eccentric Braking RFD-100ms": A.eBRFD100, "Eccentric Braking RFD-100ms / BM": A.eBRFD100 / m,
        "Eccentric Deceleration Impulse": A.eDImp, "Eccentric Deceleration Impulse / BM": A.eDImp / m, "Eccentric Deceleration Mean Force": mean(F, pnv, v0),
        "Eccentric Deceleration Phase Duration": dur(pnv, v0), "Eccentric Deceleration RFD": A.eDRFD, "Eccentric Deceleration RFD / BM": A.eDRFD / m,
        "Eccentric Duration": ms(eD), "Eccentric Mean Braking Force": mean(F, minF, v0), "Eccentric Mean Force": A.eMeanF,
        "Eccentric Mean Power": mean(absP, onset, v0), "Eccentric Mean Power / BM": mean(absP, onset, v0) / m,
        "Eccentric Peak Force": A.ePkF, "Eccentric Peak Force / BM": A.ePkF / m, "Eccentric Peak Power": -P[pkEccP], "Eccentric Peak Power / BM": -P[pkEccP] / m,
        "Eccentric Peak Power:Concentric Peak Power": Math.abs(P[pkEccP]) / cPkP, "Eccentric Peak Velocity": v[pkEccV],
        "Eccentric Unloading Impulse": A.eUImp, "Flight Time": ms(FT), "Flight Time:Contraction Time": FT / ct, "FlightTime:Eccentric Duration": FT / eD,
        "Force at Peak Power": F[pkPc], "Force at Zero Velocity": F[v0], "Force at Zero Velocity / BM": F[v0] / m,
        "Jump Height (Flight Time)": jhFTcm, "Jump Height (Flight Time) in Inches": jhFTcm / 2.54,
        "Jump Height (Imp-Dis)": (land > 0 ? maxIn(s, to, land) - s[to] : jhTOV) * 100, "Jump Height (Imp-Mom)": jhTOV * 100, "Jump Height (Imp-Mom) in Inches": jhTOV * 100 / 2.54,
        "Lower-Limb Stiffness": (F[v0] - F[minF]) / Math.max(1e-6, -s[v0]), "Mean Eccentric+Concentric Power:Time": mean(absP, onset, to) / ct,
        "Minimum Eccentric Force": F[minF], "Movement Start to Peak Force": T[pkAll] - T[onset], "Movement Start to Peak Power": T[pkPc] - T[onset],
        "P1 Concentric Impulse": A.p1, "P2 Concentric Impulse": A.p2, "P2 Concentric Impulse:P1 Concentric Impulse": A.p21,
        "Peak Net Takeoff Force / BM": (F[pkAll] - BW) / m, "Peak Power": cPkP, "Peak Power / BM": cPkP / m,
        "Peak Takeoff Acceleration": (F[pkAll] - BW) / m, "Positive Impulse": A.posImp, "Positive Takeoff Impulse": A.posTOImp,
        "RSI-modified": jhFT / ct, "RSI-modified (Imp-Mom)": jhTOV / ct,
        "Start of Braking Phase": T[minF], "Start of Concentric Phase": T[v0], "Start of Eccentric Deceleration Phase": T[pnv],
        "Start of Integration": T[onset], "Start of Movement": T[rawOnset], "Start of Movement Detection Threshold": out.onsetThreshold,
        "Takeoff Peak Force": A.toPkF, "Takeoff Peak Force / BM": A.toPkF / m, "Time to Braking Phase": T[minF] - T[onset],
        "Total Work": integ(absP, onset, to), "Velocity at Peak Power": v[pkPc], "Vertical Velocity at Takeoff": vTO
      });
      if (hasL) {
        // VALD: Landephase vom Aufsetzen bis zum Ende der Aufnahme; Landeimpuls bis zur Peak-Landekraft
        const pl = argBy(land, landEnd, F, (x, y) => x > y), lE = n - 1;
        const minLP = argBy(land, lE, P, (x, y) => x < y);
        Object.assign(V, {
          "Jump Height (FT) Relative Landing RFD": A.lRFD / jhFTcm, "Jump Height (FT) Relative Peak Landing Force": A.lPkF / jhFTcm,
          "Landing Impulse": A.lImp, "Landing Net Peak Force / BM": (F[pl] - BW) / m, "Landing RFD": A.lRFD, "Landing RFD 50ms": A.lRFD50,
          "Mean Landing Acceleration": (mean(F, land, lE) - BW) / m, "Mean Landing Power": mean(absP, land, lE), "Mean Landing Velocity": mean(v, land, lE),
          "Peak Landing Acceleration": (F[pl] - BW) / m, "Peak Landing Force": F[pl],
          "Peak Landing Force / BM": F[pl] / m, "Peak Landing Power": -P[minLP], "Peak Landing Velocity": maxIn(v, land, lE)
        });
      }
      // Links/Rechts und Asymmetrien
      const asA = (l, r) => asym(Math.abs(l), Math.abs(r));
      for (const [name, key, , , lName, rName] of LEG_TAKEOFF.concat(LEG_LANDING)) {
        if (L[key] === undefined) continue;
        V[lName || `${name} (Left)`] = L[key]; V[rName || `${name} (Right)`] = R[key];
      }
      for (const [name, key] of ASYM_TAKEOFF.concat(ASYM_LANDING)) if (L[key] !== undefined) V[name] = asA(L[key], R[key]);
    }
    // Plausibilität
    if (Number.isFinite(jhFT) && jhTOV > 0 && Math.abs(jhFT - jhTOV) / jhTOV > 0.15)
      out.warnings.push(`Sprunghöhe nach Flugzeit und Impuls weichen um ${(Math.abs(jhFT - jhTOV) * 100).toFixed(1)} cm ab – Körpergewicht oder Schwelle prüfen.`);
    out.events.pkRFD = pkRFDi;
    out.ok = true;
    return out;

  }

  // Parameterkatalog (Anzeige-Reihenfolge, Einheit, Dezimalstellen)
  const METRICS = [
    ["Körper & Wiegephase", [
      ["bw", "Körpergewicht", "N", 0], ["mass", "Körpermasse", "kg", 1], ["sdW", "SD Wiegephase", "N", 1], ["asW", "Asymmetrie Standkraft", "%", 1]]],
    ["Sprungleistung", [
      ["jhTOV", "Sprunghöhe (Impuls-Impuls, TOV)", "cm", 1], ["jhFT", "Sprunghöhe (Flugzeit)", "cm", 1], ["jhDev", "Sprunghöhe (Height-Spalte, max − Stand)", "cm", 1],
      ["vTO", "Absprunggeschwindigkeit", "m/s", 2], ["FT", "Flugzeit", "s", 3], ["ttt", "Zeit bis Absprung (Kontraktionszeit)", "s", 3],
      ["rsimod", "RSImod (Höhe TOV / Zeit bis Absprung)", "m/s", 2], ["ftct", "Flugzeit : Kontraktionszeit", "", 2],
      ["impNet", "Netto-Impuls (Beginn → Absprung)", "N·s", 1], ["impNetRel", "Netto-Impuls relativ", "N·s/kg", 2], ["sTO", "KSP-Anhebung bis Absprung", "cm", 1]]],
    ["Entlastung (Unweighting)", [
      ["durU", "Dauer Entlastung", "s", 3], ["minF", "Minimale Kraft", "N", 0], ["minFrel", "Minimale Kraft relativ", "% KG", 1],
      ["impU", "Entlastungsimpuls (netto)", "N·s", 1], ["pnv", "Max. negative Geschwindigkeit", "m/s", 2], ["asU", "Asymmetrie Entlastungsimpuls", "%", 1]]],
    ["Bremsen (exzentrisch)", [
      ["durB", "Dauer Bremsphase", "s", 3], ["durEcc", "Exzentrische Dauer (Entlastung + Bremsen)", "s", 3],
      ["pkBF", "Peak-Bremskraft", "N", 0], ["pkBFrel", "Peak-Bremskraft relativ", "N/kg", 2], ["meanBF", "Mittlere Bremskraft", "N", 0], ["meanBFrel", "Mittlere Bremskraft relativ", "N/kg", 2],
      ["impB", "Bremsimpuls (netto)", "N·s", 1], ["impBrel", "Bremsimpuls relativ", "N·s/kg", 2], ["rfdB", "Brems-RFD (Beginn → Peak)", "N/s", 0],
      ["Fv0", "Kraft bei Geschwindigkeit 0", "N", 0], ["Fv0rel", "Kraft bei v = 0 relativ", "N/kg", 2], ["depth", "Countermovement-Tiefe (KSP)", "cm", 1],
      ["stiff", "Exzentrische Steifigkeit (ΔF / Δs)", "N/m", 0], ["pkBP", "Peak-Bremsleistung", "W", 0], ["pkBPrel", "Peak-Bremsleistung relativ", "W/kg", 1], ["meanBP", "Mittlere Bremsleistung", "W", 0],
      ["asBF", "Asymmetrie Peak-Bremskraft", "%", 1], ["asBI", "Asymmetrie Bremsimpuls", "%", 1]]],
    ["Abdruck (konzentrisch)", [
      ["durP", "Dauer Abdruck", "s", 3], ["eccCon", "Exzentrisch : Konzentrisch (Dauer)", "", 2],
      ["pkPF", "Peak-Abdruckkraft", "N", 0], ["pkPFrel", "Peak-Abdruckkraft relativ", "N/kg", 2], ["meanPF", "Mittlere Abdruckkraft", "N", 0], ["meanPFrel", "Mittlere Abdruckkraft relativ", "N/kg", 2],
      ["impP", "Abdruckimpuls (netto)", "N·s", 1], ["impPrel", "Abdruckimpuls relativ", "N·s/kg", 2], ["impRatio", "Impulsverhältnis Abdruck : Bremsen", "", 2],
      ["pkV", "Peak-Geschwindigkeit", "m/s", 2], ["meanPV", "Mittlere Abdruckgeschwindigkeit", "m/s", 2],
      ["pkP", "Peak-Leistung", "W", 0], ["pkPrel", "Peak-Leistung relativ", "W/kg", 1], ["meanPP", "Mittlere Abdruckleistung", "W", 0], ["meanPPrel", "Mittlere Abdruckleistung relativ", "W/kg", 1],
      ["pkF", "Peak-Kraft gesamt (vor Absprung)", "N", 0], ["pkFrel", "Peak-Kraft relativ", "N/kg", 2], ["tPkF", "Zeit bis Peak-Kraft", "s", 3], ["tPkP", "Zeit bis Peak-Leistung", "s", 3],
      ["pkRFD", "Peak-RFD (20-ms-Fenster)", "N/s", 0], ["asPF", "Asymmetrie Peak-Abdruckkraft", "%", 1], ["asPI", "Asymmetrie Abdruckimpuls", "%", 1]]],
    ["Landung", [
      ["pkLF", "Peak-Landekraft", "N", 0], ["pkLFbw", "Peak-Landekraft relativ", "× KG", 2], ["tPkLF", "Zeit bis Peak-Landekraft", "s", 3],
      ["rfdL", "Lande-RFD", "N/s", 0], ["impL", "Landeimpuls (netto)", "N·s", 1], ["durL", "Dauer Landephase (bis v = 0)", "s", 3], ["depthL", "Landetiefe (KSP)", "cm", 1],
      ["asLF", "Asymmetrie Peak-Landekraft", "%", 1], ["asLI", "Asymmetrie Landeimpuls", "%", 1]]]
  ];


  // ===== ForceDecks-Katalog: Kategorien, Namen, Einheiten wie im VALD-Export =====
  // [Name, Schlüssel, Einheit, Dezimalstellen, (Name links), (Name rechts)]
  const LEG_TAKEOFF = [
    ["CMJ Limb Stiffness", "stiff", "N/m", 0, "CMJ Left-Limb Stiffness", "CMJ Right-Limb Stiffness"],
    ["Concentric Impulse", "cImp", "N s", 1], ["Concentric Impulse-50ms", "cImp50", "N s", 1], ["Concentric Impulse-100ms", "cImp100", "N s", 1],
    ["Concentric Impulse-100ms:Concentric Impulse", "cImp100r", "", 2], ["Concentric Maximum RFD", "cMaxRFD", "N/s", 0],
    ["Concentric Mean Force", "cMeanF", "N", 0], ["Concentric Peak Force", "cPkF", "N", 0], ["Concentric RFD", "cRFD", "N/s", 0],
    ["Concentric RFD - 50ms", "cRFD50", "N/s", 0], ["Concentric RFD - 100ms", "cRFD100", "N/s", 0], ["Concentric RFD - 200ms", "cRFD200", "N/s", 0],
    ["Concentric Time to Peak Force", "cTPkF", "ms", 0], ["Eccentric:Concentric Mean Force Ratio", "ecMFR", "%", 1],
    ["Eccentric Braking Impulse", "eBImp", "N s", 1], ["Eccentric Braking RFD", "eBRFD", "N/s", 0], ["Eccentric Braking RFD-100ms", "eBRFD100", "N/s", 0],
    ["Eccentric Deceleration Impulse", "eDImp", "N s", 1], ["Eccentric Deceleration RFD", "eDRFD", "N/s", 0],
    ["Eccentric Mean Force", "eMeanF", "N", 0], ["Eccentric Peak Force", "ePkF", "N", 0], ["Eccentric Unloading Impulse", "eUImp", "N s", 1],
    ["Force at Peak Power", "FatPP", "N", 0], ["Force at Zero Velocity", "Fv0", "N", 0],
    ["P1 Concentric Impulse", "p1", "N s", 1], ["P2 Concentric Impulse", "p2", "N s", 1], ["P2 Concentric Impulse:P1 Concentric Impulse", "p21", "", 2],
    ["Positive Impulse", "posImp", "N s", 1], ["Positive Takeoff Impulse", "posTOImp", "N s", 1], ["Takeoff Peak Force", "toPkF", "N", 0]];
  const LEG_LANDING = [["Landing Impulse", "lImp", "N s", 1], ["Landing RFD", "lRFD", "N/s", 0], ["Peak Landing Force", "lPkF", "N", 0]];
  const ASYM_TAKEOFF = [
    ["CMJ Stiffness Asymmetry", "stiff"], ["Concentric Impulse-50ms Asymmetry", "cImp50"], ["Concentric Impulse-100ms:Concentric Impulse (Asymmetry)", "cImp100r"],
    ["Concentric Impulse-100ms Asymmetry", "cImp100"], ["Concentric Impulse Asymmetry", "cImp"], ["Concentric Maximum RFD Asymmetry", "cMaxRFD"],
    ["Concentric Mean Force Asymmetry", "cMeanF"], ["Concentric Peak Force Asymmetry", "cPkF"], ["Concentric RFD - 50ms (Asymmetry)", "cRFD50"],
    ["Concentric RFD - 100ms (Asymmetry)", "cRFD100"], ["Concentric RFD - 200ms (Asymmetry)", "cRFD200"], ["Concentric RFD Asymmetry", "cRFD"],
    ["Concentric Time to Peak Force Asymmetry", "cTPkF"], ["Eccentric:Concentric Mean Force Ratio Asymmetry", "ecMFR"],
    ["Eccentric Braking Impulse (Asymmetry)", "eBImp"], ["Eccentric Braking RFD-100ms Asymmetry", "eBRFD100"], ["Eccentric Braking RFD Asymmetry", "eBRFD"],
    ["Eccentric Deceleration Impulse (Asymmetry)", "eDImp"], ["Eccentric Deceleration RFD Asymmetry", "eDRFD"], ["Eccentric Mean Force Asymmetry", "eMeanF"],
    ["Eccentric Peak Force Asymmetry", "ePkF"], ["Eccentric Unloading Impulse (Asymmetry)", "eUImp"], ["Force at Peak Power Asymmetry", "FatPP"],
    ["Force at Zero Velocity Asymmetry", "Fv0"], ["P1 Concentric Impulse Asymmetry", "p1"], ["P2 Concentric Impulse:P1 Concentric Impulse (Asymmetry)", "p21"],
    ["P2 Concentric Impulse Asymmetry", "p2"], ["Positive Impulse Asymmetry", "posImp"], ["Positive Takeoff Impulse Asymmetry", "posTOImp"],
    ["Takeoff Peak Force Asymmetry", "toPkF"]];
  const ASYM_LANDING = [["Landing Impulse (Asymmetry)", "lImp"], ["Landing RFD Asymmetry", "lRFD"], ["Peak Landing Force Asymmetry", "lPkF"]];

  const VALD_CATALOG = (() => {
    const cats = [];
    cats.push(["General Jump Results", [["Bodyweight in Kilograms", "kg", 2], ["Bodyweight in Pounds", "lbs", 1]]]);
    cats.push(["Performance - Takeoff Phase", [
      ["Braking Phase Duration", "ms", 0], ["Braking Phase Duration:Concentric Duration", "%", 1], ["Braking Phase Duration:Contraction Time", "%", 1],
      ["CMJ Stiffness", "N/m", 0], ["Concentric Duration", "ms", 0], ["Concentric Impulse", "N s", 1], ["Concentric Impulse (Abs) / BM", "N s/kg", 2],
      ["Concentric Impulse-50ms", "N s", 1], ["Concentric Impulse-100ms", "N s", 1], ["Concentric Impulse-100ms:Concentric Impulse", "", 2],
      ["Concentric Maximum RFD", "N/s", 0], ["Concentric Mean Force", "N", 0], ["Concentric Mean Force / BM", "N/kg", 2],
      ["Concentric Mean Power", "W", 0], ["Concentric Mean Power / BM", "W/kg", 2], ["Concentric Mean Velocity", "m/s", 2],
      ["Concentric Peak Force", "N", 0], ["Concentric Peak Force / BM", "N/kg", 2], ["Concentric Peak Velocity", "m/s", 2],
      ["Concentric RFD", "N/s", 0], ["Concentric RFD / BM", "N/s/kg", 1], ["Concentric RFD - 50ms", "N/s", 0], ["Concentric RFD - 100ms", "N/s", 0], ["Concentric RFD - 200ms", "N/s", 0],
      ["Concentric RPD", "W/s", 0], ["Concentric RPD / BM", "W/s/kg", 1], ["Concentric RPD - 50ms", "W/s", 0], ["Concentric RPD-50ms / BM", "W/s/kg", 1],
      ["Concentric RPD - 100ms", "W/s", 0], ["Concentric RPD-100ms / BM", "W/s/kg", 1], ["Concentric Time to Peak Force", "ms", 0],
      ["Contraction Time", "ms", 0], ["Contraction Time:Eccentric Duration", "%", 1], ["Countermovement Depth", "cm", 1], ["Displacement at Takeoff", "cm", 1],
      ["Eccentric:Concentric Duration", "%", 1], ["Eccentric:Concentric Mean Force Ratio", "%", 1], ["Eccentric Acceleration Phase Duration", "s", 3],
      ["Eccentric Braking Impulse", "N s", 1], ["Eccentric Braking RFD", "N/s", 0], ["Eccentric Braking RFD / BM", "N/s/kg", 1],
      ["Eccentric Braking RFD-100ms", "N/s", 0], ["Eccentric Braking RFD-100ms / BM", "N/s/kg", 1], ["Eccentric Deceleration Impulse", "N s", 1],
      ["Eccentric Deceleration Impulse / BM", "N s/kg", 2], ["Eccentric Deceleration Mean Force", "N", 0], ["Eccentric Deceleration Phase Duration", "s", 3],
      ["Eccentric Deceleration RFD", "N/s", 0], ["Eccentric Deceleration RFD / BM", "N/s/kg", 1], ["Eccentric Duration", "ms", 0],
      ["Eccentric Mean Braking Force", "N", 0], ["Eccentric Mean Force", "N", 0], ["Eccentric Mean Power", "W", 0], ["Eccentric Mean Power / BM", "W/kg", 2],
      ["Eccentric Peak Force", "N", 0], ["Eccentric Peak Force / BM", "N/kg", 2], ["Eccentric Peak Power", "W", 0], ["Eccentric Peak Power / BM", "W/kg", 2],
      ["Eccentric Peak Power:Concentric Peak Power", "", 2], ["Eccentric Peak Velocity", "m/s", 2], ["Eccentric Unloading Impulse", "N s", 1],
      ["Flight Time", "ms", 0], ["Flight Time:Contraction Time", "", 2], ["FlightTime:Eccentric Duration", "", 2],
      ["Force at Peak Power", "N", 0], ["Force at Zero Velocity", "N", 0], ["Force at Zero Velocity / BM", "N/kg", 2],
      ["Jump Height (Flight Time)", "cm", 1], ["Jump Height (Flight Time) in Inches", "in", 1], ["Jump Height (Imp-Dis)", "cm", 1],
      ["Jump Height (Imp-Mom)", "cm", 1], ["Jump Height (Imp-Mom) in Inches", "in", 1], ["Lower-Limb Stiffness", "N/m", 0],
      ["Mean Eccentric+Concentric Power:Time", "W/s", 0], ["Minimum Eccentric Force", "N", 0], ["Movement Start to Peak Force", "s", 3],
      ["Movement Start to Peak Power", "s", 3], ["P1 Concentric Impulse", "N s", 1], ["P2 Concentric Impulse", "N s", 1],
      ["P2 Concentric Impulse:P1 Concentric Impulse", "", 2], ["Peak Net Takeoff Force / BM", "N/kg", 2], ["Peak Power", "W", 0], ["Peak Power / BM", "W/kg", 2],
      ["Peak Takeoff Acceleration", "m/s²", 2], ["Positive Impulse", "N s", 1], ["Positive Takeoff Impulse", "N s", 1],
      ["RSI-modified", "m/s", 2], ["RSI-modified (Imp-Mom)", "m/s", 2], ["Start of Braking Phase", "s", 3], ["Start of Concentric Phase", "s", 3],
      ["Start of Eccentric Deceleration Phase", "s", 3], ["Start of Integration", "s", 3], ["Start of Movement", "s", 3],
      ["Start of Movement Detection Threshold", "N", 1], ["Takeoff Peak Force", "N", 0], ["Takeoff Peak Force / BM", "N/kg", 2],
      ["Time to Braking Phase", "s", 3], ["Total Work", "J", 0], ["Velocity at Peak Power", "m/s", 2], ["Vertical Velocity at Takeoff", "m/s", 2]]]);
    cats.push(["Performance - Landing Phase", [
      ["Jump Height (FT) Relative Landing RFD", "N/s/cm", 0], ["Jump Height (FT) Relative Peak Landing Force", "N/cm", 1], ["Landing Impulse", "N s", 1],
      ["Landing Net Peak Force / BM", "N/kg", 2], ["Landing RFD", "N/s", 0], ["Landing RFD 50ms", "N/s", 0], ["Mean Landing Acceleration", "m/s²", 2], ["Mean Landing Power", "W", 0], ["Mean Landing Velocity", "m/s", 2],
      ["Peak Landing Acceleration", "m/s²", 2], ["Peak Landing Force", "N", 0], ["Peak Landing Force / BM", "N/kg", 2],
      ["Peak Landing Power", "W", 0], ["Peak Landing Velocity", "m/s", 2]]]);
    cats.push(["Asymmetry - Takeoff Phase", ASYM_TAKEOFF.map(([nm]) => [nm, "% L,R", 1])]);
    cats.push(["Asymmetry - Landing Phase", ASYM_LANDING.map(([nm]) => [nm, "% L,R", 1])]);
    const lr = list => list.flatMap(([nm, , u, dp, l, r]) => [[l || `${nm} (Left)`, u, dp], [r || `${nm} (Right)`, u, dp]]);
    cats.push(["Left and Right Results - Takeoff Phase", lr(LEG_TAKEOFF)]);
    cats.push(["Left and Right Results - Landing Phase", lr(LEG_LANDING)]);
    return cats;
  })();
  // Voreinstellung = die im VALD-Screenshot angehakten Metriken
  const VALD_DEFAULT = [
    "Bodyweight in Kilograms", "Concentric Duration", "Concentric Impulse", "Concentric Impulse-100ms", "Concentric Maximum RFD", "Concentric Mean Force",
    "Concentric Mean Force / BM", "Concentric Mean Power", "Concentric Mean Power / BM", "Concentric Peak Force", "Concentric Peak Force / BM",
    "Concentric Peak Velocity", "Concentric RFD", "Concentric RFD / BM", "Concentric Time to Peak Force", "Contraction Time", "Contraction Time:Eccentric Duration",
    "Countermovement Depth", "Eccentric:Concentric Duration", "Eccentric Braking RFD", "Eccentric Braking RFD / BM", "Eccentric Deceleration Mean Force",
    "Eccentric Duration", "Eccentric Mean Braking Force", "Eccentric Mean Force", "Eccentric Mean Power", "Eccentric Mean Power / BM", "Eccentric Peak Force",
    "Eccentric Peak Force / BM", "Eccentric Peak Power", "Eccentric Peak Power / BM", "Eccentric Peak Velocity", "Flight Time", "Flight Time:Contraction Time",
    "Jump Height (Flight Time)", "Jump Height (Imp-Mom)", "Movement Start to Peak Force", "Movement Start to Peak Power", "Peak Net Takeoff Force / BM",
    "Peak Power", "Peak Power / BM", "Positive Takeoff Impulse", "RSI-modified (Imp-Mom)", "Vertical Velocity at Takeoff", "Peak Landing Force",
    "Concentric Maximum RFD Asymmetry", "Concentric Mean Force Asymmetry", "Concentric RFD Asymmetry", "Concentric Time to Peak Force Asymmetry",
    "Eccentric Mean Force Asymmetry", "Peak Landing Force Asymmetry",
    "Concentric Maximum RFD (Left)", "Concentric Maximum RFD (Right)", "Concentric Mean Force (Left)", "Concentric Mean Force (Right)",
    "Concentric Peak Force (Left)", "Concentric Peak Force (Right)", "Concentric RFD (Left)", "Concentric RFD (Right)",
    "Concentric Time to Peak Force (Left)", "Concentric Time to Peak Force (Right)", "Eccentric Mean Force (Left)", "Eccentric Mean Force (Right)",
    "Peak Landing Force (Left)", "Peak Landing Force (Right)"];


  /* ===== Schriftliche Beurteilung des Force-Displacement-Loops =====
     Grundlage: Projektdokument „Displacement“ (Hawkin-Dynamics-Artikel + deutsche Ergänzung):
     – Ampel-Profile rot/gelb/grün (Tabelle 1: drei Beispielathleten),
     – Strategien: elastisch-reaktiv (schmale, steile Bremsschleife), muskulär-kraftbasiert (breite, flache Schleife,
       große Tiefe), ermüdet/verletzt (asymmetrische oder abgeflachte Bremsphase),
     – Ermüdungshinweis: Bremsphase „sackt ein“, bevor die Sprunghöhe sinkt.
     Die Schwellen sind Orientierungswerte, keine Normen. */
  const REF_PROFILES = {
    red:   { jh: 0.269, mt: 0.728, rsi: 0.369, unw: 42, brk: 20, prop: 38, pkF: 23.97 },
    amber: { jh: 0.462, mt: 0.697, rsi: 0.667, unw: 47, brk: 19, prop: 35, pkF: 28.13 },
    green: { jh: 0.654, mt: 0.637, rsi: 1.026, unw: 56, brk: 15, prop: 28, pkF: 37.59 }
  };
  const SCALE_DEF = [
    ["jh", "Sprunghöhe", "cm", 1, 100, 2], ["rsi", "RSImod", "m/s", 2, 1, 2], ["mt", "Bewegungszeit", "ms", 0, 1000, 1],
    ["pkF", "Peak-Kraft relativ", "N/kg", 1, 1, 1], ["unw", "Anteil Entlastung", "%", 0, 1, 0.5], ["brk", "Anteil Bremsen", "%", 0, 1, 0.5], ["prop", "Anteil Abdruck", "%", 0, 1, 0.5]];
  const STRAT_REF = { slenderHi: 9, slenderLo: 6.5, dRfdHi: 80, dRfdLo: 50, dDurLo: 0.16, dDurHi: 0.22, depthLo: 30, depthHi: 35 };
  const f = (v, dp = 1) => Number.isFinite(v) ? v.toLocaleString("de-DE", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "–";
  const pct = x => `${x > 0 ? "+" : ""}${f(x, 0)} %`;

  function loopFeatures(t, a) {
    const M = a.metrics, V = M.vald || {}, E = a.events, T = t.time, BW = a.bw;
    const mt = M.ttt, feat = {
      jh: M.jhTOV / 100, mt, rsi: M.rsimod, pkF: M.pkFrel,
      unw: M.durU / mt * 100, brk: M.durB / mt * 100, prop: M.durP / mt * 100,
      minFbw: M.minF / BW, pnv: M.pnv, durU: M.durU, fv0bw: t.force[E.v0] / BW, depth: -a.s[E.v0] * 100,
      dDur: T[E.v0] - T[E.pnv], dRfd: V["Eccentric Deceleration RFD / BM"], bRfd: V["Eccentric Braking RFD / BM"],
      cMeanBW: V["Concentric Mean Force"] / BW, cPkBW: V["Concentric Peak Force"] / BW, cDur: M.durP, cRfdBM: V["Concentric RFD / BM"],
      vTO: M.vTO, sTO: M.sTO, pkFbw: M.pkF / BW,
      asBrake: Math.max(V["Eccentric Braking Impulse (Asymmetry)"]?.v ?? NaN, V["Force at Zero Velocity Asymmetry"]?.v ?? NaN),
      asBrakeSide: V["Eccentric Braking Impulse (Asymmetry)"]?.side || "", asProp: V["Concentric Impulse Asymmetry"]?.v, asPropSide: V["Concentric Impulse Asymmetry"]?.side || "",
      asLand: V["Peak Landing Force Asymmetry"]?.v, asLandSide: V["Peak Landing Force Asymmetry"]?.side || ""
    };
    feat.slender = feat.fv0bw / Math.max(1e-6, feat.depth / 100);          // Schleifen-Schlankheit: Kraft (× KG) pro m Absenkung
    return feat;
  }
  // Position auf der Skala rot (0) – gelb (0,5) – grün (1), stückweise linear zwischen den Beispielprofilen
  function scalePos(key, x) {
    const r = REF_PROFILES.red[key], am = REF_PROFILES.amber[key], g = REF_PROFILES.green[key];
    if (!Number.isFinite(x)) return NaN;
    const p = (x - r) / (am - r) * 0.5;
    const q = 0.5 + (x - am) / (g - am) * 0.5;
    const pos = ((am - r) * (x - am) <= 0) ? p : q;   // Seite relativ zum gelben Profil
    return Math.max(-0.15, Math.min(1.15, pos));
  }

  function assess(t, a, ref = null) {
    if (!a || !a.ok) return { ok: false, sections: [{ title: "Beurteilung nicht möglich", text: (a && a.warnings.join(" ")) || "Keine Analyse." }] };
    const x = loopFeatures(t, a), S = STRAT_REF;
    // --- Ampel ---
    const scales = SCALE_DEF.map(([k, label, unit, dp, mul, w]) => ({ key: k, label, unit, dp, w, value: x[k] * mul, pos: scalePos(k, x[k]),
      refs: ["red", "amber", "green"].map(c => REF_PROFILES[c][k] * mul) }));
    const wsum = scales.reduce((s, c) => s + (Number.isFinite(c.pos) ? c.w : 0), 0);
    const score = scales.reduce((s, c) => s + (Number.isFinite(c.pos) ? c.w * c.pos : 0), 0) / wsum;
    const level = score < 0.3 ? { key: "red", label: "Rot", word: "roten" } : score < 0.7 ? { key: "amber", label: "Gelb", word: "gelben" } : { key: "green", label: "Grün", word: "grünen" };
    level.score = score;
    // --- Strategie ---
    const el = [x.slender >= S.slenderHi, x.dRfd >= S.dRfdHi, x.dDur <= S.dDurLo, x.depth <= S.depthLo].filter(Boolean).length;
    const mu = [x.slender <= S.slenderLo, x.dRfd <= S.dRfdLo, x.dDur >= S.dDurHi, x.depth >= S.depthHi].filter(Boolean).length;
    let strategy;
    if (el >= 3 && mu === 0) strategy = { key: "elastic", label: "Elastisch-reaktiv" };
    else if (mu >= 3 && el === 0) strategy = { key: "muscular", label: "Muskulär-kraftbasiert" };
    else if (el > mu) strategy = { key: "elastic-lean", label: "Eher elastisch-reaktiv" };
    else if (mu > el) strategy = { key: "muscular-lean", label: "Eher kraftbasiert" };
    else strategy = { key: "mixed", label: "Ausgewogen" };
    // --- Hinweise (Asymmetrie, Verlauf) ---
    const flags = [];
    const asCls = v => v > 15 ? "deutlich" : v > 10 ? "erhöht" : null;
    if (asCls(x.asBrake)) flags.push({ key: "asym-brake", severity: x.asBrake > 15 ? 2 : 1, text: `${asCls(x.asBrake) === "deutlich" ? "Deutlich" : "Erhöht"} asymmetrische Bremsphase (${f(x.asBrake)} %, stärker ${x.asBrakeSide === "L" ? "links" : "rechts"})` });
    let trend = null;
    if (ref && ref.features) {
      const r = ref.features, d = k => (x[k] - r[k]) / Math.abs(r[k]) * 100;
      trend = { dJh: d("jh"), dRfd: d("dRfd"), dFv0: d("fv0bw"), dDepth: d("depth"), dDur: d("dDur"), dRsi: d("rsi"), label: ref.label };
      if ((trend.dRfd <= -15 || trend.dFv0 <= -10) && Math.abs(trend.dJh) <= 5)
        flags.push({ key: "fatigue", severity: 2, text: "Bremsphase gegenüber der Referenz abgeflacht bei stabiler Sprunghöhe – möglicher Hinweis auf neuromuskuläre Ermüdung" });
    }
    // --- Texte ---
    const sec = [];
    const dirWord = { elastic: "eine elastisch-reaktive Strategie", "elastic-lean": "eine eher elastisch-reaktive Strategie", muscular: "eine muskulär-kraftbasierte Strategie", "muscular-lean": "eine eher kraftbasierte Strategie", mixed: "eine ausgewogene Strategie ohne klare Ausprägung" }[strategy.key];
    const strongest = [...scales].filter(c => Number.isFinite(c.pos)).sort((p, q) => q.pos - p.pos);
    sec.push({ title: "Gesamteinordnung", text:
      `Mit ${f(x.jh * 100)} cm Sprunghöhe (Impuls-Impuls), einem RSImod von ${f(x.rsi, 2)} und einer Bewegungszeit von ${f(x.mt * 1000, 0)} ms liegt der Sprung insgesamt im Bereich des ${level.word} Beispielprofils (Einordnungswert ${f(score * 100, 0)} von 100). ` +
      `Im Vergleich zu den Beispielprofilen am günstigsten: ${strongest[0].label} (${f(strongest[0].value, strongest[0].dp)} ${strongest[0].unit}); am ungünstigsten: ${strongest[strongest.length - 1].label} (${f(strongest[strongest.length - 1].value, strongest[strongest.length - 1].dp)} ${strongest[strongest.length - 1].unit}). ` +
      `Die Form der Kraft-Weg-Schleife spricht für ${dirWord}.` });
    sec.push({ title: "Aufbau der Schleife", text:
      `Die Schleife beginnt im ruhigen Stand bei 1,0 × Körpergewicht und einer Verschiebung von 0 cm (Punkt a). Sie reicht bis zu einer Schwerpunktabsenkung von ${f(x.depth)} cm (Punkt e, tiefster Punkt) und erreicht eine Peak-Kraft von ${f(x.pkFbw, 2)} × KG (Punkt d). ` +
      `Zum Absprung (Punkt g) fällt die Kraft auf null, während sich der Schwerpunkt durch das Strecken auf die Zehen bereits ${f(x.sTO)} cm über die Standposition gehoben hat. ` +
      `Das Verhältnis von Bremskraft zu Absenkung beträgt ${f(x.slender)} × KG pro Meter: Die Schleife ist damit ${x.slender >= S.slenderHi ? "eher schmal und steil" : x.slender <= S.slenderLo ? "eher breit und flach" : "mittelbreit"}.` });
    const unwType = (x.minFbw < 0.4 && x.pnv < -1.0) ? "aggressiv und schnell" : (x.minFbw > 0.6 || x.pnv > -0.7) ? "eher zögerlich" : "kontrolliert";
    sec.push({ title: "Entlastungsphase (a–c)", text:
      `Die Kraft fällt bis auf ${f(x.minFbw * 100, 0)} % des Körpergewichts (Punkt b), die maximale Abwärtsgeschwindigkeit beträgt ${f(Math.abs(x.pnv), 2)} m/s (Punkt c). ` +
      `Die Entlastung dauert ${f(x.durU * 1000, 0)} ms und macht ${f(x.unw, 0)} % der Bewegungszeit aus (Beispielprofile: rot 42 %, gelb 47 %, grün 56 %). ` +
      `Das „Fallenlassen“ wirkt ${unwType}. ${unwType === "aggressiv und schnell" ? "Ein tiefer, steiler Abfall unter das Körpergewicht schafft eine hohe exzentrische Geschwindigkeit, die in der Bremsphase genutzt werden kann." : unwType === "eher zögerlich" ? "Ein flacher Abfall unter das Körpergewicht bedeutet wenig exzentrische Geschwindigkeit; der Dehnungs-Verkürzungs-Zyklus wird dadurch weniger stark vorgespannt." : "Die Entlastung liegt im mittleren Bereich."}` });
    const brakeRead = strategy.key.startsWith("elastic")
      ? "Das entspricht dem elastisch-reaktiven Muster: hohe Kraft bei wenig Weg und Zeitverlust, also eine hohe exzentrische Kraftbildungsrate und eine gute Nutzung des Dehnungs-Verkürzungs-Zyklus."
      : strategy.key.startsWith("muscular")
        ? "Das entspricht dem kraftbasierten Muster: Die Abwärtsbewegung wird eher träge abgefangen und braucht viel Weg (Tiefe), um umgekehrt zu werden."
        : "Das Muster liegt zwischen der schmalen, steilen (elastisch-reaktiven) und der breiten, flachen (kraftbasierten) Schleife.";
    sec.push({ title: "Bremsphase (c–e)", text:
      `Ab der maximalen Abwärtsgeschwindigkeit steigt die Kraft innerhalb von ${f(x.dDur * 1000, 0)} ms auf ${f(x.fv0bw, 2)} × KG am tiefsten Punkt. ` +
      `Die Kraftanstiegsrate in dieser Abbremsphase beträgt ${f(x.dRfd, 0)} N/s/kg, die Absenkung ${f(x.depth)} cm. ${brakeRead}` });
    const propQ = x.prop <= 30 ? "vergleichsweise kurz" : x.prop >= 37 ? "vergleichsweise lang" : "im mittleren Bereich";
    sec.push({ title: "Abdruckphase (e–g)", text:
      `Im Abdruck wird im Mittel ${f(x.cMeanBW, 2)} × KG aufgebracht (Peak ${f(x.cPkBW, 2)} × KG). Die Phase dauert ${f(x.cDur * 1000, 0)} ms und damit ${f(x.prop, 0)} % der Bewegungszeit (Beispielprofile: rot 38 %, gelb 35 %, grün 28 %), also ${propQ}. ` +
      `Daraus ergibt sich eine Absprunggeschwindigkeit von ${f(x.vTO, 2)} m/s (Punkt g). Je höher die Nettokraft und je länger sie wirkt, desto größer der Impuls und damit die Absprunggeschwindigkeit (F × Δt = m × Δv).` });
    const asymTxt = (v, side, name) => !Number.isFinite(v) ? "" : `${name} ${f(v)} % (${side === "L" ? "links" : side === "R" ? "rechts" : "–"} stärker, ${v > 15 ? "deutlich" : v > 10 ? "erhöht" : "unauffällig"})`;
    sec.push({ title: "Symmetrie", text:
      `Bremsphase: ${asymTxt(x.asBrake, x.asBrakeSide, "Asymmetrie")}. Abdruck: ${asymTxt(x.asProp, x.asPropSide, "Asymmetrie Impuls")}. Landung: ${asymTxt(x.asLand, x.asLandSide, "Asymmetrie Peak-Kraft")}. ` +
      (x.asLand > 10 ? `Bei der Landung nimmt die ${x.asLandSide === "L" ? "linke" : "rechte"} Seite deutlich mehr Kraft auf. ` : "") +
      (x.asBrake > 10 ? "Eine asymmetrische oder abgeflachte Bremsphase kann darauf hindeuten, dass Kräfte auf einer Seite exzentrisch weniger gut aufgenommen werden (z. B. nach einer Knieverletzung). Das sollte im Verlauf beobachtet und fachlich eingeordnet werden." : "Die Bremsphase ist seitengleich; es gibt keinen Hinweis auf eine einseitige Schonung.") });
    if (trend) sec.push({ title: `Verlauf gegenüber ${trend.label}`, text:
      `Sprunghöhe ${pct(trend.dJh)}, RSImod ${pct(trend.dRsi)}, Kraft am tiefsten Punkt ${pct(trend.dFv0)}, Brems-Kraftanstieg ${pct(trend.dRfd)}, Absenkung ${pct(trend.dDepth)}, Dauer der Abbremsung ${pct(trend.dDur)}. ` +
      (flags.some(fl => fl.key === "fatigue") ? "Die Bremsphase ist „eingesackt“, während die Sprunghöhe noch stabil ist. Laut Dokument ist das oft ein früher Hinweis auf neuromuskuläre Ermüdung." :
        ((trend.dRfd <= -15 || trend.dFv0 <= -10) && trend.dJh < -5) ? "Bremsphase und Sprunghöhe sind beide deutlich geringer als in der Referenz. Das spricht für einen allgemeinen Leistungsrückgang, etwa durch Ermüdung, eine Verletzung oder eine frühe Phase der Rehabilitation." :
        ((trend.dRfd >= 10 || trend.dFv0 >= 5) && trend.dJh >= 0) ? "Die Bremsphase ist steiler bzw. kräftiger geworden bei mindestens gleicher Sprunghöhe – ein Zeichen für verbesserte exzentrische Kraftübertragung." :
        trend.dJh > 5 ? "Die Sprunghöhe ist gestiegen, ohne dass sich die Bremsphase wesentlich verändert hat; der Zuwachs kommt eher aus dem Abdruck." :
        "Die Bremsphase zeigt gegenüber der Referenz keine auffällige Veränderung.") });
    const tips = [];
    if (strategy.key.startsWith("muscular")) tips.push("reaktive Kraft und Dehnungs-Verkürzungs-Zyklus (z. B. kurze Kontakte, Pogo- und Drop-Jumps), damit die Bremsschleife steiler wird");
    if (x.cMeanBW < 2.2) tips.push("Maximal- und Schnellkraft zur Steigerung der Abdruckkraft");
    if (unwType === "eher zögerlich") tips.push("ein aktiverer, schnellerer Countermovement (Instruktion: „schnell fallen lassen, hart abfangen“)");
    if (x.asBrake > 10) tips.push("einseitiges exzentrisches Training und eine fachliche Abklärung der Seitendifferenz");
    if (strategy.key.startsWith("elastic") && x.cMeanBW >= 2.2 && !tips.length) tips.push("Erhalt des reaktiven Profils; Fortschritte sind am ehesten über mehr Abdruckkraft bei gleicher Tiefe zu erwarten");
    sec.push({ title: "Mögliche Ansatzpunkte", text: tips.length ? `Aus dem Loop-Profil abgeleitet: ${tips.join("; ")}.` : "Aus dem Loop-Profil ergibt sich kein auffälliger Ansatzpunkt." });
    return { ok: true, features: x, scales, level, strategy, flags, sections: sec };
  }

  /* ===== Sprungtyp-Erkennung =====
     DJ    – Platte zu Beginn unbelastet (Absprung von der Box), erster Kontakt ist ein Aufprall
     SL-…  – in der Wiegephase (bzw. beim ersten Kontakt) trägt nur eine Platte das Gewicht
     SJ    – nach der Wiegephase kein Kraftabfall unter das Körpergewicht und keine Abwärtsbewegung:
             reiner konzentrischer Kraftanstieg aus der ruhigen Hocke
     CMJ   – sonst (Gegenbewegung vorhanden)                                                        */
  const JUMP_TYPES = {
    CMJ: { label: "Countermovement Jump", short: "CMJ" }, "SL-CMJ": { label: "Single Leg Countermovement Jump", short: "SL-CMJ" },
    SJ: { label: "Squat Jump", short: "SJ" }, "SL-SJ": { label: "Single Leg Squat Jump", short: "SL-SJ" },
    DJ: { label: "Drop Jump", short: "DJ" }, "SL-DJ": { label: "Single Leg Drop Jump", short: "SL-DJ" }
  };
  /* ===== Testart erkennen =====
     1) Angaben von VALD haben Vorrang: Testart/Seite aus dem Dateikopf (VALD-Bridge) oder dem ForceDecks-Dateinamen.
     2) Ohne Angaben entscheidet die Kraftkurve:
        • Drop Jump: Platte zu Beginn unbelastet.
        • Einbeinig: Im Abdruck (letzte 250 ms vor dem Absprung) oder im ruhigen Stand direkt vor der Bewegung trägt eine
          Platte < 12 % der Last. (Nicht nur die ersten Millisekunden – dort steht man oft noch kurz auf beiden Platten.)
        • Squat Jump: Direkt vor dem Hauptanstieg der Kraft liegt eine ruhige Haltephase (Kraft 85–115 % KG, ≥ 0,4 s).
          Ein ForceDecks-SJ beginnt im Stand, dann folgen Absenken in die Hocke, Halten und Abdruck – das Absenken ist KEINE
          Ausholbewegung. Beim CMJ geht dem Anstieg dagegen unmittelbar die Entlastung (Kraft deutlich < KG) voraus.
        • Ohne Haltephase: CMJ nur bei echter Ausholbewegung (lokal > 4 cm oder > 0,3 m/s abwärts), sonst fehlerhafter SJ. */
  const TYPE_FROM_CODE = { CMJ: "CMJ", ABCMJ: "CMJ", SJ: "SJ", SLJ: "SL-CMJ", SLCMJ: "SL-CMJ", DJ: "DJ", SLDJ: "SL-DJ", SLSJ: "SL-SJ" };
  function typeHint(t) {
    const m = t.meta || {}, name = `${t.file || ""} ${t.trialFull || ""}`;
    let type = null, src = null;
    const code = String(m.test || "").toUpperCase().replace(/[^A-Z]/g, "");
    // bekannte Kürzel, sonst tolerant: SL…DJ → SL-DJ, SL… → SL-CMJ, …DJ → DJ, SJ/SQUAT → SJ, …CMJ → CMJ
    const guess = code ? (TYPE_FROM_CODE[code] || (/^SL.*DJ|SINGLELEGDROP/.test(code) ? "SL-DJ" : /^SL|SINGLELEG/.test(code) ? "SL-CMJ" : /DJ|DROP/.test(code) ? "DJ"
      : /^SJ$|SQUATJUMP/.test(code) ? "SJ" : /CMJ|COUNTERMOVEMENT/.test(code) ? "CMJ" : null)) : null;
    if (guess) { type = guess; src = `VALD-Testart „${m.test}“`; }
    else if (/single[_ ]leg[_ ]drop[_ ]jump/i.test(name)) { type = "SL-DJ"; src = "Dateiname"; }
    else if (/drop[_ ]jump/i.test(name)) { type = "DJ"; src = "Dateiname"; }
    else if (/single[_ ]leg[_ ](countermovement[_ ])?jump/i.test(name)) { type = "SL-CMJ"; src = "Dateiname"; }
    else if (/squat[_ ]jump/i.test(name)) { type = "SJ"; src = "Dateiname"; }
    else if (/countermovement[_ ]jump/i.test(name)) { type = "CMJ"; src = "Dateiname"; }
    const side = m.limb || (/(_|-|\b)(left|links)(_|-|\b)/i.test(name) ? "L" : /(_|-|\b)(right|rechts)(_|-|\b)/i.test(name) ? "R" : null);
    return type ? { type, side, src } : (side ? { type: null, side, src: "Dateiname" } : null);
  }
  function classifyJump(t, a) {
    const F = t.force, FL = t.force_L, FR = t.force_R, T = t.time, n = T.length;
    const at = sec => { let j = 0; while (j < n - 1 && T[j] - T[0] < sec) j++; return j; };
    const med = arr => { const b = arr.filter(Number.isFinite).sort((x, y) => x - y); return b[b.length >> 1] ?? NaN; };
    const share = (i0, i1) => { let l = 0, r = 0; for (let i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) { l += Math.max(0, FL[i] || 0); r += Math.max(0, FR[i] || 0); } return l + r > 0 ? { min: Math.min(l, r) / (l + r), side: l > r ? "L" : "R" } : { min: NaN, side: null }; };
    const res = { type: "CMJ", side: null, reasons: [], cm: null, source: "Kraftkurve" };
    const hint = typeHint(t);
    let force = null;
    // Drop Jump: Platte zu Beginn unbelastet
    if (med(F.slice(0, Math.max(10, at(0.2)))) < 50) {
      const i = F.findIndex(f => f > 100);
      if (i < 0) force = { type: "DJ", side: null, why: "Platte zu Beginn unbelastet" };
      else { let j = i; while (j < n && F[j] > 20) j++; const sh = share(i, j);
        force = { type: sh.min < 0.12 ? "SL-DJ" : "DJ", side: sh.min < 0.12 ? sh.side : null, why: `Platte zu Beginn unbelastet, erster Kontakt ist ein Aufprall${sh.min < 0.12 ? `, nur ${sh.side === "L" ? "linke" : "rechte"} Platte belastet` : ""}` }; }
    } else {
      // Einbeinig?
      const ok = a && a.ok, E = ok ? a.events : null, dt = (T[n - 1] - T[0]) / (n - 1);
      const shProp = ok ? share(E.to - Math.round(0.25 / dt), E.to - 1) : { min: NaN };
      const on = ok ? E.onset : at(1.0), shStand = share(on - Math.round(0.3 / dt), on - 1);
      const single = shProp.min < 0.12 || shStand.min < 0.12, side = single ? (shProp.min < 0.12 ? shProp.side : shStand.side) : null;
      const singleWhy = single ? `${side === "L" ? "linkes" : "rechtes"} Bein trägt ${Math.round((1 - Math.min(shProp.min, shStand.min)) * 100)} % der Last${shProp.min < 0.12 ? " im Abdruck" : " im Stand vor der Bewegung"}` : null;
      if (!ok) force = { type: single ? "SL-CMJ" : "CMJ", side, why: singleWhy || "keine vollständige Analyse möglich" };
      else {
        const BW = a.bw, m = a.m, hw = Math.max(1, Math.round(0.005 / dt));
        const Fs = i => { let r = 0, k = 0; for (let j = Math.max(0, i - hw); j <= Math.min(n - 1, i + hw); j++) { r += F[j]; k++; } return r / k; };
        // Hauptanstieg: vom Kraftmaximum vor dem Absprung zurück, solange die Kraft über KG liegt
        let pk = E.onset; for (let i = E.onset; i < E.to; i++) if (F[i] > F[pk]) pk = i;
        const base = BW + Math.max(2 * (a.sd || 0), 5);
        let rise = pk; while (rise > 0 && Fs(rise) > base) rise--;
        // Haltephase direkt vor dem Anstieg (Fenster 0,5 s bis 0,1 s davor)?
        const w0 = rise - Math.round(0.5 / dt), w1 = rise - Math.round(0.1 / dt);
        let lo = Infinity, hi = -Infinity; for (let i = Math.max(0, w0); i <= w1; i++) { const f = Fs(i); if (f < lo) lo = f; if (f > hi) hi = f; }
        const hold = w0 >= 0 && lo >= 0.85 * BW && hi <= 1.15 * BW;
        // lokale Ausholbewegung in den 0,8 s vor dem Anstieg (Integration ab Fensterbeginn mit v = 0)
        let vv = 0, ss = 0, vMin = 0, sMin = 0; for (let i = Math.max(1, rise - Math.round(0.8 / dt)); i <= Math.min(n - 1, rise + Math.round(0.15 / dt)); i++) {
          const d = T[i] - T[i - 1], vn = vv + ((F[i - 1] + F[i]) / 2 - BW) / m * d; ss += (vv + vn) / 2 * d; vv = vn; vMin = Math.min(vMin, vv); sMin = Math.min(sMin, ss); }
        const localCM = -sMin * 100 > 4 || vMin < -0.3;
        // Absenken in die Hocke vor der Haltephase (nur Info)
        const preDip = a.metrics.minF / BW, depthTotal = -a.s[E.v0] * 100;
        res.cm = { holdBefore: hold, localDepth: -sMin * 100, localVmin: vMin, minFbw: preDip, depth: depthTotal };
        let type, why;
        if (hold) { type = single ? "SL-SJ" : "SJ"; why = `ruhige Haltephase direkt vor dem Kraftanstieg (${Math.round(lo / BW * 100)}–${Math.round(hi / BW * 100)} % KG) – Abdruck aus der Hocke ohne Gegenbewegung`; }
        else if (localCM) { type = single ? "SL-CMJ" : "CMJ"; why = `Ausholbewegung unmittelbar vor dem Abdruck (${(-sMin * 100).toFixed(1)} cm, ${Math.abs(vMin).toFixed(2)} m/s abwärts)`; }
        else { type = single ? "SL-SJ" : "SJ"; why = `keine nennenswerte Ausholbewegung (${(-sMin * 100).toFixed(1)} cm) – Squat Jump`; }
        force = { type, side, why: [singleWhy, why].filter(Boolean).join("; ") };
      }
    }
    // Entscheidung: VALD-Angaben haben Vorrang, die Kraftkurve dient als Plausibilitätsprüfung
    if (hint && hint.type) {
      res.type = hint.type; res.side = /SL-/.test(hint.type) ? (hint.side || force.side) : null; res.source = hint.src;
      res.reasons.push(`Testart laut ${hint.src}${res.side ? `, Seite ${res.side === "L" ? "links" : "rechts"}` : ""}`);
      const fBase = force.type.replace("SL-", ""), hBase = hint.type.replace("SL-", "");
      if (fBase !== hBase || /SL-/.test(force.type) !== /SL-/.test(hint.type) || (res.side && force.side && res.side !== force.side))
        res.reasons.push(`Hinweis: Die Kraftkurve spricht eher für ${force.type}${force.side ? ` (${force.side === "L" ? "links" : "rechts"})` : ""} – ${force.why}. Bitte prüfen.`);
      else res.reasons.push(`Kraftkurve bestätigt: ${force.why}`);
    } else {
      res.type = force.type; res.side = force.side || (hint && /SL-/.test(force.type) ? hint.side : null); res.reasons.push(force.why);
    }
    return res;
  }

  /* ===== Squat-Jump-Auswertung =====
     Nutzt Körpergewicht, Bewegungsbeginn, Integration, Absprung und Landung aus analyze().
     Phasen: Wiegen (ruhige Hocke) → Abdruck (Bewegungsbeginn → Absprung) → Flug → Landung. */
  const SJ_METRICS = [
    ["Leistung", [["jhIM", "Jump Height (Imp-Mom)", "cm", 1], ["jhFT", "Jump Height (Flight Time)", "cm", 1], ["vTO", "Vertical Velocity at Takeoff", "m/s", 2],
      ["ft", "Flight Time", "ms", 0], ["ct", "Contraction Time (Konzentrisch)", "ms", 0], ["ftct", "Flight Time:Contraction Time", "", 2], ["rsimod", "RSI-modified (Imp-Mom)", "m/s", 2], ["sTO", "Displacement at Takeoff", "cm", 1]]],
    ["Kraft", [["F0", "Startkraft (Beginn Abdruck)", "N", 0], ["F0bm", "Startkraft / BM", "N/kg", 2], ["pkF", "Concentric Peak Force", "N", 0], ["pkFbm", "Concentric Peak Force / BM", "N/kg", 2],
      ["meanF", "Concentric Mean Force", "N", 0], ["meanFbm", "Concentric Mean Force / BM", "N/kg", 2], ["tPkF", "Time to Peak Force", "ms", 0],
      ["imp", "Concentric Impulse (netto)", "N s", 1], ["imp100", "Concentric Impulse-100ms", "N s", 1]]],
    ["Kraftanstieg", [["rfd", "Concentric RFD (Beginn → Peak)", "N/s", 0], ["rfd50", "Concentric RFD - 50ms", "N/s", 0], ["rfd100", "Concentric RFD - 100ms", "N/s", 0],
      ["rfd200", "Concentric RFD - 200ms", "N/s", 0], ["rfdMax", "Concentric Maximum RFD (50 ms)", "N/s", 0], ["rfdBM", "Concentric RFD / BM", "N/s/kg", 1]]],
    ["Leistung & Geschwindigkeit", [["pkP", "Peak Power", "W", 0], ["pkPbm", "Peak Power / BM", "W/kg", 1], ["meanP", "Concentric Mean Power", "W", 0], ["meanPbm", "Concentric Mean Power / BM", "W/kg", 1],
      ["pkV", "Peak Velocity", "m/s", 2], ["vPP", "Velocity at Peak Power", "m/s", 2]]],
    ["Landung", [["pkLF", "Peak Landing Force", "N", 0], ["pkLFbm", "Peak Landing Force / BM", "N/kg", 1]]],
    ["Asymmetrie & Qualität", [["asImp", "Concentric Impulse Asymmetry", "% L,R", 1], ["asPkF", "Concentric Peak Force Asymmetry", "% L,R", 1], ["asMeanF", "Concentric Mean Force Asymmetry", "% L,R", 1],
      ["asLand", "Peak Landing Force Asymmetry", "% L,R", 1], ["cmDip", "Gegenbewegung: Kraftabfall unter KG", "N", 0], ["cmDepth", "Gegenbewegung: Absenkung", "cm", 1]]]
  ];
  function analyzeSJ(t, a) {
    if (!a || !a.ok) return a;
    const T = t.time, F = t.force, FL = t.force_L, FR = t.force_R, E = { ...a.events }, BW = a.bw, m = a.m, n = T.length, g = 9.81;
    const o0 = E.onset, to = E.to;
    /* Beginn des Abdrucks = Beginn des ersten ECHTEN Kraftanstiegs, nicht erste Schwankung in der tiefen Hocke:
       Vom Kraftmaximum des Abdrucks rückwärts gehen (Kraft 10 ms geglättet), solange die Kraft über der Ruhelinie liegt.
       Der erste Punkt, an dem sie wieder auf Körpergewicht + max(2 SD, 5 N) zurückfällt, ist der Start des Hauptanstiegs.
       Schwankungen davor gehören zur Hocke und verschieben den Beginn nicht mehr. */
    const dtS = (T[n - 1] - T[0]) / (n - 1), hw = Math.max(1, Math.round(0.005 / dtS));
    const Fs = F.map((_, i) => { let r = 0, k = 0; for (let j = Math.max(0, i - hw); j <= Math.min(n - 1, i + hw); j++) if (Number.isFinite(F[j])) { r += F[j]; k++; } return k ? r / k : NaN; });
    let pk0 = o0; for (let i = o0; i < to; i++) if (F[i] > F[pk0]) pk0 = i;
    const base = BW + Math.max(2 * (a.sd || 0), 5);
    // Anstiegsrate (±5 ms, geglättet). Der Hauptanstieg hat eine deutliche Rate; langsames Hineindrücken/Driften in der
    // Hocke (wenige 10 N/s) zählt nicht dazu. Im oberen Teil des Anstiegs (> 15 % des Kraftzuwachses) wird immer weitergegangen.
    const slope = i => { const i0 = Math.max(0, i - hw), i1 = Math.min(n - 1, i + hw); return (Fs[i1] - Fs[i0]) / Math.max(1e-6, T[i1] - T[i0]); };
    let maxSl = 0; for (let i = o0; i < pk0; i++) maxSl = Math.max(maxSl, slope(i));
    const slopeMin = Math.max(200, 0.03 * maxSl), upper = BW + 0.15 * (F[pk0] - BW);
    let o = pk0; while (o > Math.max(0, a.weighEnd || 0) && Fs[o] > base && (Fs[o] > upper || slope(o) > slopeMin)) o--;
    if (!(o < pk0)) o = o0;
    // Wackeln nur in der eigentlichen Haltephase (letzte 0,4 s vor dem Abdruck) – das Absenken in die Hocke zählt nicht dazu
    const swayFrom = Math.max(o0, o - Math.round(0.4 / dtS));
    const sway = (() => { let mx = 0; for (let i = swayFrom; i < o; i++) mx = Math.max(mx, Math.abs(F[i] - BW)); return mx; })();
    // Integration neu ab dem Beginn des Hauptanstiegs (Schwerpunkt dort in Ruhe: v = 0, s = 0)
    const v = new Array(n).fill(0), s = new Array(n).fill(0), P = new Array(n).fill(0);
    for (let i = o + 1; i < n; i++) { const dt = T[i] - T[i - 1], a0 = (F[i - 1] - BW) / m, a1 = (F[i] - BW) / m; v[i] = v[i - 1] + (a0 + a1) / 2 * dt; s[i] = s[i - 1] + (v[i - 1] + v[i]) / 2 * dt; }
    for (let i = 0; i < n; i++) P[i] = F[i] * v[i];
    E.onset = o;
    const integ = (arr, x, y) => { let r = 0; for (let i = x + 1; i <= y; i++) r += (arr[i] + arr[i - 1]) / 2 * (T[i] - T[i - 1]); return r; };
    const mean = (arr, x, y) => { let r = 0, k = 0; for (let i = x; i <= y; i++) if (Number.isFinite(arr[i])) { r += arr[i]; k++; } return r / k; };
    const argmax = (arr, x, y) => { let k = x; for (let i = x; i <= y; i++) if (arr[i] > arr[k]) k = i; return k; };
    const after = (st, sec) => { let j = st; while (j < n - 1 && T[j] - T[st] < sec - 1e-9) j++; return j; };
    const rate = (arr, i, j) => (arr[j] - arr[i]) / Math.max(1e-6, T[j] - T[i]);
    const asym = (l, r) => ({ v: (Math.max(l, r) - Math.min(l, r)) / Math.max(l, r) * 100, side: l > r ? "L" : r > l ? "R" : "" });
    const net = F.map(f => f - BW);
    const pk = argmax(F, o, to - 1), pkP = argmax(P, o, to - 1), pkV = argmax(v, o, to - 1);
    const k50 = Math.max(1, Math.round(0.05 / ((T[n - 1] - T[0]) / (n - 1))));
    let rfdMax = -Infinity; for (let i = o; i + k50 <= to; i++) rfdMax = Math.max(rfdMax, (F[i + k50] - F[i]) / (T[i + k50] - T[i]));
    const M = a.metrics, ct = T[to] - T[o];
    // Absprunggeschwindigkeit aus der neuen Integration (Interpolation am Durchgang der 20-N-Schwelle)
    const frT = (F[to - 1] - 20) / Math.max(1e-9, F[to - 1] - F[to]);
    const vTOn = v[to - 1] + Math.min(1, Math.max(0, frT)) * (v[to] - v[to - 1]), jhIMn = vTOn * vTOn / (2 * g);
    // Gegenbewegung nur vor dem Kraftmaximum prüfen (danach fällt die Kraft zum Absprung natürlich ab)
    // Gegenbewegung = echte Absenkung unmittelbar vor dem Abdruck (Fenster 300 ms, lokal integriert), nicht Wackeln in der Hocke
    const wS = Math.max(o0, o - Math.round(0.3 / dtS));
    let minF = Infinity, sMin = 0; { let vv = 0, ss = 0; for (let i = wS; i <= pk; i++) { if (F[i] < minF) minF = F[i];
      if (i > wS) { const dt = T[i] - T[i - 1], vn = vv + ((F[i - 1] + F[i]) / 2 - BW) / m * dt; ss += (vv + vn) / 2 * dt; vv = vn; } if (i <= o + Math.round(0.05 / dtS) && ss < sMin) sMin = ss; } }
    const lpk = E.land >= 0 ? argmax(F, E.land, E.landEnd >= 0 ? E.landEnd : n - 1) : -1;
    const mx = {
      jhIM: jhIMn * 100, jhFT: M.jhFT, vTO: vTOn, ft: M.FT * 1000, ct: ct * 1000, ftct: M.FT / ct, rsimod: jhIMn / ct, sTO: s[to] * 100,
      F0: F[o], F0bm: F[o] / m, pkF: F[pk], pkFbm: F[pk] / m, meanF: mean(F, o, to), meanFbm: mean(F, o, to) / m, tPkF: (T[pk] - T[o]) * 1000,
      imp: integ(net, o, to), imp100: integ(net, o, Math.min(to, after(o, 0.1))),
      rfd: rate(F, o, pk), rfd50: rate(F, o, after(o, 0.05)), rfd100: rate(F, o, after(o, 0.1)), rfd200: rate(F, o, after(o, 0.2)), rfdMax, rfdBM: rate(F, o, pk) / m,
      pkP: P[pkP], pkPbm: P[pkP] / m, meanP: mean(P, o, to), meanPbm: mean(P, o, to) / m, pkV: v[pkV], vPP: v[pkP],
      pkLF: lpk >= 0 ? F[lpk] : NaN, pkLFbm: lpk >= 0 ? F[lpk] / m : NaN,
      asImp: asym(integ(FL, o, to), integ(FR, o, to)), asPkF: asym(Math.max(...FL.slice(o, to)), Math.max(...FR.slice(o, to))), asMeanF: asym(mean(FL, o, to), mean(FR, o, to)),
      asLand: lpk >= 0 ? asym(Math.max(...FL.slice(E.land, E.landEnd)), Math.max(...FR.slice(E.land, E.landEnd))) : { v: NaN, side: "" },
      cmDip: Math.max(0, BW - minF), cmDepth: -sMin * 100
    };
    const warnings = [...a.warnings.filter(w => !/Umkehrpunkt/.test(w))];
    if (sMin < -0.005 || (BW - minF > Math.max(5 * a.sd, 0.1 * BW) && sMin < -0.002)) warnings.push(`Leichte Gegenbewegung vor dem Abdruck (Kraftabfall ${Math.round(BW - minF)} N, Absenkung ${(-sMin * 100).toFixed(1)} cm) – kein reiner Squat Jump.`);
    // Ereignisse/Phasen im CMJ-kompatiblen Format (ohne Entlastung/Bremsen), damit Diagramme wiederverwendet werden können
    const ev = { onset: o, to, land: E.land, landEnd: E.landEnd, pkProp: pk, pkLand: E.pkLand, pkP, pkV, pkF: pk, minF: -1, pnv: -1, pkBrake: -1, v0: -1 };
    // Beginnt die Aufnahme im Stand (ForceDecks), liegt zwischen Bewegungsbeginn und Abdruck das Absenken + Halten in der Hocke
    const sq = o0 < o - Math.round(0.15 / dtS);
    const phases = [{ key: "weigh", name: sq ? "Wiegen" : "Wiegen (Hocke)", a: 0, b: sq ? o0 : o }, ...(sq ? [{ key: "squat", name: "Absenken + Halten (Hocke)", a: o0, b: o }] : []), { key: "prop", name: "Abdruck", a: o, b: to },
      ...(E.land >= 0 ? [{ key: "flight", name: "Flug", a: to, b: E.land }, { key: "land", name: "Landung", a: E.land, b: E.landEnd }] : [])];
    if (sway > Math.max(5 * (a.sd || 0), 20) && !warnings.some(w => /Gegenbewegung/.test(w))) warnings.push(`Unruhige Hocke vor dem Abdruck (Schwankungen bis ${Math.round(sway)} N in der Haltephase) – Beginn des Abdrucks auf den ersten echten Kraftanstieg gesetzt.`);
    return { ...a, v, s, P, ok: true, sj: true, events: ev, phases, sjMetrics: mx, warnings, swayStart: o0 };
  }


  // Demo-Squat-Jump: statische Hocke, direkter Abdruck (optional kleine Gegenbewegung)
  function synthSJ({ athlete = "Beispiel", date = "2026.03.16", trial = 1, mass = 78, tP = 0.36, v0 = 2.05, asym = 0.04, dip = 0, seed = 3 } = {}) {
    let sd = seed * 9301 + 49297; const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280) - 0.5;
    const g = 9.81, dt = 0.001, tQ = 1.4, tD = dip > 0 ? 0.12 : 0;
    const C = (v0 + g * tP / 9) * Math.PI / (2 * tP);
    const tFl = 2 * v0 / g, tL1 = 0.045, tL = 0.32, K1 = 42, K2 = Math.max(0, (v0 - 2 * tL1 * K1 / Math.PI)) * Math.PI / (2 * tL);
    const t1 = tQ, t2 = t1 + tD, t3 = t2 + tP, t4 = t3 + tFl, tEnd = t4 + tL + 0.8;
    const acc = t => { if (t < t1) return 0; if (t < t2) return -dip * Math.sin(2 * Math.PI * (t - t1) / tD);
      if (t < t3) { const u = t - t2; return C * Math.sin(Math.PI * u / tP) - g * (u / tP) ** 8; } if (t < t4) return -g;
      const u = t - t4; let a = 0; if (u < tL1) a += K1 * Math.sin(Math.PI * u / tL1); if (u < tL) a += K2 * Math.sin(Math.PI * u / tL); return a; };
    const lines = [`Athlete,${athlete}`, `Test,Squat Jump`, `Date,${date}`, `Trial,${trial}`, `Sample rate (Hz),1000`, `Body mass (kg),${mass}`, `Device,Dual force plate`, `Units,N; m/s; m`, ``, `Time,Left,Right,,Velocity,Height`];
    let v = 0, h = 0, aPrev = 0;
    for (let i = 0; i <= Math.round(tEnd / dt); i++) {
      const t = i * dt, a = acc(t);
      if (i > 0) { const vn = v + (a + aPrev) / 2 * dt; h += (v + vn) / 2 * dt; v = vn; } aPrev = a; if (t >= t4 + tL) v = 0;
      let Fz = (t >= t3 && t < t4) ? 0 : Math.max(0, mass * (a + g)); if (Fz > 0) Fz += rnd() * 10;
      const L = Fz > 0 ? Math.max(0, Fz * (0.5 - asym / 2) + rnd() * 5) : Math.abs(rnd() * 3), R = Fz > 0 ? Math.max(0, Fz * (0.5 + asym / 2) + rnd() * 5) : Math.abs(rnd() * 3);
      lines.push(`${t.toFixed(3)},${L.toFixed(2)},${R.toFixed(2)},,${v.toFixed(4)},${(h + 0.7).toFixed(5)}`);
    }
    return { name: `${athlete}-Squat_Jump_${date}_Trial${trial}.csv`, text: lines.join("\n") };
  }
  return { parse, readCMJ, synth, synthSJ, analyze, assess, classifyJump, analyzeSJ, JUMP_TYPES, SJ_METRICS, loopFeatures, REF_PROFILES, STRAT_REF, SCALE_DEF, METRICS, VALD_CATALOG, VALD_DEFAULT };
})();
