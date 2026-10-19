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
    settings: { agg: "best", thr: 20, keepRaw: true, fillCmjSj: true, skipKnown: true, showClass: false },
    templates: [], activeTpl: "tpl:alle", custom: [], imports: [], tplVer: 0,
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

  /* ---------- Auswertungsvorlagen ---------- */
  function allTemplates() { return KVTpl.builtins().concat(S.templates.map(function (t) { return KVTpl.normalize(t); })); }
  A.templates = allTemplates;
  A.findTemplate = function (id) { var l = allTemplates(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; };
  var prepCache = { key: "", t: null };
  /* Entwurf: ungespeicherte Änderungen im Editor der Auswertungstemplates wirken sofort (Echtzeit) auf Einzelauswertung, PDF und Excel,
     bis sie gespeichert oder verworfen werden. Der Entwurf ersetzt dabei die aktive Vorlage. */
  var draft = null, rtmr = null;
  function scheduleRefresh() { clearTimeout(rtmr); rtmr = setTimeout(function () { A.refresh(true); }, 200); }
  A.setDraft = function (id, name, tpl) {
    draft = { id: id, name: name, t: KVTpl.prepare(KVTpl.normalize(Object.assign({}, tpl, { id: id, name: name }))) };
    S.tplVer++; A.renderTplSelect(); scheduleRefresh();
  };
  A.clearDraft = function (refresh) { if (!draft) return; draft = null; S.tplVer++; A.renderTplSelect(); if (refresh !== false) scheduleRefresh(); };
  A.hasDraft = function () { return !!draft; };
  A.activeTemplate = function () {
    if (draft) return draft.t;
    var key = S.activeTpl + "|" + S.tplVer;
    if (prepCache.key !== key) { var t = A.findTemplate(S.activeTpl) || A.findTemplate("tpl:alle"); prepCache = { key: key, t: KVTpl.prepare(t) }; }
    return prepCache.t;
  };
  var memo = { list: null, ver: "", out: null };
  /* Filter für die Ausgaben (Einzelauswertung, Profilblatt, PDF, Excel): nur die Kennwerte der aktiven Vorlage */
  A.tplMetrics = function (list) {
    var t = A.activeTemplate(), ver = S.activeTpl + "|" + S.tplVer + "|" + list.length;
    if (!t || t.kind === "all") return list;
    if (memo.list === list && memo.ver === ver) return memo.out;
    memo = { list: list, ver: ver, out: list.filter(function (m) { return KVTpl.includes(t, m); }) };
    return memo.out;
  };
  /* Achsen des Netzdiagramms der aktiven Vorlage als Metrik-Schlüssel (Sprungkennwerte ohne Daten und Kennwerte ohne Wertung entfallen) */
  A.tplSpider = function () { return KVTpl.resolveAxes(KVTpl.spiderIds(A.activeTemplate()), METRICS); };
  A.tplBlock = function (name) { var t = A.activeTemplate(); return !t || t.blocks[name] !== false; };
  A.tplName = function () { var t = A.activeTemplate(); return t ? t.name + (draft ? " (Entwurf)" : "") : ""; };
  A.tplIsAll = function () { var t = A.activeTemplate(); return !draft && (!t || t.kind === "all"); };
  /* alle wählbaren Kennwerte: sportmotorisch (inkl. eigene Parameter) und Sprungkennwerte */
  A.universe = function () {
    return { metrics: STATIC_METRICS.map(function (m) { return m.k; }).concat(S.custom.map(function (m) { return m.k; })),
      groups: KVTpl.JUMP_GROUPS.slice(), params: selNames() };   /* „Alle Kennwerte“ = alle Tests + die im Reiter „Parameter“ gewählten Sprungkennwerte */
  };
  A.saveTemplates = function () { S.tplVer++; ST.kvSet("templates", S.templates); A.renderTplSelect(); };
  A.setActive = function (id) {
    if (!A.findTemplate(id)) id = "tpl:alle";
    draft = null; S.activeTpl = id; S.tplVer++; ST.kvSet("activeTemplate", id);
    A.refresh(true); A.renderTplSelect();
    if (tab === "templates" && A.renderTemplates) A.renderTemplates();
  };
  A.renderTplSelect = function () {
    var sel = document.getElementById("tplSel"); if (!sel) return;
    var b = KVTpl.builtins(), own = S.templates.slice().sort(function (x, y) { return x.name.localeCompare(y.name, "de"); });
    sel.replaceChildren();
    var og = function (label, list) { var g = document.createElement("optgroup"); g.label = label; list.forEach(function (t) { var o = document.createElement("option"); o.value = t.id; o.textContent = t.name; o.selected = t.id === S.activeTpl; g.append(o); }); return g; };
    sel.append(og("Vorlagen", b)); if (own.length) sel.append(og("Meine Vorlagen", own));
    sel.value = A.findTemplate(S.activeTpl) ? S.activeTpl : "tpl:alle";
    var note = document.getElementById("tplNote");
    if (note) { note.textContent = A.tplIsAll() ? "" : draft ? "Entwurf: " + draft.name + " (nicht gespeichert)" : "Vorlage: " + A.tplName(); note.hidden = A.tplIsAll(); }
  };

  /* ---------- Zusatzdaten aus CSV (eigene Parameter und weitere Messwerte) ---------- */
  A.addImport = function (rec, newDefs) {
    newDefs.forEach(function (d) { if (!S.custom.some(function (x) { return x.k === d.k; })) S.custom.push(d); });
    S.imports.push(rec);
    ST.kvSet("custom", S.custom); ST.kvSet("imports", S.imports); S.tplVer++;
  };
  A.removeImport = function (id) { S.imports = S.imports.filter(function (x) { return x.id !== id; }); ST.kvSet("imports", S.imports); S.tplVer++; };
  /* ein eigener Parameter samt seiner Werte (in allen Importen) und Erwähnung in Vorlagen entfernen */
  A.removeCustom = function (key) {
    S.custom = S.custom.filter(function (d) { return d.k !== key; });
    S.imports.forEach(function (imp) { imp.rows.forEach(function (r) { delete r[key]; }); });
    S.imports = S.imports.filter(function (imp) { return imp.rows.some(function (r) { return Object.keys(r).some(function (k) { return k !== "name" && k !== "date" && k !== "q"; }); }); });
    S.templates.forEach(function (t) { t.metrics = (t.metrics || []).filter(function (k) { return k !== key; }); if (t.spider) t.spider = t.spider.filter(function (k) { return k !== key; }); });
    ST.kvSet("custom", S.custom); ST.kvSet("imports", S.imports); ST.kvSet("templates", S.templates); S.tplVer++;
  };
  A.saveCustom = function () { ST.kvSet("custom", S.custom); S.tplVer++; };

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
  /* CSV-Zusatzdaten in die Zeilen des Rohdatenblatts mischen (nach Name und Testtag; weitere Personen kommen als eigene Zeilen dazu) */
  function mergeImports(rows) {
    var info = { rows: 0, added: 0, unmatched: {} };
    if (!S.imports.length) return info;
    var hadBase = rows.length > 0, canons = {}, idx = {};
    rows.forEach(function (r) { var c = K.canonName(r.name); if (c && !canons[c]) canons[c] = r.name; idx[c + "|" + dateKey(r.date)] = r; });
    S.imports.forEach(function (imp) {
      imp.rows.forEach(function (ir) {
        var c = K.canonName(ir.name), al = S.aliases[c];
        if (al && al !== OWN) c = K.canonName(al);
        var hit = K.findMatch(c, Object.keys(canons)), key = hit || c, ik = key + "|" + dateKey(ir.date), row = idx[ik];
        if (!row) {
          row = { name: hit ? canons[hit] : ir.name, date: ir.date || "", q: {}, importOnly: true }; rows.push(row); idx[ik] = row; if (!hit) canons[c] = ir.name; info.added++;
          if (!hit && hadBase) info.unmatched[ir.name] = (info.unmatched[ir.name] || 0) + 1;
        }
        Object.keys(ir).forEach(function (k) {
          if (k === "name" || k === "date" || k === "q" || ir[k] == null) return;
          if (!imp.overwrite && row[k] != null) return;   /* Blattwerte bleiben, außer der Import ist zum Überschreiben gedacht */
          row[k] = ir[k];
        });
        info.rows++;
      });
    });
    return info;
  }
  A.mergeRows = function (rows) {
    var imp = mergeImports(rows), excel = {};
    rows.forEach(function (r) { var c = K.canonName(r.name); if (c && !excel[c]) excel[c] = r.name; });
    S.excel = excel;
    var hadExcel = Object.keys(excel).length > 0;
    var names = selNames();
    var tpl = A.activeTemplate();   /* die Sprungkennwerte der aktiven Vorlage stehen immer zur Verfügung, auch wenn sie im Reiter „Parameter“ nicht angehakt sind */
    if (tpl && tpl.kind === "list") tpl.jump.params.forEach(function (n) { if (K.BYNAME[n] && names.indexOf(n) < 0) names.push(n); });
    if (tpl) KVTpl.spiderJumpNames(tpl).forEach(function (n) { if (K.BYNAME[n] && names.indexOf(n) < 0) names.push(n); });   /* Achsen des Netzdiagramms brauchen ihre Kennwerte auch ohne Haken */
    var need = names.slice(); if (need.indexOf(K.BEST_KEY) < 0) need.push(K.BEST_KEY);
    var table = K.buildTable(S.results, { agg: S.settings.agg, names: need, resolve: resolver(excel) });
    var defs = K.metricDefs(table, names), keep = {}; defs.forEach(function (d) { keep[d.k] = 1; });
    S.table = table; S.defs = defs; setDynamicMetrics(S.custom.concat(defs));
    var idx = {};
    rows.forEach(function (r) { idx[K.canonName(r.name) + "|" + dateKey(r.date)] = r; });   /* bei doppelten Zeilen gewinnt die untere */
    var info = { matched: 0, added: 0, filled: [], diffs: [], imp: imp };
    table.forEach(function (e) {
      var k = e.key + "|" + dateKey(e.date), row = idx[k];
      if (!row) { row = { name: e.athlete, date: e.date, q: {}, jumpOnly: true }; rows.push(row); idx[k] = row; info.added++; } else info.matched++;
      var vals = K.rowValues(e); Object.keys(vals).forEach(function (m) { if (keep[m]) row[m] = vals[m]; });
      /* CMJ-/SJ-Felder des Rohdatenblatts aus VALD füllen (Blattwert hat Vorrang; große Abweichung wird gemeldet) */
      [["cmj", "CMJ"], ["sj", "SJ"]].forEach(function (x) {
        var g = e.groups[x[1]], h = g && g.vals[K.BEST_KEY];
        if (h == null) return;
        row[x[0] === "cmj" ? "vCmj" : "vSj"] = h;   /* Höhe aus VALD merken (für den EUR, auch wenn das Füllen der Blattfelder abgeschaltet ist) */
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
    if (typeof DEMO !== "undefined" && DEMO && (S.results.some(K.usable) || S.imports.length)) { DEMO = false; FILE = S.results.length ? "Sprungspeicher (VALD)" : "CSV-Import"; BASE_ROWS = []; }
    S.dirty = !quiet; rebuildTests(); render();
  };
  A.afterRender = function () {
    if (!S.dirty) return; S.dirty = false;
    if (tab === "sprung" && A.renderSprung) A.renderSprung();
    if (tab === "parameter" && A.renderParams) A.renderParams();
    if (tab === "templates" && A.renderTemplates) A.renderTemplates();
  };
  A.onTab = function (t) {
    if (t === "sprung" && A.renderSprung) A.renderSprung();
    if (t === "parameter" && A.renderParams) A.renderParams();
    if (t === "templates" && A.renderTemplates) A.renderTemplates();
  };
  A.clearBase = function () { ST.kvDelete("base"); };
  A.rememberBase = function (rows, fname, fotos) { ST.kvSet("base", { rows: rows, file: fname, fotos: fotos || {}, saved: Date.now() }); };

  /* ---------- Hinweise für das Blatt „Datenqualität“ ---------- */
  A.flags = function (f) {
    var all = S.results, out = f.slice();
    if (!A.tplIsAll()) out.push(["Auswertungsvorlage aktiv", "„" + A.tplName() + "“ – Einzelauswertung, Profilblatt, PDF und Excel zeigen nur die Kennwerte dieser Vorlage. Wechsel oben rechts oder im Reiter „Auswertungstemplates“.", "ok"]);
    if (S.imports.length) {
      var ii = S.info.imp || { rows: 0, added: 0, unmatched: {} }, un0 = Object.keys(ii.unmatched || {});
      out.push(["Zusatzdaten aus CSV", S.imports.length + " Import(e) mit " + ii.rows + " Zeilen, " + S.custom.length + " eigene Parameter. Verwaltung im Reiter „Auswertungstemplates“.", "ok"]);
      if (un0.length) out.push(["CSV-Namen nicht im Rohdatenblatt", un0.join(", ") + " — kein gleicher Name im Blatt gefunden; sie erscheinen als eigene Personen ohne Bootsklasse."]);
    }
    if (!all.length) return out;
    var use = all.filter(K.usable), athletes = {}, days = {}, types = {};
    all.forEach(function (r) { athletes[r.athlete] = 1; });
    use.forEach(function (r) { if (r.date) days[r.date] = 1; });
    all.forEach(function (r) { var t = K.typeOf(r); types[t] = (types[t] || 0) + 1; });
    var tt = Object.keys(types).map(function (t) { return types[t] + "× " + A.typeLabel(t); }).join(", ");
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
  /* Zustand aus dem Speicher in den Arbeitsspeicher holen (Start, Wiederherstellung) */
  A.loadState = function () {
    Object.assign(S.settings, ST.kvGet("settings", {}));
    S.aliases = ST.kvGet("aliases", {});
    S.results = ST.results();
    S.templates = (ST.kvGet("templates", []) || []).map(function (t) { return KVTpl.normalize(t); });
    S.activeTpl = ST.kvGet("activeTemplate", "tpl:alle");
    S.custom = ST.kvGet("custom", []) || [];
    S.imports = ST.kvGet("imports", []) || [];
    S.tplVer++;
    var base = ST.kvGet("base", null);
    return base;
  };
  A.restore = function (file) {
    return file.text().then(function (t) { return ST.importObject(JSON.parse(t)); }).then(function (r) { A.afterRestore(); return r; });
  };
  A.afterRestore = function () {
    var base = A.loadState();
    if (base && base.rows && base.rows.length && (typeof DEMO !== "undefined" && DEMO)) { FILE = base.file || FILE; DEMO = false; FOTOS = base.fotos || {}; UNKNOWN = []; BASE_ROWS = base.rows; }
    A.renderTplSelect();
  };
  A.wipe = function () {
    return ST.clearAll().then(function () {
      draft = null; S.results = []; S.aliases = {}; S.templates = []; S.activeTpl = "tpl:alle"; S.custom = []; S.imports = []; S.tplVer++;
      S.settings = { agg: "best", thr: 20, keepRaw: true, fillCmjSj: true, skipKnown: true, showClass: false }; A.renderTplSelect();
    });
  };

  /* ---------- Start ---------- */
  A.init = function () {
    return ST.init().then(function (info) {
      S.persistent = info.persistent;
      var base = A.loadState();
      loadSel();
      S.ready = true;
      A.renderTplSelect();
      if (base && base.rows && base.rows.length) {
        FILE = base.file || "Gespeichertes Rohdatenblatt"; DEMO = false; FOTOS = base.fotos || {}; UNKNOWN = [];
        ingestRows(base.rows); render();
        toast("Gespeicherte Daten geladen: " + players.length + " Athlet:innen" + (S.results.length ? ", " + S.results.length + " Sprünge" : "") + ".", 4500);
      } else if (S.results.length || S.imports.length) {
        FILE = S.results.length ? "Sprungspeicher (VALD)" : "CSV-Import"; DEMO = false; ingestRows([]); render();
        toast("Gespeicherte Daten geladen" + (S.results.length ? ": " + S.results.length + " Sprünge" : "") + ".", 4500);
      } else if (S.templates.length || S.activeTpl !== "tpl:alle") { rebuildTests(); render(); }
      ST.persist();
      KVSync.init().then(function (sy) { if (sy.handle && sy.perm !== "granted") toast("Sicherungsordner: Zugriff bitte im Reiter „Auswertungstemplates“ bestätigen.", 6500); });
      if (tab === "sprung" || tab === "parameter" || tab === "templates") A.onTab(tab);
    });
  };
  return A;
})();
