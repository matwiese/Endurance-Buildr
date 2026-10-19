/* ===== Auswertungsvorlagen (Templates) =====
   Eine Vorlage legt fest, was Einzelauswertung, Profilblatt, PDF und Excel zeigen:
     metrics  – angekreuzte sportmotorische Kennwerte (Schlüssel wie in der Auswertung, inkl. eigener Parameter aus CSV-Importen)
     jump     – Sprungkennwerte aus VALD: Sprungarten (groups) × Kennwerte (params, Namen aus dem ForceDecks-Katalog)
     blocks   – Bausteine: spider (Netzdiagramm), deviation (Vergleich zur Gruppe mit Abweichung), rank (Rangplatz), runs (Durchgänge im Vergleich),
                overview (PDF: Erweiterte Übersicht am Ende), jumpOne (Sprungtests und Sprungkennwerte aus VALD gemeinsam in einer Karte „Sprungleistung / Schnellkraft“)
     spider   – Achsen des Netzdiagramms in Reihenfolge (3 bis 12). Eintrag = Schlüssel eines sportmotorischen Kennwerts ("cmj", "c_sprint_10_m")
                oder eines Sprungkennwerts als „Sprungart||Kennwert“ ("CMJ||Peak Power / BM"). Fehlt die Angabe (ältere Vorlagen), gelten die
                Standardachsen SPIDER, soweit sie in der Vorlage angekreuzt sind.
   Eingebaute Vorlagen sind fest im Code und nicht änderbar („Speichern unter …“ legt eine eigene Kopie an).
   Reine Logik ohne Seitenzugriff (läuft auch in Node, siehe tests/). */
var KVTpl = (function () {
  "use strict";
  var BLOCKS = [
    ["spider", "Leistungsprofil (Netzdiagramm)", "Spinnennetz mit den angekreuzten Tests, die dafür vorgesehen sind (mindestens drei nötig)."],
    ["deviation", "Vergleich zur Gruppe", "Regler mit Abweichung vom Durchschnitt der Bootsklasse bzw. des Kaders und Durchschnittswert. Ausgeschaltet: nur Name und Wert."],
    ["rank", "Rangplatz im Kader", "„Platz 3/12“ je Kennwert."],
    ["runs", "Entwicklung (Durchgänge im Vergleich)", "Tabelle der bisherigen Testdurchgänge mit den wichtigsten angekreuzten Tests."],
    ["overview", "Erweiterte Übersicht im PDF", "Hängt am Ende des PDF die Tabelle der im Reiter „Erweiterte Übersicht“ gewählten Testtermine an (bis zu fünf, mit Veränderung gegenüber dem Test links davon). Zeigt die Kennwerte der Vorlage."],
    ["jumpOne", "Alle Sprünge in einer Kategorie", "CMJ, SJ, EUR, 5er Hopp und alle angekreuzten Sprungkennwerte aus VALD stehen gemeinsam in der Kategorie „Sprungleistung / Schnellkraft“ statt in mehreren Karten."]
  ];
  var BLOCK_DEFAULT = { spider: true, deviation: true, rank: false, runs: true, overview: true, jumpOne: true };
  var SPIDER = ["fmsSum", "swSum", "cmj", "fmaxRel", "tap", "haeng", "bz1rmRel", "hbl"];
  var SPIDER_MIN = 3, SPIDER_MAX = 12;
  var JUMP_GROUPS = ["CMJ", "SJ", "SL-CMJ|L", "SL-CMJ|R", "SL-SJ|L", "SL-SJ|R", "LSI"];
  /* kompakte Auswahl an Sprungkennwerten (entspricht der Voreinstellung im Reiter „Parameter“) */
  var JUMP_COMPACT = ["Jump Height (Imp-Mom)", "Jump Height (Flight Time)", "RSI-modified (Imp-Mom)", "Flight Time", "Contraction Time", "Countermovement Depth",
    "Concentric Mean Force / BM", "Concentric Peak Force / BM", "Peak Power / BM", "Concentric Impulse", "Vertical Velocity at Takeoff", "Eccentric Braking RFD / BM",
    "Peak Landing Force / BM", "Concentric Impulse Asymmetry", "Concentric Peak Force Asymmetry"];

  function uniq(a) { var s = {}; return (a || []).filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }
  function blocksOf(b) { var o = {}; Object.keys(BLOCK_DEFAULT).forEach(function (k) { o[k] = b && b[k] != null ? !!b[k] : BLOCK_DEFAULT[k]; }); return o; }
  function newId() { return "tpl:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* eingebaute Vorlagen; kind „all“ = alles, „static“ = alle sportmotorischen Kennwerte ohne Sprungkennwerte */
  function builtins() {
    return [
      { id: "tpl:alle", name: "Alle Kennwerte", builtin: true, kind: "all", blocks: blocksOf() },
      { id: "tpl:sportmotorik", name: "Sportmotorik komplett (ohne Sprungkennwerte)", builtin: true, kind: "static", blocks: blocksOf() },
      { id: "tpl:kurz", name: "Kurzprofil (Netzdiagramm-Tests)", builtin: true, kind: "list", metrics: ["gr", "gew", "bmi"].concat(SPIDER), jump: { groups: [], params: [] }, blocks: blocksOf() },
      { id: "tpl:sprung", name: "Sprungleistung mit VALD", builtin: true, kind: "list", metrics: ["gr", "gew", "bmi", "cmj", "sj", "psa", "hopL", "hopR", "hopDiff"],
        jump: { groups: ["CMJ", "SJ", "SL-CMJ|L", "SL-CMJ|R", "LSI"], params: JUMP_COMPACT.slice() }, blocks: blocksOf({ rank: true }),
        spider: ["cmj", "sj", "psa", "hopL", "hopR", "CMJ||RSI-modified (Imp-Mom)", "CMJ||Peak Power / BM", "CMJ||Concentric Peak Force / BM"] },
      /* eine gesamte Sprungauswertung: CMJ, SJ, EUR (= CMJ ÷ SJ), Peak Force (absolut und relativ) von CMJ und SJ, 5er Hopp links/rechts und deren Seitendifferenz */
      { id: "tpl:sprungges", name: "Sprungauswertung gesamt (CMJ, SJ, EUR, Peak Force, 5er Hopp)", builtin: true, kind: "list", metrics: ["cmj", "sj", "eur", "hopL", "hopR", "hopDiff"],
        jump: { groups: ["CMJ", "SJ"], params: ["Concentric Peak Force", "Concentric Peak Force / BM"] }, blocks: blocksOf({ rank: true }),
        spider: ["cmj", "sj", "eur", "CMJ||Concentric Peak Force / BM", "SJ||Concentric Peak Force / BM", "hopL", "hopR", "hopDiff"] }
    ];
  }
  /* Achsen des Netzdiagramms: nur nicht-leere Texte, ohne Doppelte, höchstens SPIDER_MAX; null = Standard */
  function spiderOf(a) {
    if (!Array.isArray(a)) return null;
    return uniq(a.filter(function (x) { return typeof x === "string" && x; })).slice(0, SPIDER_MAX);
  }
  /* gespeicherte Daten prüfen und ergänzen */
  function normalize(t) {
    var o = { id: t.id || newId(), name: String(t.name || "Vorlage").slice(0, 80), builtin: !!t.builtin, kind: t.kind || "list",
      metrics: uniq(t.metrics), jump: { groups: uniq(t.jump && t.jump.groups), params: uniq(t.jump && t.jump.params) }, blocks: blocksOf(t.blocks), spider: spiderOf(t.spider) };
    if (t.created) o.created = t.created; if (t.updated) o.updated = t.updated;
    return o;
  }
  /* Achsen, die die Vorlage tatsächlich verwendet (Reihenfolge wie gespeichert); ohne eigene Angabe die Standardachsen, soweit angekreuzt */
  function spiderIds(t) {
    if (t && t.spider) return t.spider.slice();
    if (t && t.kind === "list") { var have = {}; (t.metrics || []).forEach(function (k) { have[k] = 1; }); return SPIDER.filter(function (k) { return have[k]; }); }
    return SPIDER.slice();
  }
  /* Achsen-Einträge in Metriken der Auswertung auflösen (metrics = Definitionen wie in METRICS); unbekannte und wertungslose (dir 0) entfallen */
  function resolveAxes(ids, metrics) {
    var byK = {}, byJ = {};
    metrics.forEach(function (m) { byK[m.k] = m; if (m.jump) byJ[m.jg + "||" + m.jn] = m; });
    var out = [];
    (ids || []).forEach(function (id) { var m = id.indexOf("||") > 0 ? byJ[id] : byK[id]; if (m && m.dir && out.indexOf(m.k) < 0) out.push(m.k); });
    return out;
  }
  /* Sprungkennwerte, die die Achsen brauchen (Namen aus dem ForceDecks-Katalog) */
  function spiderJumpNames(t) {
    var out = []; spiderIds(t).forEach(function (id) { var i = id.indexOf("||"); if (i > 0 && out.indexOf(id.slice(i + 2)) < 0) out.push(id.slice(i + 2)); });
    return out;
  }
  function axisId(group, name) { return group + "||" + name; }
  /* gehört der Kennwert m (Definition aus der Auswertung) in die Vorlage? */
  function includes(t, m) {
    if (!t || t.kind === "all") return true;
    if (m.jump) return !!t._j && !!t._j[m.jg + "||" + m.jn];
    if (t.kind === "static") return true;
    return !!t._m && !!t._m[m.k];
  }
  /* schneller Nachschlagetisch für includes() */
  function prepare(t) {
    if (!t) return t;
    var c = {}; Object.keys(t).forEach(function (k) { if (k[0] !== "_") c[k] = t[k]; });
    c._m = {}; (t.metrics || []).forEach(function (k) { c._m[k] = 1; });
    c._j = {}; var g = (t.jump && t.jump.groups) || [], p = (t.jump && t.jump.params) || [];
    g.forEach(function (a) { p.forEach(function (b) { c._j[a + "||" + b] = 1; }); });
    return c;
  }
  /* explizite Listen für den Editor: universe = {metrics:[alle sportmotorischen Schlüssel], groups:[...], params:[...]} */
  function expand(t, universe) {
    var o = normalize(t); o.kind = "list";
    if (t.kind === "all") { o.metrics = universe.metrics.slice(); o.jump = { groups: universe.groups.slice(), params: universe.params.slice() }; }
    else if (t.kind === "static") { o.metrics = universe.metrics.slice(); o.jump = { groups: [], params: [] }; }
    /* im Editor immer eine ausdrückliche Liste: ohne eigene Angabe die Standardachsen (bei zu wenigen angekreuzten alle acht) */
    if (!o.spider) { var d = spiderIds(o); o.spider = d.length >= SPIDER_MIN ? d : SPIDER.slice(); }
    return o;
  }
  function sig(t) {
    var n = normalize(t);
    return JSON.stringify([n.kind, n.metrics.slice().sort(), n.jump.groups.slice().sort(), n.jump.params.slice().sort(), n.blocks, n.spider]);   /* die Reihenfolge der Achsen zählt */
  }
  function same(a, b) { return sig(a) === sig(b); }
  function uniqueName(list, base) {
    var names = list.map(function (t) { return t.name; }), nm = base, k = 2;
    while (names.indexOf(nm) >= 0) nm = base + " (" + (k++) + ")";
    return nm;
  }
  /* Austausch als Datei */
  function toExport(list) {
    return { format: "kader-auswertungsvorlagen", version: 1, exported: new Date().toISOString(),
      templates: list.filter(function (t) { return !t.builtin; }).map(function (t) { var n = normalize(t); return { name: n.name, metrics: n.metrics, jump: n.jump, blocks: n.blocks, spider: n.spider, created: n.created, updated: n.updated }; }) };
  }
  function fromImport(obj) {
    var list = Array.isArray(obj) ? obj : obj && Array.isArray(obj.templates) ? obj.templates : obj && obj.name ? [obj] : [];
    return list.filter(function (t) { return t && t.name && (Array.isArray(t.metrics) || (t.jump && Array.isArray(t.jump.params))); })
      .map(function (t) { var n = normalize({ name: t.name, metrics: t.metrics, jump: t.jump, blocks: t.blocks, spider: t.spider, created: t.created, updated: t.updated }); n.id = newId(); n.builtin = false; n.kind = "list"; return n; });
  }

  return { BLOCKS: BLOCKS, BLOCK_DEFAULT: BLOCK_DEFAULT, SPIDER: SPIDER, SPIDER_MIN: SPIDER_MIN, SPIDER_MAX: SPIDER_MAX, spiderOf: spiderOf, spiderIds: spiderIds,
    resolveAxes: resolveAxes, spiderJumpNames: spiderJumpNames, axisId: axisId, JUMP_GROUPS: JUMP_GROUPS, JUMP_COMPACT: JUMP_COMPACT, builtins: builtins, normalize: normalize,
    includes: includes, prepare: prepare, expand: expand, same: same, sig: sig, uniqueName: uniqueName, toExport: toExport, fromImport: fromImport, newId: newId, blocksOf: blocksOf };
})();
