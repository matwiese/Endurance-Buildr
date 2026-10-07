/* ===== Auswertungsvorlagen (Templates) =====
   Eine Vorlage legt fest, was Einzelauswertung, Profilblatt, PDF und Excel zeigen:
     metrics  – angekreuzte sportmotorische Kennwerte (Schlüssel wie in der Auswertung, inkl. eigener Parameter aus CSV-Importen)
     jump     – Sprungkennwerte aus VALD: Sprungarten (groups) × Kennwerte (params, Namen aus dem ForceDecks-Katalog)
     blocks   – Bausteine: spider (Netzdiagramm), deviation (Vergleich zur Gruppe mit Abweichung), rank (Rangplatz), runs (Durchgänge im Vergleich)
   Eingebaute Vorlagen sind fest im Code und nicht änderbar („Speichern unter …“ legt eine eigene Kopie an).
   Reine Logik ohne Seitenzugriff (läuft auch in Node, siehe tests/). */
var KVTpl = (function () {
  "use strict";
  var BLOCKS = [
    ["spider", "Leistungsprofil (Netzdiagramm)", "Spinnennetz mit den angekreuzten Tests, die dafür vorgesehen sind (mindestens drei nötig)."],
    ["deviation", "Vergleich zur Gruppe", "Regler mit Abweichung vom Durchschnitt der Bootsklasse bzw. des Kaders und Durchschnittswert. Ausgeschaltet: nur Name und Wert."],
    ["rank", "Rangplatz im Kader", "„Platz 3/12“ je Kennwert."],
    ["runs", "Entwicklung (Durchgänge im Vergleich)", "Tabelle der bisherigen Testdurchgänge mit den wichtigsten angekreuzten Tests."]
  ];
  var BLOCK_DEFAULT = { spider: true, deviation: true, rank: false, runs: true };
  var SPIDER = ["fmsSum", "swSum", "cmj", "fmaxRel", "tap", "haeng", "bz1rmRel", "hbl"];
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
      { id: "tpl:sprung", name: "Sprungkraft mit VALD", builtin: true, kind: "list", metrics: ["gr", "gew", "bmi", "cmj", "sj", "psa", "hopL", "hopR", "hopDiff"],
        jump: { groups: ["CMJ", "SJ", "SL-CMJ|L", "SL-CMJ|R", "LSI"], params: JUMP_COMPACT.slice() }, blocks: blocksOf({ rank: true }) }
    ];
  }
  /* gespeicherte Daten prüfen und ergänzen */
  function normalize(t) {
    var o = { id: t.id || newId(), name: String(t.name || "Vorlage").slice(0, 80), builtin: !!t.builtin, kind: t.kind || "list",
      metrics: uniq(t.metrics), jump: { groups: uniq(t.jump && t.jump.groups), params: uniq(t.jump && t.jump.params) }, blocks: blocksOf(t.blocks) };
    if (t.created) o.created = t.created; if (t.updated) o.updated = t.updated;
    return o;
  }
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
    return o;
  }
  function sig(t) {
    var n = normalize(t);
    return JSON.stringify([n.kind, n.metrics.slice().sort(), n.jump.groups.slice().sort(), n.jump.params.slice().sort(), n.blocks]);
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
      templates: list.filter(function (t) { return !t.builtin; }).map(function (t) { var n = normalize(t); return { name: n.name, metrics: n.metrics, jump: n.jump, blocks: n.blocks, created: n.created, updated: n.updated }; }) };
  }
  function fromImport(obj) {
    var list = Array.isArray(obj) ? obj : obj && Array.isArray(obj.templates) ? obj.templates : obj && obj.name ? [obj] : [];
    return list.filter(function (t) { return t && t.name && (Array.isArray(t.metrics) || (t.jump && Array.isArray(t.jump.params))); })
      .map(function (t) { var n = normalize({ name: t.name, metrics: t.metrics, jump: t.jump, blocks: t.blocks, created: t.created, updated: t.updated }); n.id = newId(); n.builtin = false; n.kind = "list"; return n; });
  }

  return { BLOCKS: BLOCKS, BLOCK_DEFAULT: BLOCK_DEFAULT, SPIDER: SPIDER, JUMP_GROUPS: JUMP_GROUPS, JUMP_COMPACT: JUMP_COMPACT, builtins: builtins, normalize: normalize,
    includes: includes, prepare: prepare, expand: expand, same: same, sig: sig, uniqueName: uniqueName, toExport: toExport, fromImport: fromImport, newId: newId, blocksOf: blocksOf };
})();
