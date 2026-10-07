/* ===== Sprungdaten-Anbindung: Speicher ⇄ Einzel-/Teamauswertung =====
   Ablauf: Import (Upload oder VALD-Bridge) → je Sprung auswerten → im Sprungspeicher ablegen →
   Auswahl der Parameter (Tab „Parameter“) + Aggregation der Versuche → als Metriken und Werte in die Testzeilen
   der Segeln-Auswertung mischen (mergeRows) → alle bisherigen Ansichten, Excel und PDF laufen unverändert weiter. */
var KVApp = (function () {
  "use strict";
  var K = KVCore, ST = KVStore;
  var SEL_KEY = "cmj_metric_selection_v1";   /* gleiche Schlüssel wie im CMJ Analyzer: gespeicherte Auswahlen bleiben nutzbar */
  var OWN = "__own__";                       /* Zuordnung „eigene Person führen“ */
  var A = {};

  var S = A.S = {
    ready: false, persistent: false, dirty: false, busy: "",
    results: [], aliases: {}, excel: {}, table: [], defs: [], info: {},
    settings: { agg: "best", thr: 20, keepRaw: true, fillCmjSj: true, skipKnown: true },
    sel: new Set()
  };
  /* Erststart ohne gespeicherte Auswahl: kompakte Auswahl (gut lesbare Einzel-/Teamauswertung); VALD-Standard und „Alle“ im Tab „Parameter“ */
  var DEFAULT_SEL = ["Jump Height (Imp-Mom)", "Jump Height (Flight Time)", "RSI-modified (Imp-Mom)", "Flight Time", "Contraction Time", "Countermovement Depth",
    "Concentric Mean Force / BM", "Concentric Peak Force / BM", "Peak Power / BM", "Concentric Impulse", "Vertical Velocity at Takeoff", "Eccentric Braking RFD / BM",
    "Peak Landing Force / BM", "Concentric Impulse Asymmetry", "Concentric Peak Force Asymmetry"];
  S.sel = new Set(DEFAULT_SEL);

  /* ---------- kleine Helfer ---------- */
  A.el = function (tag, attrs) {
    var n = document.createElement(tag); attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === "class") n.className = v;
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
    });
    (function add(list) {
      list.forEach(function (c) { if (c == null || c === false) return; if (Array.isArray(c)) add(c); else n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    })(Array.prototype.slice.call(arguments, 2));
    return n;
  };
  A.tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
  A.fmtDate = function (iso) { var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "." + m[2] + "." + m[1] : (iso || "—"); };
  A.nf = function (v, dp) { return K.fin(v) ? v.toLocaleString("de-AT", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "–"; };
  A.typeLabel = function (t) { return CMJ.JUMP_TYPES[t] ? CMJ.JUMP_TYPES[t].short : t; };
  A.sideTxt = function (s) { return s === "L" ? "links" : s === "R" ? "rechts" : "—"; };
  function dateKey(d) { var k = typeof testKey === "function" ? testKey({ date: d }) : null; return k == null ? "" : String(k); }
  function selNames() { return K.ALL.filter(function (p) { return S.sel.has(p.name); }).map(function (p) { return p.name; }); }
  A.selNames = selNames;

  /* ---------- Auswahl der Parameter (Browser-Speicher, wie im CMJ Analyzer) ---------- */
  function loadSel() {
    try {
      var r = JSON.parse(localStorage.getItem(SEL_KEY));
      if (Array.isArray(r)) { S.sel = new Set(r.filter(function (n) { return K.BYNAME[n]; })); return; }
    } catch (e) {}
    S.sel = new Set(DEFAULT_SEL);
  }
  A.DEFAULT_SEL = DEFAULT_SEL;
  A.saveSel = function () { try { localStorage.setItem(SEL_KEY, JSON.stringify(Array.from(S.sel))); } catch (e) {} };
  A.saveSettings = function () { ST.kvSet("settings", S.settings); };
  A.saveAliases = function () { ST.kvSet("aliases", S.aliases); };

  /* ---------- Zuordnung VALD-Name → Name im Rohdatenblatt ---------- */
  function resolver(excel) {
    var canons = Object.keys(excel);
    return function (name) {
      var c = K.canonName(name), al = S.aliases[c];
      if (al === OWN) return { key: c, display: name, via: "own" };
      if (al) { var ac = K.canonName(al), m = K.findMatch(ac, canons); return { key: m || ac, display: m ? excel[m] : al, via: "alias" }; }
      var hit = K.findMatch(c, canons);
      return hit ? { key: hit, display: excel[hit], via: "auto" } : { key: c, display: name, via: "none" };
    };
  }
  A.OWN = OWN;
  A.resolve = function (name) { return resolver(S.excel)(name); };
  /* verschiedene Namen aus VALD mit Anzahl und Zuordnung */
  A.athletes = function () {
    var res = resolver(S.excel), by = {};
    S.results.forEach(function (r) {
      var e = by[r.athlete] || (by[r.athlete] = { name: r.athlete, n: 0, used: 0, types: {}, dates: {} });
      e.n++; if (K.usable(r)) e.used++; var t = K.typeOf(r); e.types[t] = (e.types[t] || 0) + 1; if (r.date) e.dates[r.date] = 1;
    });
    return Object.keys(by).sort(function (a, b) { return a.localeCompare(b, "de"); }).map(function (k) { var e = by[k]; e.map = res(e.name); return e; });
  };

  /* ---------- Einmischen in die Testzeilen (Aufruf aus rebuildTests) ---------- */
  A.mergeRows = function (rows) {
    var excel = {};
    rows.forEach(function (r) { var c = K.canonName(r.name); if (c && !excel[c]) excel[c] = r.name; });
    S.excel = excel;
    var hadExcel = Object.keys(excel).length > 0;
    var names = selNames(), need = names.slice(); if (need.indexOf(K.BEST_KEY) < 0) need.push(K.BEST_KEY);
    var table = K.buildTable(S.results, { agg: S.settings.agg, names: need, resolve: resolver(excel) });
    var defs = K.metricDefs(table, names), keep = {}; defs.forEach(function (d) { keep[d.k] = 1; });
    S.table = table; S.defs = defs; setDynamicMetrics(defs);
    var idx = {};
    rows.forEach(function (r) { idx[K.canonName(r.name) + "|" + dateKey(r.date)] = r; });   /* bei doppelten Zeilen gewinnt die untere */
    var info = { matched: 0, added: 0, filled: [], diffs: [] };
    table.forEach(function (e) {
      var k = e.key + "|" + dateKey(e.date), row = idx[k];
      if (!row) { row = { name: e.athlete, date: e.date, q: {}, jumpOnly: true }; rows.push(row); idx[k] = row; info.added++; } else info.matched++;
      var vals = K.rowValues(e); Object.keys(vals).forEach(function (m) { if (keep[m]) row[m] = vals[m]; });
      /* CMJ-/SJ-Felder des Rohdatenblatts aus VALD füllen (Blattwert hat Vorrang; große Abweichung wird gemeldet) */
      [["cmj", "CMJ"], ["sj", "SJ"]].forEach(function (x) {
        var g = e.groups[x[1]], h = g && g.vals[K.BEST_KEY];
        if (h == null) return;
        if (row[x[0]] == null) { if (S.settings.fillCmjSj) { row[x[0]] = Math.round(h * 100) / 100; info.filled.push(row.name + " " + x[1]); } }
        else if (Math.abs(row[x[0]] - h) > 2) info.diffs.push(row.name + " " + A.fmtDate(e.date) + ": " + x[1] + " Blatt " + A.nf(row[x[0]], 1) + " cm, VALD " + A.nf(h, 1) + " cm");
      });
    });
    var un = {};
    if (hadExcel && !(typeof DEMO !== "undefined" && DEMO)) {
      var res = resolver(excel);
      S.results.forEach(function (r) { if (res(r.athlete).via === "none") un[r.athlete] = (un[r.athlete] || 0) + 1; });
    }
    info.unmatched = un; S.info = info;
    return rows;
  };

  /* ---------- Daten ändern → Auswertung neu aufbauen ---------- */
  /* quiet: die Ansicht der Tabs „Sprungdaten“/„Parameter“ nicht neu aufbauen (z. B. beim Anhaken von Kennwerten) */
  A.refresh = function (quiet) {
    if (typeof DEMO !== "undefined" && DEMO && S.results.some(K.usable)) { DEMO = false; FILE = "Sprungspeicher (VALD)"; BASE_ROWS = []; }
    S.dirty = !quiet; rebuildTests(); render();
  };
  A.afterRender = function () {
    if (!S.dirty) return; S.dirty = false;
    if (tab === "sprung" && A.renderSprung) A.renderSprung();
    if (tab === "parameter" && A.renderParams) A.renderParams();
  };
  A.onTab = function (t) {
    if (t === "sprung" && A.renderSprung) A.renderSprung();
    if (t === "parameter" && A.renderParams) A.renderParams();
  };
  A.rememberBase = function (rows, fname, fotos) { ST.kvSet("base", { rows: rows, file: fname, fotos: fotos || {}, saved: Date.now() }); };

  /* ---------- Hinweise für das Blatt „Datenqualität“ ---------- */
  A.flags = function (f) {
    var all = S.results;
    if (!all.length) return f;
    var use = all.filter(K.usable), athletes = {}, days = {}, types = {};
    all.forEach(function (r) { athletes[r.athlete] = 1; });
    use.forEach(function (r) { if (r.date) days[r.date] = 1; });
    all.forEach(function (r) { var t = K.typeOf(r); types[t] = (types[t] || 0) + 1; });
    var tt = Object.keys(types).map(function (t) { return types[t] + "× " + A.typeLabel(t); }).join(", ");
    var out = f.slice();
    out.push(["Sprungspeicher (VALD)", all.length + " Sprünge von " + Object.keys(athletes).length + " Athlet:innen an " + Object.keys(days).length + " Testtag(en), " + use.length +
      " davon in der Auswertung · " + tt + " · Mehrere Versuche je Tag: " + K.AGG[S.settings.agg] + " · " + selNames().length + " Kennwerte ausgewählt, " + S.defs.length +
      " Metriken in Einzel- und Teamauswertung. Stand der Daten und Auswahl: Tabs „Sprungdaten“ und „Parameter“.", "ok"]);
    if (!ST.isPersistent()) out.push(["Sprungspeicher nur im Arbeitsspeicher", "Der Browser erlaubt hier keine dauerhafte Datenbank (z. B. privates Fenster). Die Sprünge gehen beim Schließen verloren – bitte im Tab „Sprungdaten“ den Speicher sichern."]);
    var un = Object.keys(S.info.unmatched || {});
    if (un.length) out.push(["Sprung-Athlet:innen nicht im Rohdatenblatt", un.map(function (n) { return n + " (" + S.info.unmatched[n] + " Sprünge)"; }).join("; ") +
      " — kein gleicher Name im Blatt gefunden. Sie erscheinen als eigene Personen ohne Bootsklasse. Im Tab „Sprungdaten“ unter „Zuordnung“ lässt sich der passende Name wählen."]);
    var chk = all.filter(function (r) { return r.check && !r.override; });
    if (chk.length) out.push(["Sprungart prüfen", chk.slice(0, 8).map(function (r) { return r.athlete + " " + A.fmtDate(r.date) + " " + r.trial; }).join("; ") + (chk.length > 8 ? " … (+" + (chk.length - 8) + ")" : "") +
      " — die Testart aus VALD passt nicht zur Kraftkurve. Im Tab „Sprungdaten“ kann die Art korrigiert werden."]);
    var noSide = all.filter(function (r) { var t = K.typeOf(r); return (t === "SL-CMJ" || t === "SL-SJ") && !K.sideOf(r); });
    if (noSide.length) out.push(["Single Leg ohne Seite", noSide.length + " einbeinige Sprünge ohne erkannte Seite (links/rechts) – sie zählen nicht, bis die Seite im Tab „Sprungdaten“ gesetzt ist."]);
    var dj = all.filter(function (r) { var t = K.typeOf(r); return t === "DJ" || t === "SL-DJ"; });
    if (dj.length) out.push(["Drop Jumps nicht ausgewertet", dj.length + " Drop Jump(s) im Speicher – die Drop-Jump-Auswertung gibt es (wie im CMJ Analyzer) noch nicht, sie zählen nicht.", "ok"]);
    var bad = all.filter(function (r) { return !r.ok; });
    if (bad.length) out.push(["Sprünge ohne Auswertung", bad.slice(0, 8).map(function (r) { return r.athlete + " " + A.fmtDate(r.date) + " " + r.trial + ": " + ((r.warnings || [])[0] || "nicht auswertbar"); }).join("; ") + (bad.length > 8 ? " …" : "")]);
    var nosel = all.filter(function (r) { return !r.use; }).length;
    if (nosel) out.push(["Sprünge ausgeschlossen", nosel + " Sprung/Sprünge sind im Tab „Sprungdaten“ abgewählt und zählen nicht.", "ok"]);
    var undated = use.filter(function (r) { return !r.date; }).length;
    if (undated) out.push(["Sprünge ohne Datum", undated + " Sprünge haben kein Datum (Testtag) – im Tab „Sprungdaten“ lässt sich das Datum setzen."]);
    if (S.info.filled && S.info.filled.length) out.push(["CMJ/SJ aus VALD übernommen", S.info.filled.length + " Werte (CMJ bzw. SJ in cm, Sprunghöhe Impuls-Impuls) fehlten im Blatt und stammen aus dem Sprungspeicher; PSA wird daraus gerechnet. Abschaltbar im Tab „Sprungdaten“.", "ok"]);
    if (S.info.diffs && S.info.diffs.length) out.push(["CMJ/SJ im Blatt weicht von VALD ab", S.info.diffs.slice(0, 10).join("; ") + (S.info.diffs.length > 10 ? " … (+" + (S.info.diffs.length - 10) + " weitere)" : "") + " — Abweichung über 2 cm; verwendet wird der Wert aus dem Blatt."]);
    return out;
  };

  /* ---------- Import ---------- */
  /* recs: [{id, name, text, athlete?, date?, source?, testId?, profileId?, testType?, recorded?}] */
  A.ingest = function (recs, progress) {
    var ok = 0, errs = [], i = 0;
    function step() {
      if (i >= recs.length) { S.results = ST.results(); return Promise.resolve({ ok: ok, errs: errs }); }
      var rec = recs[i++], res;
      try {
        res = K.processFile(rec, { thr: S.settings.thr });
        var old = ST.result(rec.id); if (old) { res.use = old.use; res.override = old.override; res.sideOverride = old.sideOverride; }
      } catch (e) { errs.push(rec.name + ": " + e.message); return Promise.resolve().then(step); }
      return ST.saveJump(res, S.settings.keepRaw ? rec.text : null).then(function () {
        ok++; if (progress) progress(i, recs.length);
        return (i % 4 === 0 ? A.tick() : Promise.resolve()).then(step);
      }, function (e) { errs.push(rec.name + ": " + e.message); return step(); });
    }
    return step();
  };
  /* gespeicherte Rohkurven neu auswerten (z. B. nach Änderung der Absprungschwelle) */
  A.reanalyze = function (progress) {
    var list = ST.results(), i = 0, ok = 0, skipped = 0;
    function step() {
      if (i >= list.length) { S.results = ST.results(); return Promise.resolve({ ok: ok, skipped: skipped }); }
      var old = list[i++];
      return ST.getRaw(old.id).then(function (text) {
        if (text == null) { skipped++; return; }
        var res = K.processFile({ id: old.id, name: old.file, text: text, athlete: old.athlete, date: old.date, source: old.source, testId: old.testId,
          profileId: old.profileId, testType: old.testTypeHint, recorded: old.recorded, added: old.added }, { thr: S.settings.thr });
        res.use = old.use; res.override = old.override; res.sideOverride = old.sideOverride;
        return ST.saveJump(res, null).then(function () { ok++; });
      }).catch(function () { skipped++; }).then(function () { if (progress) progress(i, list.length); return i % 4 === 0 ? A.tick() : null; }).then(step);
    }
    return step();
  };
  A.update = function (ids, fn) {
    var list = ids.map(function (id) { return ST.result(id); }).filter(Boolean);
    list.forEach(fn);
    return ST.saveResults(list).then(function () { S.results = ST.results(); });
  };
  A.remove = function (ids) { return ST.deleteJumps(ids).then(function () { S.results = ST.results(); }); };

  /* ---------- Sicherung ---------- */
  A.backup = function (withRaw) {
    return ST.exportBlob(withRaw).then(function (blob) { saveBlob(blob, "Sprungspeicher_" + stamp() + (withRaw ? "_mit_Rohkurven" : "") + ".json"); return blob.size; });
  };
  A.restore = function (file) {
    return file.text().then(function (t) { return ST.importObject(JSON.parse(t)); }).then(function (r) {
      S.results = ST.results(); S.aliases = ST.kvGet("aliases", {}); Object.assign(S.settings, ST.kvGet("settings", {}));
      var base = ST.kvGet("base", null);
      if (base && base.rows && base.rows.length && (typeof DEMO !== "undefined" && DEMO)) { FILE = base.file || FILE; DEMO = false; FOTOS = base.fotos || {}; UNKNOWN = []; BASE_ROWS = base.rows; }
      return r;
    });
  };
  A.wipe = function () {
    return ST.clearAll().then(function () { S.results = []; S.aliases = {}; S.settings = { agg: "best", thr: 20, keepRaw: true, fillCmjSj: true, skipKnown: true }; });
  };

  /* ---------- Start ---------- */
  A.init = function () {
    return ST.init().then(function (info) {
      S.persistent = info.persistent;
      Object.assign(S.settings, ST.kvGet("settings", {}));
      S.aliases = ST.kvGet("aliases", {});
      S.results = ST.results();
      loadSel();
      S.ready = true;
      var base = ST.kvGet("base", null);
      if (base && base.rows && base.rows.length) {
        FILE = base.file || "Gespeichertes Rohdatenblatt"; DEMO = false; FOTOS = base.fotos || {}; UNKNOWN = [];
        ingestRows(base.rows); render();
        toast("Gespeicherte Daten geladen: " + players.length + " Athlet:innen" + (S.results.length ? ", " + S.results.length + " Sprünge" : "") + ".", 4500);
      } else if (S.results.length) {
        FILE = "Sprungspeicher (VALD)"; DEMO = false; ingestRows([]); render();
        toast("Sprungspeicher geladen: " + S.results.length + " Sprünge.", 4500);
      }
      ST.persist();
      if (tab === "sprung" || tab === "parameter") A.onTab(tab);
    });
  };
  return A;
})();
