/* ===== Sprung-Kern: Einlesen → Erkennen → Kennwerte → Zuordnung → Aggregation =====
   Reine Logik ohne Zugriff auf die Seite (läuft auch in Node, siehe tests/). Baut auf der CMJ-Engine (CMJ) auf.
   Ein „Sprung“ ist ein Versuch (eine CSV-Datei). Je Sprung werden einmal alle Kennwerte berechnet und im
   Speicher abgelegt; danach geht nur noch Auswahl + Aggregation in die Einzel- und Teamauswertung. */
var KVCore = (function () {
  "use strict";
  var C = CMJ;

  /* ---------- Katalog ---------- */
  var ALL = [], BYNAME = {};
  C.VALD_CATALOG.forEach(function (c) {
    c[1].forEach(function (p) { var o = { cat: c[0], name: p[0], unit: p[1], dp: p[2] }; ALL.push(o); BYNAME[o.name] = o; });
  });

  /* Squat Jump: eigene Kennwerte der Engine → Namen im ForceDecks-Katalog (damit eine Auswahl für alle Sprungarten gilt) */
  var SJ_MAP = {
    jhIM: ["Jump Height (Imp-Mom)"], jhFT: ["Jump Height (Flight Time)"], vTO: ["Vertical Velocity at Takeoff"], ft: ["Flight Time"],
    ct: ["Contraction Time", "Concentric Duration"], ftct: ["Flight Time:Contraction Time"], rsimod: ["RSI-modified (Imp-Mom)"],
    sTO: ["Displacement at Takeoff"], pkF: ["Concentric Peak Force"], pkFbm: ["Concentric Peak Force / BM"], meanF: ["Concentric Mean Force"],
    meanFbm: ["Concentric Mean Force / BM"], tPkF: ["Concentric Time to Peak Force"], imp: ["Concentric Impulse"], imp100: ["Concentric Impulse-100ms"],
    rfd: ["Concentric RFD"], rfd50: ["Concentric RFD - 50ms"], rfd100: ["Concentric RFD - 100ms"], rfd200: ["Concentric RFD - 200ms"],
    rfdMax: ["Concentric Maximum RFD"], rfdBM: ["Concentric RFD / BM"], pkP: ["Peak Power"], pkPbm: ["Peak Power / BM"],
    meanP: ["Concentric Mean Power"], meanPbm: ["Concentric Mean Power / BM"], pkV: ["Concentric Peak Velocity"], vPP: ["Velocity at Peak Power"],
    pkLF: ["Peak Landing Force"], pkLFbm: ["Peak Landing Force / BM"], asImp: ["Concentric Impulse Asymmetry"],
    asPkF: ["Concentric Peak Force Asymmetry"], asMeanF: ["Concentric Mean Force Asymmetry"], asLand: ["Peak Landing Force Asymmetry"]
  };

  /* Gruppen = Sprungart (bei Single Leg zusätzlich die Seite). Reihenfolge = Reihenfolge in den Auswertungen. */
  var GROUPS = {
    "CMJ":      { label: "CMJ (VALD)",           slug: "cmj",   order: 1 },
    "SJ":       { label: "SJ (VALD)",            slug: "sj",    order: 2 },
    "SL-CMJ|L": { label: "SL-CMJ links (VALD)",  slug: "slcl",  order: 3 },
    "SL-CMJ|R": { label: "SL-CMJ rechts (VALD)", slug: "slcr",  order: 4 },
    "SL-SJ|L":  { label: "SL-SJ links (VALD)",   slug: "slsl",  order: 5 },
    "SL-SJ|R":  { label: "SL-SJ rechts (VALD)",  slug: "slsr",  order: 6 },
    "LSI":      { label: "SL-CMJ Seitenvergleich (VALD)", slug: "lsi", order: 7 }
  };
  /* Einbeinige Sprünge: Seiten- und Links/Rechts-Kennwerte sind sinnlos (die andere Platte ist unbelastet) */
  var SL_SKIP = /^(Asymmetry|Left and Right)/;
  /* Seitenvergleich (Limb Symmetry): aus den beiden SL-CMJ-Seiten, gleiche Kennwerte wie im CMJ Analyzer (LSI_ROWS) */
  var LSI_NAMES = ["Jump Height (Imp-Mom)", "Jump Height (Flight Time)", "RSI-modified (Imp-Mom)", "Peak Power / BM",
    "Concentric Mean Force / BM", "Concentric Impulse", "Eccentric Deceleration RFD / BM", "Force at Zero Velocity / BM",
    "Eccentric Peak Velocity", "Countermovement Depth", "Contraction Time", "Peak Landing Force / BM"];

  /* ---------- Hilfen ---------- */
  function fin(x) { return typeof x === "number" && isFinite(x); }
  function numOf(v) { if (v && typeof v === "object") v = v.v; return fin(v) ? v : NaN; }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  /* beliebige Datumsangaben → YYYY-MM-DD ("" wenn nicht lesbar) */
  function isoDate(s) {
    if (s == null || s === "") return "";
    s = String(s).trim(); var m;
    if ((m = s.match(/(\d{4})[._\/-](\d{1,2})[._\/-](\d{1,2})/))) return m[1] + "-" + pad2(+m[2]) + "-" + pad2(+m[3]);
    if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/))) return m[3] + "-" + pad2(+m[2]) + "-" + pad2(+m[1]);
    return "";
  }
  function canonName(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).sort().join(" ");
  }
  /* exakter Treffer, sonst eindeutiger Teilmengen-Treffer (z. B. „Max Muster“ ↔ „Max Franz Muster“, mind. 2 Wörter) */
  function findMatch(canon, list) {
    if (!canon) return null;
    var i; for (i = 0; i < list.length; i++) if (list[i] === canon) return list[i];
    var a = canon.split(" "), hits = [];
    list.forEach(function (c) {
      var b = c.split(" "), small = a.length <= b.length ? a : b, big = a.length <= b.length ? b : a;
      if (small.length >= 2 && small.every(function (w) { return big.indexOf(w) >= 0; })) hits.push(c);
    });
    return hits.length === 1 ? hits[0] : null;
  }
  function clean(o) {
    var out = {};
    Object.keys(o || {}).forEach(function (k) {
      var v = o[k];
      if (v && typeof v === "object") out[k] = { v: fin(v.v) ? v.v : null, side: v.side || "" };
      else if (typeof v === "number") out[k] = fin(v) ? v : null;
    });
    return out;
  }
  /* Kopfzeilen vor der Datentabelle: Athlet:in und Datum, falls vorhanden */
  function headMeta(text) {
    var lines = String(text).slice(0, 6000).replace(/^﻿/, "").split(/\r?\n/).slice(0, 20), m = {};
    lines.forEach(function (l) {
      var i = l.search(/[,;\t]/); if (i < 0) return;
      var k = l.slice(0, i).trim().toLowerCase().replace(/^"|"$/g, ""), v = l.slice(i + 1).split(/[,;\t]/)[0].trim().replace(/^"|"$/g, "");
      if (!v) return;
      if (/^(athlete|athlete name|name|profile|profil)$/.test(k) && !m.athlete) m.athlete = v;
      if (/^(date|test date|recorded|datum)$/.test(k) && !m.date) m.date = v;
    });
    return m;
  }
  function nameFromFile(file) {
    var s = String(file || "").replace(/\.[^.]+$/, ""), m = s.match(/^(.*?)[-_ ]+(?:countermovement|squat|single|drop|cmj|sj|slj|dj)/i);
    return m && m[1].trim() ? m[1].replace(/_/g, " ").trim() : "";
  }

  /* ---------- Verarbeitung eines Sprungs ---------- */
  /* rec: {id, name (Dateiname), text, athlete?, date?, source?, testId?, profileId?, testType?, recorded?, added?}
     → Ergebnis-Datensatz (ohne Rohkurve). Wirft, wenn die Datei nicht lesbar ist. */
  function processFile(rec, opts) {
    var thr = Math.max(1, (opts && opts.thr) || 20);
    var t = C.readCMJ(rec.text, rec.name);
    var hm = headMeta(rec.text);
    var res = {
      id: rec.id, file: rec.name, source: rec.source || "Upload", testId: rec.testId || null, profileId: rec.profileId || null,
      testTypeHint: rec.testType || null, added: rec.added || Date.now(), recorded: rec.recorded || null,
      athlete: String(rec.athlete || hm.athlete || nameFromFile(rec.name) || "Unbekannt").trim(),
      date: isoDate(rec.date) || isoDate(hm.date) || isoDate(rec.name) || "",
      trial: t.trial || "", use: true, override: null, sideOverride: null, thr: thr, ok: false, analyzedAt: Date.now()
    };
    var a0 = null;
    try { a0 = C.analyze(t, { takeoffThreshold: thr }); } catch (e) { a0 = null; }
    var det = null;
    try { det = C.classifyJump(t, a0); } catch (e) { det = { type: "CMJ", side: null, reasons: ["Erkennung fehlgeschlagen: " + e.message] }; }
    res.type = det.type;
    res.side = det.side || (/(_|-|\b)(left|links)(_|-|\b)/i.test(rec.name) ? "L" : /(_|-|\b)(right|rechts)(_|-|\b)/i.test(rec.name) ? "R" : null);
    res.reasons = det.reasons || [];
    res.check = res.reasons.some(function (r) { return /^Hinweis/.test(r); });
    res.ok = !!(a0 && a0.ok);
    res.warnings = (a0 && a0.warnings) || [];
    res.mass = res.ok ? a0.m : (t.meta && t.meta.weightKg) || null;
    res.vc = res.ok && a0.metrics.vald ? clean(a0.metrics.vald) : null;
    if (res.ok) { var lit = {}; Object.keys(a0.metrics).forEach(function (k) { if (k !== "vald") lit[k] = a0.metrics[k]; }); res.lit = clean(lit); } else res.lit = null;
    res.vs = null;
    if (res.ok) {
      var s = null; try { s = C.analyzeSJ(t, a0); } catch (e) { s = null; }
      if (s && s.ok && s.sjMetrics) {
        var vs = {}; vs["Bodyweight in Kilograms"] = a0.m;
        Object.keys(SJ_MAP).forEach(function (k) { SJ_MAP[k].forEach(function (nm) { vs[nm] = s.sjMetrics[k]; }); });
        res.vs = clean(vs);
        var extra = s.warnings.filter(function (w) { return res.warnings.indexOf(w) < 0; });
        res.warningsSJ = extra;
      }
    }
    return res;
  }

  /* ---------- Wirksame Art/Seite/Gruppe/Werte eines Sprungs ---------- */
  function typeOf(r) { return r.override || r.type; }
  function sideOf(r) { return r.sideOverride || r.side || null; }
  function groupOf(r) {
    var ty = typeOf(r), s = sideOf(r);
    if (ty === "CMJ" || ty === "SJ") return ty;
    if (ty === "SL-CMJ" || ty === "SL-SJ") return (s === "L" || s === "R") ? ty + "|" + s : null;
    return null;   /* Drop Jumps u. a. werden (noch) nicht ausgewertet */
  }
  function valuesOf(r) {
    var ty = typeOf(r);
    if (ty === "SJ" || ty === "SL-SJ") return r.vs || null;
    if (ty === "CMJ" || ty === "SL-CMJ") return r.vc || null;
    return null;
  }
  function groupAllows(group, cat) { return !(/^SL-/.test(group) && SL_SKIP.test(cat)); }
  function usable(r) { return !!(r.use && r.ok && groupOf(r) && valuesOf(r)); }

  /* ---------- Metrik-Eigenschaften ---------- */
  var POS = [/^Jump Height/, /^RSI-modified/, /^Flight Time$/, /^Peak Power/, /^Concentric (Peak|Mean) (Force|Power|Velocity)/, /^Concentric Impulse(-50ms|-100ms| \(Abs\) \/ BM)?$/,
    /^Concentric (RFD|RPD|Maximum RFD)/, /^Vertical Velocity at Takeoff/, /^Takeoff Peak Force/, /^Peak Net Takeoff Force/];
  function dirOf(name) {
    if (/Asymmetry/.test(name)) return -1;
    var base = name.replace(/ \((Left|Right)\)$/, "");
    for (var i = 0; i < POS.length; i++) if (POS[i].test(base)) return 1;
    return 0;
  }
  function metricKey(group, name) { return "j_" + GROUPS[group].slug + "_" + slug(name); }

  /* ---------- Aggregation mehrerer Versuche ---------- */
  var AGG = { best: "Bester Versuch (höchste Sprunghöhe)", mean: "Mittelwert aller Versuche", median: "Median aller Versuche" };
  var BEST_KEY = "Jump Height (Imp-Mom)";
  function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }), n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; }
  /* trials: Ergebnisse derselben Gruppe/Person/Tag, names: gewünschte Kennwerte → {name: Zahl} */
  function aggregate(trials, mode, names) {
    var out = {}, vals = trials.map(valuesOf);
    if (mode === "best") {
      var bi = 0, bv = -Infinity;
      vals.forEach(function (v, i) { var h = numOf(v && v[BEST_KEY]); if (fin(h) && h > bv) { bv = h; bi = i; } });
      names.forEach(function (n) { var x = numOf(vals[bi] && vals[bi][n]); if (fin(x)) out[n] = x; });
      return out;
    }
    names.forEach(function (n) {
      var xs = []; vals.forEach(function (v) { var x = numOf(v && v[n]); if (fin(x)) xs.push(x); });
      if (!xs.length) return;
      out[n] = mode === "median" ? median(xs) : xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
    });
    return out;
  }

  /* ---------- Tabelle: je Athlet:in und Testtag die aggregierten Werte aller Gruppen ----------
     opts: {agg, names:[ausgewählte Kennwerte], resolve:function(athlet)→{key, display}} */
  function buildTable(results, opts) {
    var byKey = {}, order = [];
    results.forEach(function (r) {
      if (!usable(r)) return;
      var who = opts.resolve(r.athlete), g = groupOf(r), k = who.key + "|" + (r.date || "");
      var e = byKey[k]; if (!e) { e = byKey[k] = { key: who.key, athlete: who.display, date: r.date || "", g: {}, files: 0 }; order.push(k); }
      (e.g[g] = e.g[g] || []).push(r); e.files++;
    });
    return order.map(function (k) {
      var e = byKey[k], out = { key: e.key, athlete: e.athlete, date: e.date, groups: {}, files: e.files };
      Object.keys(e.g).forEach(function (g) {
        var names = opts.names.filter(function (n) { return BYNAME[n] && groupAllows(g, BYNAME[n].cat); });
        var trials = e.g[g].slice().sort(function (a, b) { return String(a.trial).localeCompare(String(b.trial), undefined, { numeric: true }); });
        out.groups[g] = { n: trials.length, vals: aggregate(trials, opts.agg, names) };
      });
      var L = out.groups["SL-CMJ|L"], R = out.groups["SL-CMJ|R"];
      if (L && R) {
        out.lsi = {};
        LSI_NAMES.forEach(function (n) {
          if (opts.names.indexOf(n) < 0) return;
          var a = Math.abs(L.vals[n]), b = Math.abs(R.vals[n]);
          if (fin(a) && fin(b) && Math.max(a, b) > 0) out.lsi[n] = Math.abs(a - b) / Math.max(a, b) * 100;
        });
      }
      return out;
    });
  }

  /* Metrik-Definitionen für die Auswertungen (nur Kennwerte, zu denen es Werte gibt) */
  function metricDefs(table, names) {
    var seen = {}, defs = [];
    table.forEach(function (e) {
      Object.keys(e.groups).forEach(function (g) { Object.keys(e.groups[g].vals).forEach(function (n) { seen[g + "||" + n] = 1; }); });
      if (e.lsi) Object.keys(e.lsi).forEach(function (n) { seen["LSI||" + n] = 1; });
    });
    Object.keys(GROUPS).sort(function (a, b) { return GROUPS[a].order - GROUPS[b].order; }).forEach(function (g) {
      ALL.forEach(function (p) {
        if (names.indexOf(p.name) < 0 || !seen[g + "||" + p.name]) return;
        var lsi = g === "LSI", asym = /Asymmetry/.test(p.name);
        defs.push({
          k: metricKey(g, p.name), t: lsi ? "Seitendifferenz " + p.name : p.name, u: lsi ? "%" : (asym ? "%" : p.unit), d: lsi ? 1 : p.dp,
          dir: lsi ? -1 : dirOf(p.name), g: GROUPS[g].label, pp: (lsi || asym || p.unit === "%") ? 1 : 0, jump: 1, jg: g, jn: p.name
        });
      });
    });
    return defs;
  }
  /* Werte einer Tabellenzeile als {metricKey: Zahl} */
  function rowValues(e) {
    var out = {};
    Object.keys(e.groups).forEach(function (g) {
      var v = e.groups[g].vals; Object.keys(v).forEach(function (n) { out[metricKey(g, n)] = v[n]; });
    });
    if (e.lsi) Object.keys(e.lsi).forEach(function (n) { out[metricKey("LSI", n)] = e.lsi[n]; });
    return out;
  }

  return {
    ALL: ALL, BYNAME: BYNAME, SJ_MAP: SJ_MAP, GROUPS: GROUPS, LSI_NAMES: LSI_NAMES, AGG: AGG, BEST_KEY: BEST_KEY, SL_SKIP: SL_SKIP,
    fin: fin, numOf: numOf, isoDate: isoDate, canonName: canonName, findMatch: findMatch, headMeta: headMeta, nameFromFile: nameFromFile,
    processFile: processFile, typeOf: typeOf, sideOf: sideOf, groupOf: groupOf, valuesOf: valuesOf, groupAllows: groupAllows, usable: usable,
    dirOf: dirOf, metricKey: metricKey, aggregate: aggregate, buildTable: buildTable, metricDefs: metricDefs, rowValues: rowValues
  };
})();
