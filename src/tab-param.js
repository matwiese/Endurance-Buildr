/* ===== Tab „Parameter“: Auswahl aller ForceDecks-Kennwerte, gespeicherte Kombinationen, Werte-Tabelle =====
   Funktion und Aussehen entsprechen dem Parameter-Tab des CMJ Analyzers (ohne Video und Diagramme).
   Neu: Die Auswahl bestimmt, welche Kennwerte in Einzel- und Teamauswertung erscheinen. */
(function (A) {
  "use strict";
  var S = A.S, K = KVCore, el = A.el, nf = A.nf;
  var SETS_KEY = "cmj_metric_sets_v1";   /* gleicher Schlüssel wie im CMJ Analyzer */
  var P = { mode: "vald", pickerOpen: false, pickerQuery: "", tableQuery: "", who: "", date: "", group: "" };
  var COMPACT = A.DEFAULT_SEL;
  var BUILTIN = {
    "builtin:vald": { name: "VALD-Standard", metrics: CMJ.VALD_DEFAULT, builtin: true },
    "builtin:compact": { name: "Kompakt (Sprunghöhe, Kraft, Leistung)", metrics: COMPACT, builtin: true },
    "builtin:all": { name: "Alle Metriken", metrics: K.ALL.map(function (m) { return m.name; }), builtin: true }
  };
  var SetStore = {
    load: function () { try { var r = JSON.parse(localStorage.getItem(SETS_KEY)); if (r && typeof r.sets === "object") return { sets: r.sets, active: r.active || null }; } catch (e) {} return { sets: {}, active: null }; },
    save: function () { try { localStorage.setItem(SETS_KEY, JSON.stringify(db)); return true; } catch (e) { return false; } }
  };
  var db = SetStore.load();
  function validNames(list) { var seen = {}; return (list || []).filter(function (n) { if (!K.BYNAME[n] || seen[n]) return false; seen[n] = 1; return true; }); }
  function allSets() { return Object.assign({}, BUILTIN, db.sets); }
  function activeSet() { return allSets()[db.active] || null; }
  function sameSel(names) { return names.length === S.sel.size && names.every(function (n) { return S.sel.has(n); }); }
  function matchingSet() { var a = allSets(), k = Object.keys(a).filter(function (id) { return sameSel(validNames(a[id].metrics)); }); return k.length ? k[0] : null; }
  function setDirty() { var a = activeSet(); return a ? !sameSel(validNames(a.metrics)) : S.sel.size > 0 && !matchingSet(); }
  function newSetId() { return "set:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function uniqueName(base) { var names = Object.keys(db.sets).map(function (k) { return db.sets[k].name; }), nm = base, k = 2; while (names.indexOf(nm) >= 0) nm = base + " (" + (k++) + ")"; return nm; }
  function ymd() { return new Date().toISOString().slice(0, 10); }

  /* Auswahl hat sich geändert: speichern, Auswertung (verzögert) neu aufbauen */
  var tmr = null;
  function selChanged() {
    A.saveSel();
    clearTimeout(tmr); tmr = setTimeout(function () { A.refresh(true); var n = document.getElementById("kvParNote"); if (n) n.textContent = noteText(); }, 350);
  }
  function noteText() { return S.sel.size + " von " + K.ALL.length + " Kennwerten aktiv · wirken auf Einzel- und Teamauswertung"; }

  /* ---------- Leiste: Kombinationen laden/speichern/umbenennen/löschen/exportieren/importieren ---------- */
  function metricSetBar(onApply) {
    var box = el("div", { class: "kv-setbar" }), mode = null;
    var fileIn = el("input", { type: "file", accept: ".json,application/json", style: "display:none" });
    function render() {
      box.replaceChildren();
      if (!activeSet()) { var m = matchingSet(); if (m) { db.active = m; SetStore.save(); } }
      var act = activeSet(), dirty = setDirty();
      var own = Object.keys(db.sets).map(function (id) { return [id, db.sets[id]]; }).sort(function (a, b) { return a[1].name.localeCompare(b[1].name, "de"); });
      var sel = el("select", { "aria-label": "Parameterkombination wählen" }, el("option", { value: "", selected: !act }, "– eigene Auswahl –"),
        el("optgroup", { label: "Vorlagen" }, Object.keys(BUILTIN).map(function (id) { return el("option", { value: id, selected: db.active === id }, BUILTIN[id].name + " (" + validNames(BUILTIN[id].metrics).length + ")"); })),
        own.length ? el("optgroup", { label: "Meine Kombinationen" }, own.map(function (x) { return el("option", { value: x[0], selected: db.active === x[0] }, x[1].name + " (" + validNames(x[1].metrics).length + ")"); })) : null);
      sel.onchange = function () { if (!sel.value) return; if (setDirty() && !sameSel(validNames(allSets()[sel.value].metrics))) { mode = { load: sel.value }; render(); } else load(sel.value); };
      var b = function (label, fn, cls, dis) { return el("button", { type: "button", class: "kv-b s " + (cls || ""), disabled: !!dis, onclick: fn }, label); };
      var status = el("span", { class: "kv-status" + (dirty ? " dirty" : act ? " ok" : "") }, act ? (dirty ? "„" + act.name + "“ geändert – nicht gespeichert" : "„" + act.name + "“ aktiv") : S.sel.size + " Kennwerte, nicht gespeichert");
      box.append(el("span", { class: "lab" }, "Parameterkombination:"), sel,
        b("Speichern", saveCurrent, dirty && act && !act.builtin ? "p" : "", !act || act.builtin || !dirty),
        b("Speichern unter …", function () { mode = "saveas"; render(); }, dirty && (!act || act.builtin) ? "p" : ""),
        b("Umbenennen", function () { mode = "rename"; render(); }, "", !act || act.builtin),
        b("Löschen", function () { mode = "delete"; render(); }, "d", !act || act.builtin),
        el("span", { class: "kv-sep" }), b("Exportieren", exportSets, "", !own.length), b("Importieren", function () { fileIn.click(); }), status);
      if (mode === "saveas" || mode === "rename") {
        var inp = el("input", { type: "text", maxlength: 60, placeholder: "Name der Kombination, z. B. „Sprungkraft Segeln“", value: mode === "rename" ? act.name : "" });
        var ok = function () { var nm = inp.value.trim(); if (!nm) { inp.focus(); return; } if (mode === "rename") renameActive(nm); else saveAs(nm); mode = null; render(); };
        inp.addEventListener("keydown", function (e) { if (e.key === "Enter") ok(); if (e.key === "Escape") { mode = null; render(); } });
        box.append(el("div", { class: "kv-dialog" }, el("span", {}, mode === "rename" ? "Neuer Name:" : "Aktuelle Auswahl (" + S.sel.size + " Kennwerte) speichern als:"), inp,
          b(mode === "rename" ? "Umbenennen" : "Speichern", ok, "p"), b("Abbrechen", function () { mode = null; render(); })));
        setTimeout(function () { inp.focus(); }, 0);
      } else if (mode === "delete") {
        box.append(el("div", { class: "kv-dialog" }, el("span", {}, "Kombination „" + act.name + "“ wirklich löschen? Die aktuell angehakten Kennwerte bleiben erhalten."),
          b("Löschen", function () { delete db.sets[db.active]; db.active = null; SetStore.save(); mode = null; toast("Kombination gelöscht."); render(); }, "d"), b("Abbrechen", function () { mode = null; render(); })));
      } else if (mode && mode.load) {
        var target = allSets()[mode.load];
        box.append(el("div", { class: "kv-dialog" }, el("span", {}, "Die aktuelle Auswahl hat ungespeicherte Änderungen. „" + target.name + "“ trotzdem laden?"),
          b("Laden", function () { var id = mode.load; mode = null; load(id); }, "p"), b("Zuerst speichern unter …", function () { mode = "saveas"; render(); }), b("Abbrechen", function () { mode = null; render(); })));
      }
    }
    function load(id) { var x = allSets()[id]; S.sel = new Set(validNames(x.metrics)); db.active = id; SetStore.save(); onApply(); render(); selChanged(); toast("„" + x.name + "“ geladen (" + S.sel.size + " Kennwerte)."); }
    function persist(msg) { toast(SetStore.save() ? msg : "Speichern im Browser nicht möglich – bitte „Exportieren“ nutzen."); }
    function saveCurrent() { var x = db.sets[db.active]; if (!x) return; x.metrics = Array.from(S.sel); x.updated = new Date().toISOString(); persist("„" + x.name + "“ gespeichert."); render(); }
    function saveAs(nm) { var id = newSetId(), now = new Date().toISOString(); db.sets[id] = { name: uniqueName(nm), metrics: Array.from(S.sel), created: now, updated: now }; db.active = id; persist("„" + db.sets[id].name + "“ gespeichert."); }
    function renameActive(nm) { var x = db.sets[db.active]; if (!x) return; x.name = nm === x.name ? nm : uniqueName(nm); x.updated = new Date().toISOString(); persist("Umbenannt."); }
    function exportSets() {
      var payload = { format: "cmj-analyzer-metric-sets", version: 1, exported: new Date().toISOString(), sets: Object.keys(db.sets).map(function (k) { var x = db.sets[k]; return { name: x.name, metrics: x.metrics, created: x.created, updated: x.updated }; }) };
      saveBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "Parameterkombinationen_" + ymd() + ".json"); toast("Kombinationen exportiert.");
    }
    fileIn.addEventListener("change", function () {
      var f = fileIn.files[0]; fileIn.value = ""; if (!f) return;
      f.text().then(function (t) {
        var j = JSON.parse(t), list = Array.isArray(j) ? j : Array.isArray(j.sets) ? j.sets : (j.name && j.metrics ? [j] : []), n = 0, skipped = 0, dupes = 0;
        list.forEach(function (x) {
          var m = validNames(x.metrics); skipped += (x.metrics || []).length - m.length; if (!x.name || !m.length) return;
          var dup = Object.keys(db.sets).some(function (k) { var y = db.sets[k]; return y.name === String(x.name) && y.metrics.length === m.length && m.every(function (q) { return y.metrics.indexOf(q) >= 0; }); });
          if (dup) { dupes++; return; }
          var now = new Date().toISOString(); db.sets[newSetId()] = { name: uniqueName(String(x.name)), metrics: m, created: x.created || now, updated: now }; n++;
        });
        SetStore.save(); render();
        toast(n ? n + " Kombination" + (n > 1 ? "en" : "") + " importiert" + (skipped ? " (" + skipped + " unbekannte Kennwerte übersprungen)" : "") + (dupes ? ", " + dupes + " bereits vorhanden" : "") + "." : dupes ? "Alle Kombinationen sind bereits vorhanden." : "Keine gültige Kombination in der Datei gefunden.");
      }).catch(function () { toast("Datei konnte nicht gelesen werden (kein gültiges JSON)."); });
    });
    box.refresh = function () { if (!mode) render(); };
    box.append(fileIn); render();
    return box;
  }

  /* ---------- Suche ---------- */
  function tokens(q) { return q.toLowerCase().split(/\s+/).filter(Boolean); }
  function matches(m, toks) { var hay = (m.name + " " + m.cat + " " + m.unit).toLowerCase(); return toks.every(function (t) { return hay.indexOf(t) >= 0; }); }
  function highlight(text, toks) {
    var frag = document.createDocumentFragment(); if (!toks.length) { frag.append(text); return frag; }
    var low = text.toLowerCase(), marks = new Array(text.length).fill(false);
    toks.forEach(function (t) { var k = low.indexOf(t); while (k >= 0) { for (var q = k; q < k + t.length; q++) marks[q] = true; k = low.indexOf(t, k + 1); } });
    var i = 0; while (i < text.length) { var j = i; while (j < text.length && marks[j] === marks[i]) j++; frag.append(marks[i] ? el("mark", {}, text.slice(i, j)) : text.slice(i, j)); i = j; }
    return frag;
  }

  /* ---------- Welche Versuche zeigt die Tabelle? (Athlet:in · Testtag · Sprungart) ---------- */
  function options() {
    var by = {};
    S.results.forEach(function (r) {
      if (!r.ok) return; var g = K.groupOf(r); if (!g) return;
      var who = A.resolve(r.athlete), e = by[who.key] || (by[who.key] = { key: who.key, name: who.display, dates: {} });
      var d = e.dates[r.date || ""] || (e.dates[r.date || ""] = {}); d[g] = (d[g] || 0) + 1;
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name, "de"); });
  }
  function currentTrials(opts) {
    var e = opts.filter(function (x) { return x.key === P.who; })[0] || opts[0]; if (!e) return { e: null, trials: [], dates: [], groups: [] };
    P.who = e.key;
    var dates = Object.keys(e.dates).sort().reverse(); if (dates.indexOf(P.date) < 0) P.date = dates[0];
    var groups = Object.keys(e.dates[P.date]).sort(function (a, b) { return K.GROUPS[a].order - K.GROUPS[b].order; }); if (groups.indexOf(P.group) < 0) P.group = groups[0];
    var trials = S.results.filter(function (r) { return r.ok && K.groupOf(r) === P.group && (r.date || "") === P.date && A.resolve(r.athlete).key === P.who; })
      .sort(function (a, b) { return String(a.trial).localeCompare(String(b.trial), undefined, { numeric: true }); });
    return { e: e, trials: trials, dates: dates, groups: groups };
  }
  function stats(vals) {
    var nums = vals.map(K.numOf).filter(K.fin), mean = nums.length ? nums.reduce(function (a, b) { return a + b; }, 0) / nums.length : NaN;
    var sd = nums.length > 1 ? Math.sqrt(nums.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (nums.length - 1)) : NaN;
    return { mean: mean, sd: sd, cv: Math.abs(mean) > 0 ? sd / Math.abs(mean) * 100 : NaN };
  }
  function cellText(v, dp) { return v && typeof v === "object" ? (K.fin(v.v) ? (nf(v.v, dp) + " " + v.side).trim() : "–") : nf(v, dp); }
  /* Zeilen der Tabelle: {grp} oder {label, unit, dp, vals, name?, mean, sd, cv, flow} */
  function matrix(trials, group, useQuery) {
    var rows = [], toks = useQuery ? tokens(P.tableQuery) : [];
    var used = trials.filter(function (r) { return r.use; });
    if (P.mode === "vald") {
      CMJ.VALD_CATALOG.forEach(function (c) {
        var sel = c[1].filter(function (p) { return S.sel.has(p[0]) && K.groupAllows(group, c[0]) && matches({ name: p[0], cat: c[0], unit: p[1] }, toks); });
        if (!sel.length) return;
        rows.push({ grp: c[0] });
        sel.forEach(function (p) {
          var vals = trials.map(function (r) { var v = K.valuesOf(r); return v ? v[p[0]] : undefined; });
          var ag = used.length ? K.aggregate(used, S.settings.agg, [p[0]])[p[0]] : undefined;
          rows.push(Object.assign({ label: p[0], unit: p[1], dp: p[2], vals: vals, flow: ag }, stats(vals)));
        });
      });
      return rows;
    }
    CMJ.METRICS.forEach(function (g) {
      rows.push({ grp: g[0] });
      g[1].forEach(function (m) {
        var vals = trials.map(function (r) { return r.lit ? r.lit[m[0]] : undefined; });
        rows.push(Object.assign({ label: m[1], unit: m[2], dp: m[3], vals: vals }, stats(vals)));
      });
    });
    return rows;
  }
  function exportCsv(trials, rows) {
    var q = function (s) { s = String(s); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var f = function (v, dp) { var x = K.numOf(v); return K.fin(x) ? x.toFixed(dp).replace(".", ",") : ""; };
    var head = ["Kennwert", "Einheit"].concat(trials.map(function (t) { return t.trial + (t.use ? "" : " (ausgeschlossen)"); })).concat(["Mittelwert", "SD", "CV %"]);
    if (P.mode === "vald") head.push("In Auswertung (" + K.AGG[S.settings.agg] + ")");
    var lines = [head.map(q).join(";")];
    rows.forEach(function (r) { if (r.grp) { lines.push(q(r.grp)); return; }
      var line = [r.label, r.unit].concat(r.vals.map(function (v) { return cellText(v, r.dp).replace(/ [LR]$/, ""); }), [f(r.mean, r.dp), f(r.sd, r.dp), f(r.cv, 1)]);
      if (P.mode === "vald") line.push(f(r.flow, r.dp));
      lines.push(line.map(q).join(";")); });
    saveBlob(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), "Sprung_Kennwerte_" + stamp() + ".csv"); toast("CSV gespeichert.");
  }

  /* ================= Aufbau des Tabs ================= */
  A.renderParams = function () {
    var root = document.getElementById("kvParam"); if (!root) return;
    if (!S.ready) { root.replaceChildren(el("div", { class: "kv-empty" }, "Sprungspeicher wird geöffnet …")); return; }
    var note = document.getElementById("kvParNote"); if (note) note.textContent = noteText();
    var pane = el("div", { class: "kv-stack" });
    root.replaceChildren(pane);

    var seg = el("div", { class: "kv-seg", role: "group", "aria-label": "Parametersatz" }, [["vald", "ForceDecks-Metriken"], ["lit", "Literatur-Parameter"]].map(function (x) {
      return el("button", { type: "button", "aria-pressed": String(P.mode === x[0]), onclick: function () { P.mode = x[0]; A.renderParams(); } }, x[1]); }));
    var opts = options(), cur = currentTrials(opts), tableBox = el("div");
    var csvBtn = el("button", { class: "kv-b", type: "button", disabled: !cur.trials.length }, "Als CSV exportieren");
    var bar = el("div", { class: "kv-row" }, seg);
    var main = el("div", { class: "kv-panel" }, el("h3", {}, "Parameter"),
      el("p", { class: "hint" }, P.mode === "vald"
        ? "Hake an, welche ForceDecks-Kennwerte in die Auswertung gehen. Die Auswahl gilt für CMJ, SJ und Single Leg und wirkt sofort auf Einzel- und Teamauswertung. Kombinationen lassen sich speichern und wieder laden."
        : "Alle Kraft-Zeit-Parameter des CMJ Analyzers (nur Ansicht, nicht auswählbar) – für CMJ und Single-Leg-Sprünge."), bar);
    pane.append(main);

    if (P.mode === "vald") {
      var count = el("span", { class: "kv-status" });
      var pickBtn = el("button", { class: "kv-b p", type: "button", "aria-expanded": String(P.pickerOpen) });
      var tSearch = el("input", { type: "search", class: "tsearch", placeholder: "In Ergebnissen suchen…", "aria-label": "In Ergebnissen suchen", value: P.tableQuery, style: "max-width:240px" });
      tSearch.addEventListener("input", function () { P.tableQuery = tSearch.value; renderTable(); });
      bar.append(pickBtn, tSearch, count, csvBtn);
      var picker = el("div", { class: "kv-picker" }); picker.hidden = !P.pickerOpen;
      var syncHead = function () { count.textContent = S.sel.size + " von " + K.ALL.length + " Kennwerten aktiv"; pickBtn.textContent = P.pickerOpen ? "Auswahl schließen" : "Kennwerte auswählen"; pickBtn.setAttribute("aria-expanded", String(P.pickerOpen)); };
      pickBtn.onclick = function () { P.pickerOpen = !P.pickerOpen; picker.hidden = !P.pickerOpen; syncHead(); if (P.pickerOpen) pSearch.focus(); };
      var pSearch = el("input", { type: "search", placeholder: "Kennwert suchen, z. B. „braking rfd“, „asymmetry landing“, „left impulse“", "aria-label": "Kennwert suchen", value: P.pickerQuery });
      var hits = el("span", { class: "kv-mini" }), listBox = el("div", { class: "kv-picker-list" });
      var act = function (label, fn) { return el("button", { type: "button", class: "kv-l", onclick: fn }, label); };
      var visible = function () { var t = tokens(P.pickerQuery); return K.ALL.filter(function (m) { return matches(m, t); }); };
      var changed = function () { A.saveSel(); syncHead(); renderList(); renderTable(); setBar.refresh(); selChanged(); };
      picker.append(el("div", { class: "kv-picker-top" }, pSearch, hits,
        act("Treffer anhaken", function () { visible().forEach(function (m) { S.sel.add(m.name); }); changed(); }), act("Treffer abwählen", function () { visible().forEach(function (m) { S.sel.delete(m.name); }); changed(); }),
        act("VALD-Standard", function () { S.sel = new Set(CMJ.VALD_DEFAULT); changed(); }), act("Alle", function () { K.ALL.forEach(function (m) { S.sel.add(m.name); }); changed(); }), act("Keine", function () { S.sel.clear(); changed(); })), listBox);
      pSearch.addEventListener("input", function () { P.pickerQuery = pSearch.value; renderList(); });
      var renderList = function () {
        var toks = tokens(P.pickerQuery), total = 0; listBox.replaceChildren();
        CMJ.VALD_CATALOG.forEach(function (c) {
          var items = c[1].filter(function (p) { return matches({ name: p[0], cat: c[0], unit: p[1] }, toks); }); if (!items.length) return; total += items.length;
          var on = c[1].filter(function (p) { return S.sel.has(p[0]); }).length, ul = el("div", { class: "kv-items" });
          items.forEach(function (p) {
            var cb = el("input", { type: "checkbox", checked: S.sel.has(p[0]) });
            cb.addEventListener("change", function () { if (cb.checked) S.sel.add(p[0]); else S.sel.delete(p[0]); changed(); });
            ul.append(el("label", {}, cb, el("span", {}, highlight(p[0], toks), p[1] ? el("small", {}, " [" + p[1] + "]") : null)));
          });
          listBox.append(el("section", {}, el("div", { class: "kv-cat-head" }, el("h4", {}, c[0]), el("span", { class: "h" }, on + "/" + c[1].length),
            act("alle", function () { items.forEach(function (p) { S.sel.add(p[0]); }); changed(); }), act("keine", function () { items.forEach(function (p) { S.sel.delete(p[0]); }); changed(); })), ul));
        });
        hits.textContent = toks.length ? total + " Treffer" : "";
        if (!total) listBox.append(el("p", { class: "kv-hint" }, "Kein Kennwert gefunden. Versuch einen kürzeren Begriff oder englische Namen wie im VALD-Export."));
      };
      renderList(); syncHead();
      var setBar = metricSetBar(function () { syncHead(); renderList(); renderTable(); });
      main.append(setBar, picker);
    } else bar.append(csvBtn);

    /* Auswahl: wessen Versuche zeigt die Tabelle */
    var res = el("div", { class: "kv-panel" }, el("h3", {}, "Kennwerte der Versuche"));
    pane.append(res);
    if (!cur.e) {
      res.append(el("div", { class: "kv-empty" }, el("strong", {}, "Noch keine ausgewerteten Sprünge"), el("p", {}, "Du kannst Kombinationen schon jetzt zusammenstellen und speichern. Die Werte erscheinen nach dem Import im Tab „Sprungdaten“.")));
    } else {
      var whoSel = el("select", { "aria-label": "Athlet:in" }, opts.map(function (x) { return el("option", { value: x.key, selected: x.key === P.who }, x.name); }));
      var dateSel = el("select", { "aria-label": "Testtag" }, cur.dates.map(function (d) { return el("option", { value: d, selected: d === P.date }, A.fmtDate(d)); }));
      var grpSel = el("select", { "aria-label": "Sprungart" }, cur.groups.map(function (g) { return el("option", { value: g, selected: g === P.group }, K.GROUPS[g].label.replace(" (VALD)", "") + " (" + cur.e.dates[P.date][g] + ")"); }));
      whoSel.onchange = function () { P.who = whoSel.value; P.date = ""; P.group = ""; A.renderParams(); };
      dateSel.onchange = function () { P.date = dateSel.value; P.group = ""; A.renderParams(); };
      grpSel.onchange = function () { P.group = grpSel.value; A.renderParams(); };
      res.append(el("div", { class: "kv-row" }, el("label", {}, "Athlet:in:", whoSel), el("label", {}, "Testtag:", dateSel), el("label", {}, "Sprungart:", grpSel)));
    }
    var warns = cur.trials.map(function (t) { return (t.warnings || []).length ? t.trial + ": " + t.warnings.join(" ") : null; }).filter(Boolean);
    if (warns.length) res.append(el("div", { class: "kv-panel kv-warn", style: "padding:10px 14px;margin:0 0 12px;font-size:12.5px" }, warns.join(" | ")));
    res.append(tableBox);

    function renderTable() {
      tableBox.replaceChildren();
      if (!cur.trials.length) return;
      if (P.mode === "lit" && !/CMJ/.test(P.group)) { tableBox.append(el("div", { class: "kv-empty" }, "Literatur-Parameter gibt es nur für CMJ und Single-Leg-CMJ. Für Squat Jumps die ForceDecks-Metriken verwenden.")); return; }
      var rows = matrix(cur.trials, P.group, true), multi = cur.trials.length > 1;
      csvBtn.onclick = function () { exportCsv(cur.trials, matrix(cur.trials, P.group, false)); };
      if (!rows.length) { tableBox.append(el("div", { class: "kv-empty" }, el("strong", {}, S.sel.size ? "Keine Treffer" : "Keine Kennwerte ausgewählt"), el("p", {}, S.sel.size ? "Kein aktiver Kennwert passt zur Suche in den Ergebnissen." : "Öffne „Kennwerte auswählen“ und hake an, was du sehen möchtest."))); return; }
      var toks = P.mode === "vald" ? tokens(P.tableQuery) : [], flow = P.mode === "vald";
      var ncol = 2 + cur.trials.length + (multi ? 3 : 0) + (flow ? 1 : 0);
      var head = el("tr", {}, el("th", {}, P.mode === "vald" ? "Kennwert" : "Parameter"), el("th", {}, "Einheit"),
        cur.trials.map(function (t) { return el("th", { class: "n", title: t.file }, t.trial + (t.use ? "" : " ✕")); }),
        multi ? [el("th", { class: "n" }, "Mittelwert"), el("th", { class: "n" }, "SD"), el("th", { class: "n" }, "CV %")] : null,
        flow ? el("th", { class: "n", title: "Dieser Wert geht in Einzel- und Teamauswertung: " + K.AGG[S.settings.agg] }, "→ Auswertung") : null);
      var body = el("tbody");
      rows.forEach(function (r) {
        if (r.grp) { body.append(el("tr", { class: "grp" }, el("td", { colspan: ncol }, r.grp))); return; }
        body.append(el("tr", {}, el("td", {}, highlight(r.label, toks)), el("td", { class: "u" }, r.unit),
          r.vals.map(function (v) { return el("td", { class: "n" }, cellText(v, r.dp)); }),
          multi ? [el("td", { class: "n stat" }, nf(r.mean, r.dp)), el("td", { class: "n stat" }, nf(r.sd, r.dp)), el("td", { class: "n stat" }, nf(r.cv, 1))] : null,
          flow ? el("td", { class: "n", style: "font-weight:700" }, nf(r.flow, r.dp)) : null));
      });
      tableBox.append(el("div", { class: "kv-tblbox", style: "max-height:560px;overflow:auto" }, el("table", { class: "kv-t" }, el("thead", {}, head), body)),
        el("p", { class: "kv-note" }, flow ? "Spalte „→ Auswertung“: der Wert, der aus den Versuchen entsteht (" + K.AGG[S.settings.agg] + "; ausgeschlossene Versuche ✕ zählen nicht). Einstellung im Tab „Sprungdaten“." : ""));
    }
    renderTable();
    var det = el("details", { class: "kv-d" }); det.innerHTML = P.mode === "vald" ? KV_METHODS.vald : KV_METHODS.lit; pane.append(det);
  };
})(KVApp);
