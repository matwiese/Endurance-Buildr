/* ===== CSV-Import weiterer Messwerte (sportmotorische Tests) =====
   Liest eine CSV mit Name, Testdatum und beliebig vielen Messspalten ein. Jede Spalte wird einem bekannten Test zugeordnet
   oder als neuer („eigener“) Parameter angelegt. So lassen sich auch nachträglich weitere Parameter ergänzen.
   Abhängigkeiten der Segeln-Auswertung (CSV-Leser, Überschriften-Erkennung, Zahlen) kommen über ctx, damit die Logik testbar bleibt:
     ctx = { hnorm(text), hmap: {normalisierte Überschrift → {k,t}}, num(wert), serialToIso(zahl), metrics: {schlüssel → Definition} } */
var CsvImport = (function () {
  "use strict";
  var OWN_GROUP = "Eigene Parameter";
  var NAME_WORDS = ["name", "athlet", "athletin", "athletinnen", "athlet:in", "person", "sportler", "sportlerin", "nachname", "vorname", "namen"];
  var DATE_WORDS = ["testdatum", "datum", "date", "testtermin", "termin", "messdatum"];

  function slug(s) { return String(s).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
  /* „Sprint 10 m [s]“ → Name „Sprint 10 m“, Einheit „s“ */
  function splitHeader(h) {
    var m = String(h).match(/^(.*?)\s*[\[(]([^\])]{1,14})[\])]\s*$/);
    return m && m[1].trim() ? { name: m[1].trim(), unit: m[2].trim() } : { name: String(h).trim(), unit: "" };
  }
  /* Text aus Bytes: UTF-8, sonst Windows-1252 (Excel-CSV mit Umlauten) */
  function decode(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder("windows-1252").decode(buf); }
  }
  function decimals(v) { var m = String(v).trim().match(/[.,](\d+)\s*$/); return m ? Math.min(3, m[1].length) : 0; }

  function analyze(grid, ctx) {
    if (!grid || grid.length < 2) throw new Error("Die Datei enthält keine Datenzeilen.");
    var hr = -1, s;
    for (s = 0; s < Math.min(grid.length, 6) && hr < 0; s++) {
      if ((grid[s] || []).some(function (h) { var n = ctx.hnorm(h), d = ctx.hmap[n]; return (d && d.k === "name") || NAME_WORDS.indexOf(n) >= 0; })) hr = s;
    }
    if (hr < 0) throw new Error("Keine Spalte „Name“ gefunden. Die erste Zeile muss Überschriften enthalten, eine davon „Name“.");
    var head = grid[hr], body = grid.slice(hr + 1).filter(function (r) { return r && r.some(function (c) { return String(c == null ? "" : c).trim() !== ""; }); });
    var haveName = false, haveDate = false;
    var columns = head.map(function (h, i) {
      var text = String(h == null ? "" : h).trim(), n = ctx.hnorm(text), vals = [];
      body.forEach(function (r) { var v = r[i]; if (v != null && String(v).trim() !== "") vals.push(v); });
      var numeric = vals.filter(function (v) { return ctx.num(v) != null; }).length;
      var col = { index: i, header: text, sample: vals.slice(0, 4).map(String), n: vals.length, numeric: numeric, guess: { action: "ignore", note: "" } };
      if (!text) { col.guess.note = "ohne Überschrift"; return col; }
      var known = ctx.hmap[n] || ctx.hmap[ctx.hnorm(text.replace(/\[.*?\]/g, ""))];
      if (/^qualitaet|^qualitat/.test(n)) { col.guess.note = "Qualitätsangabe wird nicht übernommen"; return col; }
      if ((known && known.k === "name") || (NAME_WORDS.indexOf(n) >= 0 && !haveName)) { if (!haveName) { haveName = true; col.guess = { action: "name" }; } return col; }
      if ((known && known.k === "date") || DATE_WORDS.indexOf(n) >= 0) { if (!haveDate) { haveDate = true; col.guess = { action: "date" }; } return col; }
      if (known && known.t === "num") {
        var def = ctx.metrics[known.k];
        if (def && def.calc) col.guess.note = "wird von der App aus anderen Werten gerechnet";
        else col.guess = { action: "metric", key: known.k };
        return col;
      }
      if (known) { col.guess.note = "Stammdaten bitte über „Rohdaten laden“"; return col; }
      if (vals.length && numeric / vals.length >= 0.6) {
        var sp = splitHeader(text), dp = 0;
        vals.forEach(function (v) { if (ctx.num(v) != null) dp = Math.max(dp, decimals(v)); });
        col.guess = { action: "new", name: sp.name, unit: sp.unit, dp: dp, dir: 0, group: OWN_GROUP };
      } else col.guess.note = "kein Zahlenwert";
      return col;
    });
    return { hr: hr, columns: columns, rows: body.length };
  }

  /* Neue Parameter aus dem Plan anlegen (oder gleichnamige vorhandene weiterverwenden) */
  function defineMetrics(plan, existing, staticKeys) {
    var byKey = {}, defs = [], keyOf = {}, here = {};
    existing.forEach(function (d) { byKey[d.k] = d; });
    plan.columns.forEach(function (c) {
      if (c.action !== "new") return;
      var nm = String(c.name || "").trim(); if (!nm) return;
      var key = "c_" + slug(nm), n = 2;
      var prior = byKey[key];
      /* gleicher Name wie ein Parameter aus einem früheren Import → derselbe Parameter (so lassen sich Werte nachtragen);
         zweimal derselbe Name in einer Datei → zweiter Parameter mit Zusatz „(2)“ */
      if (prior && prior.t === nm && !here[key]) { keyOf[c.index] = key; here[key] = 1; return; }
      while (byKey[key] || staticKeys.indexOf(key) >= 0) key = "c_" + slug(nm) + "_" + (n++);
      var shown = n > 2 ? nm + " (" + (n - 1) + ")" : nm;
      var unit = String(c.unit || "").trim(), dir = +c.dir === 1 ? 1 : +c.dir === -1 ? -1 : 0;
      var d = { k: key, t: shown, u: unit, d: Math.max(0, Math.min(3, +c.dp || 0)), dir: dir, g: String(c.group || OWN_GROUP).trim() || OWN_GROUP, pp: (unit === "%" || unit === "Pkt") ? 1 : 0, custom: 1 };
      byKey[key] = d; here[key] = 1; defs.push(d); keyOf[c.index] = key;
    });
    return { defs: defs, keyOf: keyOf };
  }

  /* Zeilen aus der CSV nach dem Plan; plan.columns[i].action: name | date | metric(key) | new | ignore */
  function buildRows(grid, plan, keyOf, ctx) {
    var nameI = -1, dateI = -1, cols = [];
    plan.columns.forEach(function (c) {
      if (c.action === "name" && nameI < 0) nameI = c.index;
      else if (c.action === "date" && dateI < 0) dateI = c.index;
      else if (c.action === "metric" && c.key) cols.push([c.index, c.key]);
      else if (c.action === "new" && keyOf[c.index]) cols.push([c.index, keyOf[c.index]]);
    });
    if (nameI < 0) throw new Error("Es ist keine Spalte als „Name“ gewählt.");
    if (!cols.length) throw new Error("Es ist keine Messspalte zum Übernehmen gewählt.");
    var rows = [], skipped = 0, bad = 0;
    grid.slice(plan.hr + 1).forEach(function (r) {
      r = r || [];
      var name = String(r[nameI] == null ? "" : r[nameI]).trim();
      if (!name || /^(summe|mittelwert|durchschnitt|min|max)\b/i.test(name)) { if (name) skipped++; return; }
      var date = dateI >= 0 ? r[dateI] : "";
      if (typeof date === "number") date = ctx.serialToIso(date);
      date = String(date == null ? "" : date).trim() || String(plan.defaultDate || "");
      var o = { name: name, date: date, q: {} }, any = false;
      cols.forEach(function (c) {
        var raw = r[c[0]], v = ctx.num(raw);
        if (v != null) { o[c[1]] = v; any = true; } else if (raw != null && String(raw).trim() !== "") bad++;
      });
      if (any) rows.push(o); else skipped++;
    });
    return { rows: rows, skipped: skipped, bad: bad };
  }

  return { OWN_GROUP: OWN_GROUP, slug: slug, splitHeader: splitHeader, decode: decode, analyze: analyze, defineMetrics: defineMetrics, buildRows: buildRows };
})();
