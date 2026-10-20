/* ===== Reiter „Auswertungstemplates“ =====
   0. Einzelauswertung: Kategorien und Tests per Häkchen – jede Änderung wirkt sofort (als Entwurf) auf den Reiter „Einzelauswertung“
   1. Vorlagen wählen, ändern, speichern (eigene Vorlagen), Austausch als Datei
   2. Bausteine der Ausgabe (Netzdiagramm, Vergleich zur Gruppe, Rang, Durchgänge) und Achsen des Netzdiagramms (Anzahl und je Achse ein Kennwert)
   3. Auswahl der sportmotorischen Tests und der Sprungkennwerte (VALD) – nur das Angekreuzte erscheint in Einzelauswertung, PDF und Excel
   4. Weitere Parameter per CSV nachträglich importieren (eigene Parameter)
   5. Speicher: Browser-Datenbank und automatische Sicherung in einen Ordner */
(function (A) {
  "use strict";
  var S = A.S, K = KVCore, ST = KVStore, el = A.el, nf = A.nf;
  var U = { id: "", d: null, mq: "", jq: "", mode: null, imp: null, delCustom: "", sync: null, importBusy: false, prev: "" };
  function put(parent) { Array.prototype.slice.call(arguments, 1).forEach(function (k) { if (k != null && k !== false) parent.append(k); }); return parent; }
  function btn(label, fn, cls, o) { o = o || {}; return el("button", { type: "button", class: "kv-b " + (cls || ""), disabled: !!o.disabled, title: o.title || false, onclick: fn }, label); }

  /* ---------- Arbeitskopie der Vorlage ---------- */
  function load(id) {
    var t = A.findTemplate(id) || A.findTemplate("tpl:alle"), x = KVTpl.expand(t, A.universe());
    A.clearDraft();   /* ein anderer Stand wird geöffnet: der Entwurf der bisherigen Vorlage endet */
    U.id = t.id;
    U.d = { name: t.name, builtin: !!t.builtin, metrics: new Set(x.metrics), groups: new Set(x.jump.groups), params: new Set(x.jump.params), blocks: Object.assign({}, x.blocks), spider: x.spider.slice() };
  }
  function toTpl() {
    return { name: U.d.name, kind: "list", metrics: Array.from(U.d.metrics), jump: { groups: Array.from(U.d.groups), params: Array.from(U.d.params) }, blocks: Object.assign({}, U.d.blocks), spider: U.d.spider.slice() };
  }
  function savedExpanded() { return KVTpl.expand(A.findTemplate(U.id), A.universe()); }
  function dirty() { return !KVTpl.same(toTpl(), savedExpanded()); }
  function counts() {
    var m = Array.from(U.d.metrics).filter(function (k) { return A.universe().metrics.indexOf(k) >= 0; }).length;
    return { m: m, j: U.d.groups.size * U.d.params.size, p: U.d.params.size, g: U.d.groups.size };
  }

  /* ---------- Auswahllisten (wie im Reiter „Parameter“) ---------- */
  function tokens(q) { return q.toLowerCase().split(/\s+/).filter(Boolean); }
  function highlight(text, toks) {
    var frag = document.createDocumentFragment(); if (!toks.length) { frag.append(text); return frag; }
    var low = text.toLowerCase(), marks = new Array(text.length).fill(false);
    toks.forEach(function (t) { var k = low.indexOf(t); while (k >= 0) { for (var q = k; q < k + t.length; q++) marks[q] = true; k = low.indexOf(t, k + 1); } });
    var i = 0; while (i < text.length) { var j = i; while (j < text.length && marks[j] === marks[i]) j++; frag.append(marks[i] ? el("mark", {}, text.slice(i, j)) : text.slice(i, j)); i = j; }
    return frag;
  }
  /* cfg: cats [{name, items:[{key,label,unit,note}]}], has(key), set(keys,on), getQ(), setQ(q), actions:[[label,fn]], onChange(), height */
  function picker(cfg) {
    var box = el("div", { class: "kv-picker" }), list = el("div", { class: "kv-picker-list", style: cfg.height ? "max-height:" + cfg.height + "px" : "" }), hits = el("span", { class: "kv-mini" });
    var act = function (label, fn) { return el("button", { type: "button", class: "kv-l", onclick: fn }, label); };
    var q = el("input", { type: "search", placeholder: cfg.placeholder || "Suchen …", "aria-label": "Kennwert suchen", value: cfg.getQ() });
    var match = function (it, cat, toks) { var hay = (it.label + " " + cat + " " + (it.unit || "")).toLowerCase(); return toks.every(function (t) { return hay.indexOf(t) >= 0; }); };
    var visible = function () { var toks = tokens(cfg.getQ()), out = []; cfg.cats.forEach(function (c) { c.items.forEach(function (it) { if (match(it, c.name, toks)) out.push(it.key); }); }); return out; };
    function render() {
      var toks = tokens(cfg.getQ()), total = 0; list.replaceChildren();
      cfg.cats.forEach(function (c) {
        var items = c.items.filter(function (it) { return match(it, c.name, toks); }); if (!items.length) return; total += items.length;
        var on = c.items.filter(function (it) { return cfg.has(it.key); }).length, ul = el("div", { class: "kv-items" });
        items.forEach(function (it) {
          var cb = el("input", { type: "checkbox", checked: cfg.has(it.key) });
          cb.addEventListener("change", function () { cfg.set([it.key], cb.checked); cfg.onChange(); render(); });
          ul.append(el("label", {}, cb, el("span", {}, highlight(it.label, toks), it.unit ? el("small", {}, " [" + it.unit + "]") : null, it.note ? el("small", { class: "kv-calc" }, " · " + it.note) : null)));
        });
        list.append(el("section", {}, el("div", { class: "kv-cat-head" }, el("h4", {}, c.name), el("span", { class: "h" }, on + "/" + c.items.length),
          act("alle", function () { cfg.set(items.map(function (i) { return i.key; }), true); cfg.onChange(); render(); }),
          act("keine", function () { cfg.set(items.map(function (i) { return i.key; }), false); cfg.onChange(); render(); })), ul));
      });
      hits.textContent = toks.length ? total + " Treffer" : "";
      if (!total) list.append(el("p", { class: "kv-hint" }, "Nichts gefunden. Versuch einen kürzeren Begriff."));
    }
    q.addEventListener("input", function () { cfg.setQ(q.value); render(); });
    put(box, el("div", { class: "kv-picker-top" }, q, hits,
      act("Treffer anhaken", function () { cfg.set(visible(), true); cfg.onChange(); render(); }), act("Treffer abwählen", function () { cfg.set(visible(), false); cfg.onChange(); render(); }),
      (cfg.actions || []).map(function (a) { return act(a[0], function () { a[1](); cfg.onChange(); render(); }); })), list);
    render();
    return box;
  }

  /* ================= 1. Vorlagenleiste ================= */
  function panelBar() {
    var box = el("div", { class: "kv-panel", id: "kvTplBar" }), isDirty = dirty(), t = A.findTemplate(U.id), own = !t.builtin;
    var mk = function (list) { return list.map(function (x) { return el("option", { value: x.id, selected: x.id === U.id }, x.name + (x.id === S.activeTpl ? "  ✓ aktiv" : "")); }); };
    var sel = el("select", { "aria-label": "Vorlage wählen", style: "min-width:280px" },
      el("optgroup", { label: "Vorlagen" }, mk(KVTpl.builtins())),
      S.templates.length ? el("optgroup", { label: "Meine Vorlagen" }, mk(S.templates.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "de"); }))) : null);
    sel.onchange = function () { if (isDirty) { U.mode = { load: sel.value }; render(); } else { load(sel.value); A.renderTemplates(); } };
    var status = el("span", { class: "kv-status" + (isDirty ? " dirty" : S.activeTpl === U.id ? " ok" : "") },
      isDirty ? "„" + U.d.name + "“ geändert – nicht gespeichert" : S.activeTpl === U.id ? "„" + U.d.name + "“ ist die aktive Auswertung" : "„" + U.d.name + "“");
    var b = function (label, fn, cls, dis, title) { return btn(label, fn, "s " + (cls || ""), { disabled: dis, title: title }); };
    var row = el("div", { class: "kv-setbar" }, el("span", { class: "lab" }, "Vorlage:"), sel,
      b("Als Auswertung verwenden", function () { A.setActive(U.id); toast("„" + U.d.name + "“ wird jetzt für Einzelauswertung, PDF und Excel verwendet.", 4500); }, "p", isDirty || S.activeTpl === U.id,
        isDirty ? "Erst speichern" : "Einzelauswertung, Profilblatt, PDF und Excel zeigen dann nur die Kennwerte dieser Vorlage"),
      b("Speichern", saveCurrent, isDirty && own ? "p" : "", !own || !isDirty), b("Speichern unter …", function () { U.mode = "saveas"; render(); }, isDirty && !own ? "p" : ""),
      b("Änderungen verwerfen", function () { load(U.id); A.renderTemplates(); }, "", !isDirty, "Setzt die Auswahl auf den gespeicherten Stand zurück"),
      b("Umbenennen", function () { U.mode = "rename"; render(); }, "", !own), b("Löschen", function () { U.mode = "delete"; render(); }, "d", !own),
      el("span", { class: "kv-sep" }), b("Exportieren", exportTpls, "", !S.templates.length), b("Importieren", function () { fileIn.click(); }), status);
    var fileIn = el("input", { type: "file", accept: ".json,application/json", style: "display:none" });
    fileIn.onchange = function () {
      var f = fileIn.files[0]; fileIn.value = ""; if (!f) return;
      f.text().then(function (txt) {
        var list = KVTpl.fromImport(JSON.parse(txt)); if (!list.length) { toast("Keine gültige Vorlage in der Datei."); return; }
        list.forEach(function (x) { x.name = KVTpl.uniqueName(A.templates(), x.name); S.templates.push(x); });
        A.saveTemplates(); load(list[0].id); A.renderTemplates(); toast(list.length + " Vorlage" + (list.length > 1 ? "n" : "") + " importiert.");
      }).catch(function () { toast("Datei nicht lesbar (kein gültiges JSON)."); });
    };
    function render() { var n = panelBar(); box.replaceWith(n); }
    put(box, el("h3", {}, "Vorlage"), el("p", { class: "hint" }, "Eine Vorlage legt fest, was Einzelauswertung, Profilblatt, PDF und Excel zeigen – inklusive der Statistiken im PDF. Eingebaute Vorlagen lassen sich nicht ändern; mit „Speichern unter …“ entsteht eine eigene Kopie, die dauerhaft gespeichert wird."), row, fileIn);
    if (U.mode === "saveas" || U.mode === "rename") {
      var inp = el("input", { type: "text", maxlength: 80, placeholder: "Name der Vorlage, z. B. „Kader-Testtag Frühjahr“", value: U.mode === "rename" ? U.d.name : "" });
      var ok = function () {
        var nm = inp.value.trim(); if (!nm) { inp.focus(); return; }
        if (U.mode === "rename") { var x = findOwn(U.id); x.name = KVTpl.uniqueName(A.templates().filter(function (y) { return y.id !== U.id; }), nm); x.updated = new Date().toISOString(); U.d.name = x.name; A.saveTemplates(); toast("Umbenannt."); }
        else saveAs(nm);
        U.mode = null; A.renderTemplates();
      };
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") ok(); if (e.key === "Escape") { U.mode = null; render(); } });
      put(box, el("div", { class: "kv-dialog" }, el("span", {}, U.mode === "rename" ? "Neuer Name:" : "Aktuelle Auswahl speichern als:"), inp, btn(U.mode === "rename" ? "Umbenennen" : "Speichern", ok, "p s"), btn("Abbrechen", function () { U.mode = null; render(); }, "s")));
      setTimeout(function () { inp.focus(); }, 0);
    } else if (U.mode === "delete") {
      put(box, el("div", { class: "kv-dialog" }, el("span", {}, "Vorlage „" + U.d.name + "“ wirklich löschen?" + (S.activeTpl === U.id ? " Danach gilt wieder „Alle Kennwerte“." : "")),
        btn("Löschen", function () {
          S.templates = S.templates.filter(function (x) { return x.id !== U.id; });
          var wasActive = S.activeTpl === U.id; U.mode = null;
          if (wasActive) A.setActive("tpl:alle"); A.saveTemplates(); load("tpl:alle"); A.renderTemplates(); toast("Vorlage gelöscht.");
        }, "d s"), btn("Abbrechen", function () { U.mode = null; render(); }, "s")));
    } else if (U.mode && U.mode.load) {
      var target = A.findTemplate(U.mode.load);
      put(box, el("div", { class: "kv-dialog" }, el("span", {}, "„" + U.d.name + "“ hat ungespeicherte Änderungen. „" + target.name + "“ trotzdem öffnen?"),
        btn("Öffnen", function () { var id = U.mode.load; U.mode = null; load(id); A.renderTemplates(); }, "p s"), btn("Zuerst speichern unter …", function () { U.mode = "saveas"; render(); }, "s"), btn("Abbrechen", function () { U.mode = null; render(); }, "s")));
    }
    return box;
  }
  function findOwn(id) { for (var i = 0; i < S.templates.length; i++) if (S.templates[i].id === id) return S.templates[i]; return null; }
  function saveCurrent() {
    var x = findOwn(U.id); if (!x) return; var n = toTpl(), had = A.hasDraft();
    x.metrics = n.metrics; x.jump = n.jump; x.blocks = n.blocks; x.spider = n.spider; x.updated = new Date().toISOString();
    A.clearDraft(false); A.saveTemplates();
    if (had || S.activeTpl === U.id) A.setActive(U.id);   /* was als Entwurf in der Einzelauswertung zu sehen war, gilt jetzt */
    toast("„" + x.name + "“ gespeichert" + (had ? " und als Auswertung aktiv." : "."), 4500); A.renderTemplates();
  }
  function saveAs(nm) {
    var n = toTpl(), t = KVTpl.normalize({ id: KVTpl.newId(), name: KVTpl.uniqueName(A.templates(), nm), metrics: n.metrics, jump: n.jump, blocks: n.blocks, spider: n.spider, created: new Date().toISOString(), updated: new Date().toISOString() });
    var had = A.hasDraft();
    S.templates.push(t); U.id = t.id; U.d.name = t.name; U.d.builtin = false; A.clearDraft(false); A.saveTemplates();
    if (had) A.setActive(t.id);
    toast("„" + t.name + "“ gespeichert" + (had ? " und als Auswertung aktiv" : "") + " – dauerhaft im Sprungspeicher.", 4500);
  }
  function exportTpls() { saveBlob(new Blob([JSON.stringify(KVTpl.toExport(S.templates), null, 2)], { type: "application/json" }), "Auswertungsvorlagen_" + stamp() + ".json"); toast("Vorlagen exportiert."); }

  /* ================= 0. Einzelauswertung: Kategorien und Echtzeit ================= */
  /* Kategorien wie in der Einzelauswertung; Sprungleistung / Schnellkraft enthält die Sprungtests, dazu kommen die VALD-Kennwerte (unten) */
  function singleCats() {
    var cats = [], idx = {};
    STATIC_METRICS.concat(S.custom).forEach(function (m) {
      var c = idx[m.g]; if (!c) { c = idx[m.g] = { name: m.g, keys: [] }; cats.push(c); }
      c.keys.push(m.k);
    });
    return cats;
  }
  function panelSingle() {
    var box = el("div", { class: "kv-panel", id: "kvSingle" }, el("h3", {}, "Einzelauswertung"),
      el("p", { class: "hint" }, "Hake an, welche Tests in der Einzelauswertung erscheinen – ganze Kategorien hier, einzelne Tests und die Sprungkennwerte weiter unten. Jede Änderung wirkt sofort im Reiter „Einzelauswertung“ (als Entwurf, bis Du speicherst). Alle Sprünge – CMJ, SJ, 5er Hopp, EUR und die angekreuzten VALD-Kennwerte – stehen dort in der Kategorie „" + JUMPCAT + "“."));
    var status = A.hasDraft() ? el("span", { class: "kv-status dirty" }, "Entwurf aktiv – in der Einzelauswertung schon sichtbar, noch nicht gespeichert") : el("span", { class: "kv-status ok" }, "Einzelauswertung zeigt den gespeicherten Stand von „" + U.d.name + "“" + (S.activeTpl === U.id ? "" : " (Vorlage ist noch nicht aktiv)"));
    put(box, el("div", { class: "kv-row" }, btn("Einzelauswertung ansehen", function () { setTab("einzel"); }, "p s"), status));
    var chips = el("div", { class: "kv-cats" });
    singleCats().forEach(function (c) {
      var on = c.keys.filter(function (k) { return U.d.metrics.has(k); }).length, cb = el("input", { type: "checkbox", checked: on === c.keys.length });
      cb.indeterminate = on > 0 && on < c.keys.length;
      cb.onchange = function () { c.keys.forEach(function (k) { cb.checked ? U.d.metrics.add(k) : U.d.metrics.delete(k); }); refreshTests(); refreshBar(); };
      var extra = c.name === JUMPCAT ? " + " + (U.d.groups.size && U.d.params.size ? U.d.params.size + " VALD-Kennwerte × " + U.d.groups.size + " Sprungarten" : "VALD-Kennwerte (unten)") : "";
      chips.append(el("label", { class: "kv-cat" }, cb, el("span", {}, el("b", {}, c.name), el("small", {}, on + " von " + c.keys.length + extra))));
    });
    put(box, chips);
    return box;
  }
  function refreshSingle() { var o = document.getElementById("kvSingle"); if (o) o.replaceWith(panelSingle()); }
  function refreshTests() { var o = document.getElementById("kvTests"); if (o) o.replaceWith(panelTests()); }

  /* ================= 2. Bausteine ================= */
  function panelBlocks() {
    var box = el("div", { class: "kv-panel" }, el("h3", {}, "Bausteine der Ausgabe"), el("p", { class: "hint" }, "Gilt für Einzelauswertung, Profilblatt und PDF."));
    var grid = el("div", { class: "kv-blocks" });
    KVTpl.BLOCKS.forEach(function (b) {
      var cb = el("input", { type: "checkbox", checked: !!U.d.blocks[b[0]] });
      cb.onchange = function () { U.d.blocks[b[0]] = cb.checked; refreshBar(); if (b[0] === "spider") refreshSpider(); };
      grid.append(el("label", { class: "kv-block" }, cb, el("span", {}, el("b", {}, b[1]), el("small", {}, b[2]))));
    });
    put(box, grid, el("p", { class: "kv-note" }, "Stammdaten (Name, Bootsklasse, Kader, Alter) stehen immer im Kopf des PDF."));
    return box;
  }
  /* ================= 2b. Netzdiagramm: Anzahl der Achsen und je Achse ein Kennwert ================= */
  /* wählbar: Kennwerte mit klarer Wertung (größer oder kleiner = besser); Sprungkennwerte nur aus den für die Vorlage angekreuzten Sprungarten × Kennwerten */
  function axisCats() {
    var cats = [], idx = {};
    STATIC_METRICS.concat(S.custom).forEach(function (m) {
      if (!m.dir) return;
      var c = idx[m.g]; if (!c) { c = idx[m.g] = { name: m.g, items: [] }; cats.push(c); }
      c.items.push({ id: m.k, label: m.t + (m.u ? " [" + m.u + "]" : "") + (m.custom ? " · eigener Parameter" : "") });
    });
    KVTpl.JUMP_GROUPS.forEach(function (g) {
      if (!U.d.groups.has(g)) return;
      var items = [];
      K.ALL.forEach(function (pp) {
        if (!U.d.params.has(pp.name)) return;
        var ok = g === "LSI" ? K.LSI_NAMES.indexOf(pp.name) >= 0 : K.groupAllows(g, pp.cat) && K.dirOf(pp.name) !== 0;
        if (ok) items.push({ id: KVTpl.axisId(g, pp.name), label: pp.name + (g === "LSI" || /Asymmetry/.test(pp.name) ? " [%]" : pp.unit ? " [" + pp.unit + "]" : "") });
      });
      if (items.length) cats.push({ name: K.GROUPS[g].label, items: items });
    });
    return cats;
  }
  function axisName(id) {   /* lesbarer Name für Einträge, die nicht mehr zur Auswahl stehen */
    var i = id.indexOf("||"); if (i > 0) { var g = K.GROUPS[id.slice(0, i)]; return (g ? g.label.replace(" (VALD)", "") : id.slice(0, i)) + " · " + id.slice(i + 2); }
    var m = MET[id]; return m ? m.t : id;
  }
  /* nächster Vorschlag, wenn die Anzahl steigt: erst die Standardachsen, dann angekreuzte Tests, dann alles übrige */
  function nextAxis(cats) {
    var have = {}; U.d.spider.forEach(function (k) { have[k] = 1; });
    var ok = {}; cats.forEach(function (c) { c.items.forEach(function (it) { ok[it.id] = 1; }); });
    var pool = KVTpl.SPIDER.concat(Array.from(U.d.metrics));
    cats.forEach(function (c) { c.items.forEach(function (it) { pool.push(it.id); }); });
    for (var i = 0; i < pool.length; i++) if (ok[pool[i]] && !have[pool[i]]) return pool[i];
    return "";
  }
  function setAxisCount(n, cats) {
    n = Math.max(KVTpl.SPIDER_MIN, Math.min(KVTpl.SPIDER_MAX, n));
    while (U.d.spider.length > n) U.d.spider.pop();
    while (U.d.spider.length < n) { var k = nextAxis(cats); if (!k) break; U.d.spider.push(k); }
  }
  function previewBox(on) {
    var box = el("div", { class: "kv-spprev" });
    if (!on) return put(box, el("p", { class: "kv-hint" }, "Der Baustein „Leistungsprofil (Netzdiagramm)“ ist oben ausgeschaltet – die Vorlage zeigt kein Netzdiagramm."));
    var list = typeof players !== "undefined" ? players : [];
    if (!list.length) return put(box, el("p", { class: "kv-hint" }, "Für die Vorschau werden Auswertungsdaten gebraucht (Rohdatenblatt oder Sprünge laden)."));
    var keys = KVTpl.resolveAxes(U.d.spider, METRICS);
    /* ohne eigene Wahl: die Person mit den meisten Messwerten auf diesen Achsen (so zeigt die Vorschau echte Flächen) */
    var best = list[0], bn = -1; list.forEach(function (p) { var c = keys.filter(function (k) { return p.val[k] != null; }).length; if (c > bn) { bn = c; best = p; } });
    var cur = findPlayer(U.prev) || best;
    var who = el("select", { "aria-label": "Vorschau für" }, list.map(function (p) { return el("option", { value: p.name, selected: p.name === cur.name }, p.name); }));
    who.onchange = function () { U.prev = who.value; refreshSpider(); };
    var miss = U.d.spider.filter(function (id) { return KVTpl.resolveAxes([id], METRICS).length === 0; });
    var svg = keys.length >= KVTpl.SPIDER_MIN ? spiderChart(cur, effRef(cur), null, keys) : "";
    put(box, el("div", { class: "kv-row" }, el("span", { class: "kv-mini" }, "Vorschau mit:"), who));
    if (svg) { var h = el("div", { class: "kv-spsvg" }); h.innerHTML = svg; box.append(h); }
    else box.append(el("p", { class: "kv-hint" }, "Für ein Netz braucht es mindestens drei Achsen mit Messwerten."));
    if (miss.length) box.append(el("p", { class: "kv-note" }, "Nicht in der Vorschau: " + miss.map(axisName).join(", ") + " – dafür liegen keine Auswertungsdaten vor. Sprungkennwerte erscheinen in der Vorschau, sobald die Vorlage gespeichert und als Auswertung aktiv ist und Sprünge importiert sind."));
    return box;
  }
  function panelSpider() {
    var on = !!U.d.blocks.spider, cats = axisCats(), have = {}, listed = {};
    cats.forEach(function (c) { c.items.forEach(function (it) { listed[it.id] = 1; }); });
    U.d.spider.forEach(function (k) { have[k] = 1; });
    var box = el("div", { class: "kv-panel", id: "kvSpider" }, el("h3", {}, "Netzdiagramm (Leistungsprofil)"),
      el("p", { class: "hint" }, "Wie viele Achsen hat das Netz, und welcher Kennwert steht auf welcher Achse? Zur Wahl stehen alle sportmotorischen Tests (auch eigene Parameter aus CSV-Importen) mit klarer Wertung – Größe, Masse und BMI gehören nicht dazu – sowie die Sprungkennwerte, die unten für diese Vorlage angekreuzt sind. Die Reihenfolge entspricht dem Uhrzeigersinn, beginnend oben."));
    var nsel = el("select", { "aria-label": "Anzahl der Achsen", disabled: !on });
    for (var i = KVTpl.SPIDER_MIN; i <= KVTpl.SPIDER_MAX; i++) nsel.append(el("option", { value: i, selected: i === U.d.spider.length }, i + " Achsen"));
    nsel.onchange = function () { setAxisCount(+nsel.value, cats); refreshBar(); refreshSpider(); };
    var reset = btn("Standard (8 Tests)", function () { U.d.spider = KVTpl.SPIDER.slice(); refreshBar(); refreshSpider(); }, "s", { disabled: !on, title: "Die acht Standardachsen: Screen, Rumpf, CMJ, Fmax relativ, Tapping, Hängen, 1-RM Bankziehen relativ, HBL" });
    put(box, el("div", { class: "kv-row" }, el("label", {}, "Anzahl der Achsen:", nsel), reset,
      el("span", { class: "kv-mini" }, U.d.spider.length + " Achsen" + (U.d.spider.length >= KVTpl.SPIDER_MAX ? " (Höchstzahl)" : ""))));
    if (!U.d.groups.size || !U.d.params.size) box.append(el("p", { class: "kv-note" }, "Sprungkennwerte (VALD) stehen hier zur Wahl, sobald weiter unten Sprungarten und Kennwerte angekreuzt sind."));
    var grid = el("div", { class: "kv-axes" });
    U.d.spider.forEach(function (cur, i) {
      var sel = el("select", { "aria-label": "Achse " + (i + 1), disabled: !on });
      cats.forEach(function (c) {
        sel.append(el("optgroup", { label: c.name }, c.items.map(function (it) {
          return el("option", { value: it.id, selected: it.id === cur, disabled: it.id !== cur && !!have[it.id] }, it.label);
        })));
      });
      if (!listed[cur]) sel.append(el("optgroup", { label: "Nicht mehr in der Auswahl" }, el("option", { value: cur, selected: true }, axisName(cur))));
      sel.onchange = function () { U.d.spider[i] = sel.value; refreshBar(); refreshSpider(); };
      grid.append(el("label", { class: "kv-axis" }, el("span", {}, "Achse " + (i + 1)), sel));
    });
    put(box, grid, previewBox(on));
    return box;
  }
  function refreshSpider() { var o = document.getElementById("kvSpider"); if (o) o.replaceWith(panelSpider()); }
  function refreshBar() {
    var bar = document.getElementById("kvTplBar"); if (bar) bar.replaceWith(panelBar()); var n = document.getElementById("kvTplCount"); if (n) n.textContent = countText();
    refreshSingle();
    if (dirty()) A.setDraft(U.id, U.d.name, toTpl()); else A.clearDraft();   /* Echtzeit: die Änderung gilt sofort in Einzelauswertung, PDF und Excel */
  }
  function countText() { var c = counts(); return c.m + " sportmotorische Kennwerte · " + c.p + " Sprungkennwerte × " + c.g + " Sprungarten"; }

  /* ================= 3. Sportmotorische Tests ================= */
  function panelTests() {
    var cats = [], idx = {};
    STATIC_METRICS.concat(S.custom).forEach(function (m) {
      var c = idx[m.g]; if (!c) { c = idx[m.g] = { name: m.g, items: [] }; cats.push(c); }
      c.items.push({ key: m.k, label: m.t, unit: m.u, note: m.calc ? "berechnet" : m.custom ? "eigener Parameter" : "" });
    });
    var box = el("div", { class: "kv-panel", id: "kvTests" }, el("h3", {}, "Tests der Einzelauswertung (sportmotorisch und Sprungtests)"),
      el("p", { class: "hint" }, "Hake an, welche Tests erscheinen sollen. „Berechnet“ heißt: die App rechnet den Wert aus anderen Messwerten (z. B. BMI, PSA). Eigene Parameter stammen aus CSV-Importen (unten)."));
    var p = picker({
      cats: cats, placeholder: "Test suchen, z. B. „Screen“, „Swiss“, „Hopp“", height: 380, getQ: function () { return U.mq; }, setQ: function (v) { U.mq = v; },
      has: function (k) { return U.d.metrics.has(k); }, set: function (keys, on) { keys.forEach(function (k) { on ? U.d.metrics.add(k) : U.d.metrics.delete(k); }); },
      onChange: refreshBar, actions: [["Alle", function () { cats.forEach(function (c) { c.items.forEach(function (i) { U.d.metrics.add(i.key); }); }); }], ["Keine", function () { U.d.metrics.clear(); }],
        ["Tests des Netzdiagramms", function () { U.d.metrics.clear(); U.d.spider.forEach(function (k) { if (k.indexOf("||") < 0) U.d.metrics.add(k); }); }]]
    });
    put(box, p);
    return box;
  }

  /* ================= 4. Sprungkennwerte ================= */
  function panelJumps() {
    var cats = CMJ.VALD_CATALOG.map(function (c) { return { name: c[0], items: c[1].map(function (x) { return { key: x[0], label: x[0], unit: x[1] }; }) }; });
    var box = el("div", { class: "kv-panel" }, el("h3", {}, JUMPCAT + ": Sprungkennwerte (VALD)"),
      el("p", { class: "hint" }, "Erst die Sprungarten wählen, dann die Kennwerte – die Auswahl gilt für alle gewählten Sprungarten. Kennwerte, die es für eine Art nicht gibt (z. B. Asymmetrie beim Single Leg), fehlen dort automatisch."));
    var gs = el("div", { class: "kv-groups" });
    KVTpl.JUMP_GROUPS.forEach(function (g) {
      var cb = el("input", { type: "checkbox", checked: U.d.groups.has(g) });
      cb.onchange = function () { cb.checked ? U.d.groups.add(g) : U.d.groups.delete(g); refreshBar(); refreshSpider(); };
      gs.append(el("label", {}, cb, K.GROUPS[g].label.replace(" (VALD)", "")));
    });
    var p = picker({
      cats: cats, placeholder: "Kennwert suchen, z. B. „braking rfd“, „landing“, „asymmetry“", height: 380, getQ: function () { return U.jq; }, setQ: function (v) { U.jq = v; },
      has: function (k) { return U.d.params.has(k); }, set: function (keys, on) { keys.forEach(function (k) { on ? U.d.params.add(k) : U.d.params.delete(k); }); },
      onChange: function () { refreshBar(); refreshSpider(); }, actions: [["Kompakt", function () { U.d.params = new Set(KVTpl.JUMP_COMPACT); }], ["VALD-Standard", function () { U.d.params = new Set(CMJ.VALD_DEFAULT); }],
        ["aus Reiter „Parameter“", function () { U.d.params = new Set(A.selNames()); }], ["Alle", function () { U.d.params = new Set(K.ALL.map(function (x) { return x.name; })); }], ["Keine", function () { U.d.params.clear(); }]]
    });
    put(box, el("div", { class: "kv-row" }, el("span", { class: "kv-mini" }, "Sprungarten:"), gs), p);
    return box;
  }

  /* ================= 5. CSV-Import weiterer Parameter ================= */
  function ctx() {
    var metrics = {}; STATIC_METRICS.concat(S.custom).forEach(function (m) { metrics[m.k] = m; });
    return { hnorm: hnorm, hmap: HMAP, num: num, serialToIso: serialToIso, metrics: metrics };
  }
  function refreshImp() { var o = document.getElementById("kvImp"); if (o) o.replaceWith(panelImport()); }
  function startImport(file) {
    return file.arrayBuffer().then(function (buf) {
      var grid = parseCsv(CsvImport.decode(buf)), a = CsvImport.analyze(grid, ctx());
      U.imp = { file: file.name, grid: grid, hr: a.hr, rows: a.rows, defaultDate: "", overwrite: false, addToTpl: !A.findTemplate(U.id).builtin,
        cols: a.columns.map(function (c) { var g = c.guess; return { index: c.index, header: c.header, sample: c.sample, note: g.note || "", action: g.action, key: g.key || "", name: g.name || c.header, unit: g.unit || "", dp: g.dp != null ? g.dp : 1, dir: g.dir || 0, group: g.group || CsvImport.OWN_GROUP }; }) };
    }).catch(function (e) { U.imp = null; toast("CSV nicht lesbar: " + e.message, 7000); });
  }
  function doImport() {
    var im = U.imp, plan = { hr: im.hr, defaultDate: im.defaultDate, columns: im.cols.map(function (c) { return { index: c.index, action: c.action, key: c.key, name: c.name, unit: c.unit, dp: c.dp, dir: c.dir, group: c.group }; }) };
    try {
      if (plan.columns.filter(function (c) { return c.action === "name"; }).length !== 1) throw new Error("Genau eine Spalte muss als „Name“ gewählt sein.");
      if (plan.columns.some(function (c) { return c.action === "metric" && !c.key; })) throw new Error("Bei „Bekannter Test“ bitte den Test auswählen.");
      if (plan.columns.some(function (c) { return c.action === "new" && !String(c.name).trim(); })) throw new Error("Neue Parameter brauchen eine Bezeichnung.");
      var def = CsvImport.defineMetrics(plan, S.custom, STATIC_METRICS.map(function (m) { return m.k; }));
      var res = CsvImport.buildRows(im.grid, plan, def.keyOf, ctx());
      if (!res.rows.length) throw new Error("Keine Zeile mit Name und mindestens einem Zahlenwert gefunden.");
      var used = {}; plan.columns.forEach(function (c) { if (c.action === "metric") used[c.key] = 1; else if (c.action === "new" && def.keyOf[c.index]) used[def.keyOf[c.index]] = 1; });
      A.addImport({ id: "imp:" + Date.now().toString(36), file: im.file, added: Date.now(), overwrite: !!im.overwrite, rows: res.rows, keys: Object.keys(used) }, def.defs);
      if (im.addToTpl && U.d && !A.findTemplate(U.id).builtin) Object.keys(used).forEach(function (k) { U.d.metrics.add(k); });
      toast(res.rows.length + " Zeilen importiert, " + def.defs.length + " neue Parameter" + (res.bad ? ", " + res.bad + " Einträge keine Zahl" : "") + (res.skipped ? ", " + res.skipped + " Zeilen übersprungen" : "") + ".", 7000);
      U.imp = null; A.refresh();
    } catch (e) { toast(e.message, 7000); }
  }
  function panelImport() {
    var box = el("div", { class: "kv-panel", id: "kvImp" }, el("h3", {}, "Weitere Parameter per CSV importieren"),
      el("p", { class: "hint" }, "Für Messwerte, die nicht im Segeln-Blatt stehen oder später dazukommen: CSV mit einer Spalte „Name“, optional „Testdatum“ und beliebig vielen Messspalten. Jede Spalte lässt sich einem bekannten Test zuordnen oder als neuer Parameter anlegen (mit Einheit, Nachkommastellen und Wertung). Zeilen werden nach Name und Testtag mit den vorhandenen Daten zusammengeführt."));
    var inp = el("input", { type: "file", accept: ".csv,text/csv,.txt", style: "display:none" });
    inp.onchange = function () { var f = inp.files[0]; inp.value = ""; if (f) startImport(f).then(refreshImp); };
    var drop = el("label", { class: "kv-drop", tabindex: 0 }, inp, el("strong", {}, "CSV-Datei wählen oder hierher ziehen"), el("span", {}, "Trennzeichen ; oder , · Zahlen mit Komma oder Punkt · UTF-8 oder Windows-Zeichensatz"));
    ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { var f = e.dataTransfer.files[0]; if (f) startImport(f).then(refreshImp); });
    if (!U.imp) put(box, drop);
    else put(box, wizard());
    put(box, importList(), customList());
    return box;
  }
  function wizard() {
    var im = U.imp, known = STATIC_METRICS.concat(S.custom).filter(function (m) { return !m.calc; });
    var w = el("div", { class: "kv-wiz" }, el("div", { class: "kv-row" }, el("b", {}, im.file), el("span", { class: "kv-mini" }, im.rows + " Datenzeilen · Überschriften in Zeile " + (im.hr + 1))));
    var hasDate = im.cols.some(function (c) { return c.action === "date"; });
    var body = el("tbody");
    im.cols.forEach(function (c) {
      if (!c.header) return;
      var act = el("select", { "aria-label": "Verwendung von " + c.header }, [["ignore", "ignorieren"], ["name", "Name"], ["date", "Testdatum"], ["metric", "Bekannter Test …"], ["new", "Neuer Parameter …"]].map(function (o) { return el("option", { value: o[0], selected: c.action === o[0] }, o[1]); }));
      act.onchange = function () {
        c.action = act.value;
        if (c.action === "name" || c.action === "date") im.cols.forEach(function (o) { if (o !== c && o.action === c.action) o.action = "ignore"; });
        if (c.action === "metric" && !c.key) c.key = (known[0] || {}).k || "";
        refreshImp();
      };
      var det = el("td", { class: "det" });
      if (c.action === "metric") {
        var ms = el("select", { "aria-label": "Test" }, el("option", { value: "" }, "– wählen –"), known.map(function (m) { return el("option", { value: m.k, selected: c.key === m.k }, m.g + ": " + m.t + (m.u ? " [" + m.u + "]" : "")); }));
        ms.onchange = function () { c.key = ms.value; }; det.append(ms);
      } else if (c.action === "new") {
        var f = function (ph, val, w2, fn, type) { var i = el("input", { type: type || "text", placeholder: ph, value: val, style: "width:" + w2 + "px", "aria-label": ph }); i.onchange = function () { fn(i.value); }; return i; };
        var dir = el("select", { "aria-label": "Wertung" }, [[0, "ohne Wertung"], [1, "größer = besser"], [-1, "kleiner = besser"]].map(function (o) { return el("option", { value: o[0], selected: +c.dir === o[0] }, o[1]); }));
        dir.onchange = function () { c.dir = +dir.value; };
        det.append(f("Bezeichnung", c.name, 170, function (v) { c.name = v; }), f("Einheit", c.unit, 64, function (v) { c.unit = v; }),
          el("label", { class: "kv-mini" }, "Nachkomma ", f("0–3", c.dp, 48, function (v) { c.dp = Math.max(0, Math.min(3, +v || 0)); }, "number")), dir, f("Gruppe", c.group, 150, function (v) { c.group = v; }));
      } else if (c.note) det.append(el("span", { class: "kv-mini" }, c.note));
      body.append(el("tr", {}, el("td", {}, el("b", {}, c.header), el("div", { class: "kv-mini" }, c.sample.slice(0, 3).join(" · "))), el("td", {}, act), det));
    });
    put(w, el("div", { class: "kv-tblbox", style: "max-height:420px;overflow:auto" }, el("table", { class: "kv-t" }, el("thead", {}, el("tr", {}, el("th", {}, "Spalte in der CSV"), el("th", {}, "Verwendung"), el("th", {}, "Einstellung"))), body)));
    var dd = el("input", { type: "date", value: im.defaultDate, disabled: hasDate }); dd.onchange = function () { im.defaultDate = dd.value; };
    var ow = el("input", { type: "checkbox", checked: !!im.overwrite }); ow.onchange = function () { im.overwrite = ow.checked; };
    var at = el("input", { type: "checkbox", checked: !!im.addToTpl, disabled: A.findTemplate(U.id).builtin }); at.onchange = function () { im.addToTpl = at.checked; };
    put(w, el("div", { class: "kv-row", style: "margin-top:10px" }, el("label", {}, "Testdatum für alle Zeilen, falls keine Datumsspalte:", dd), el("label", {}, ow, "vorhandene Werte aus dem Blatt überschreiben"),
      el("label", {}, at, "neue Parameter in die geöffnete Vorlage aufnehmen")),
      el("div", { class: "kv-row" }, btn("Importieren", doImport, "p"), btn("Abbrechen", function () { U.imp = null; refreshImp(); })));
    return w;
  }
  function importList() {
    if (!S.imports.length) return null;
    var body = el("tbody", {}, S.imports.map(function (imp) {
      return el("tr", {}, el("td", {}, imp.file), el("td", {}, new Date(imp.added).toLocaleString("de-AT")), el("td", { class: "n" }, String(imp.rows.length)), el("td", { class: "n" }, String((imp.keys || []).length)),
        el("td", {}, btn("Entfernen", function () { if (!window.confirm("Import „" + imp.file + "“ (" + imp.rows.length + " Zeilen) entfernen? Die Werte verschwinden aus der Auswertung.")) return; A.removeImport(imp.id); A.refresh(); toast("Import entfernt."); }, "s d")));
    }));
    return el("div", { style: "margin-top:16px" }, el("h3", { class: "kv-sub" }, "Importierte Dateien"),
      el("div", { class: "kv-tblbox" }, el("table", { class: "kv-t" }, el("thead", {}, el("tr", {}, ["Datei", "Importiert", "Zeilen", "Parameter", ""].map(function (h, i) { return el("th", { class: i === 2 || i === 3 ? "n" : "" }, h); }))), body)));
  }
  function customList() {
    if (!S.custom.length) return null;
    var body = el("tbody", {}, S.custom.map(function (d) {
      var tx = function (key, w, type) { var i = el("input", { type: type || "text", value: d[key], style: "width:" + w + "px", "aria-label": key }); i.onchange = function () { d[key] = type === "number" ? Math.max(0, Math.min(3, +i.value || 0)) : i.value.trim() || d[key]; A.saveCustom(); A.refresh(true); }; return i; };
      var dir = el("select", { "aria-label": "Wertung" }, [[0, "ohne Wertung"], [1, "größer = besser"], [-1, "kleiner = besser"]].map(function (o) { return el("option", { value: o[0], selected: +d.dir === o[0] }, o[1]); }));
      dir.onchange = function () { d.dir = +dir.value; A.setDir(d.k, null); A.saveCustom(); A.refresh(true); };   /* eine Wahl im Reiter „Bewertung“ wird dabei zurückgenommen */
      var n = 0; S.imports.forEach(function (imp) { imp.rows.forEach(function (r) { if (r[d.k] != null) n++; }); });
      var asking = U.delCustom === d.k;
      return el("tr", {}, el("td", {}, tx("t", 180)), el("td", {}, tx("u", 70)), el("td", {}, tx("d", 52, "number")), el("td", {}, dir), el("td", {}, tx("g", 150)), el("td", { class: "n" }, String(n)),
        el("td", {}, asking ? [btn("Wirklich löschen", function () { U.delCustom = ""; A.removeCustom(d.k); A.refresh(); toast("Parameter gelöscht."); }, "s d"), " ", btn("Nein", function () { U.delCustom = ""; refreshImp(); }, "s")]
          : btn("Löschen", function () { U.delCustom = d.k; refreshImp(); }, "s d")));
    }));
    return el("div", { style: "margin-top:16px" }, el("h3", { class: "kv-sub" }, "Eigene Parameter"),
      el("p", { class: "kv-hint" }, "Bezeichnung, Einheit, Nachkommastellen, Wertung und Gruppe lassen sich hier jederzeit ändern. Beim nächsten CSV-Import mit gleicher Bezeichnung werden die Werte demselben Parameter zugeordnet."),
      el("div", { class: "kv-tblbox" }, el("table", { class: "kv-t" }, el("thead", {}, el("tr", {}, ["Bezeichnung", "Einheit", "Nachkomma", "Wertung", "Gruppe", "Werte", ""].map(function (h, i) { return el("th", { class: i === 5 ? "n" : "" }, h); }))), body)));
  }

  /* ================= 6. Speicher und Sicherungsordner ================= */
  function when(ms) { return ms ? new Date(ms).toLocaleString("de-AT") : "–"; }
  function panelSync() {
    var box = el("div", { class: "kv-panel", id: "kvSyncPanel" }, el("h3", {}, "Speicher und Sicherung"));
    var sy = KVSync.state(), db = ST.isPersistent();
    put(box, el("p", { class: "hint" }, "Vorlagen, eigene Parameter, CSV-Importe, Zuordnungen, das Rohdatenblatt und alle Sprünge werden automatisch gespeichert und sind beim nächsten Öffnen wieder da."));
    put(box, el("div", { class: "kv-row" }, el("span", { class: "kv-status " + (db ? "ok" : "no") }, db ? "✓ Browser-Datenbank aktiv (dauerhaft)" : "nur Arbeitsspeicher – geht beim Schließen verloren"),
      sy.handle && sy.perm === "granted" ? el("span", { class: "kv-status ok" }, "✓ Sicherungsordner „" + (sy.handle.name || "gewählt") + "“ aktiv" + (sy.last ? " · zuletzt " + new Date(sy.last).toLocaleTimeString("de-AT") : "")) : null));
    if (!sy.supported) {
      put(box, el("p", { class: "kv-note" }, "Dieser Browser kann keine Ordner beschreiben (dafür braucht es Chrome oder Edge). Über „Speicher sichern“ im Reiter „Sprungdaten“ lässt sich trotzdem jederzeit eine Sicherungsdatei anlegen."));
      return box;
    }
    put(box, el("p", { class: "kv-note" }, "Zusätzlich lässt sich ein Ordner auf dem Rechner (oder in einem Cloud-Ordner wie OneDrive) wählen. Die App schreibt dort nach jeder Änderung selbsttätig zwei Dateien – so bleibt alles erhalten, auch wenn der Browser seine Daten löscht oder du an einem anderen Rechner weiterarbeitest. Nach jedem Neustart verlangt der Browser dafür einen Klick."));
    var row = el("div", { class: "kv-row" });
    if (!sy.handle) put(row, btn("Sicherungsordner wählen", chooseFolder, "p"));
    else if (sy.perm !== "granted") put(row, el("span", { class: "kv-status dirty" }, "Ordner „" + (sy.handle.name || "") + "“ verknüpft – Zugriff muss bestätigt werden"), btn("Zugriff bestätigen", grantFolder, "p"), btn("Verknüpfung lösen", function () { KVSync.unlink().then(function () { U.sync = null; refreshSync(); }); }));
    else put(row, btn("Jetzt sichern", function () { KVSync.saveNow().then(function (ok) { toast(ok ? "Gesichert." : "Sichern nicht möglich: " + (KVSync.state().error || "unbekannt"), 5000); refreshSync(); }); }), btn("Aus Ordner laden", function () { probeAndAsk(true); }), btn("Anderen Ordner wählen", chooseFolder), btn("Verknüpfung lösen", function () { KVSync.unlink().then(function () { U.sync = null; refreshSync(); }); }));
    put(box, row);
    if (sy.error) put(box, el("p", { class: "kv-note", style: "color:var(--red)" }, "Letzter Fehler beim Schreiben: " + sy.error));
    if (U.sync) {
      var i = U.sync, line = function (x) { return x ? when(x.modified) + " (" + Math.round(x.size / 1024) + " KB)" : "–"; };
      put(box, el("div", { class: "kv-dialog" }, el("span", {}, "Im Ordner „" + i.name + "“ liegt bereits eine Sicherung: Einstellungen/Vorlagen " + line(i.kv) + ", Sprünge " + line(i.jumps) + ". Was soll passieren?"),
        btn("Aus Ordner laden", function () { restoreFromFolder(); }, "p s"), btn("Ordner überschreiben (aktuellen Stand sichern)", function () { U.sync = null; KVSync.saveNow().then(function () { toast("Gesichert."); refreshSync(); }); }, "s"), btn("Abbrechen", function () { U.sync = null; refreshSync(); }, "s")));
    }
    put(box, el("p", { class: "kv-note" }, "Dateien im Ordner: " + KVSync.files.kv + " und " + KVSync.files.jumps + " (ohne Rohkurven). Eine vollständige Sicherung mit Rohkurven gibt es im Reiter „Sprungdaten“."));
    return box;
  }
  function refreshSync() { var h = document.getElementById("kvSyncPanel"); if (h) h.replaceWith(panelSync()); }
  function isEmpty() { return !S.results.length && !S.templates.length && !S.imports.length && !ST.kvGet("base", null); }
  /* Vorhandene Sicherung im Ordner nur dann einfach überschreiben, wenn sie von diesem Browser stammt und nicht neuer ist (sonst fragen) */
  function probeAndAsk(force) {
    KVSync.probe().then(function (info) {
      var has = info && (info.kv || info.jumps);
      if (has && (force || isEmpty() || info.newest > info.mine + 3000)) { U.sync = info; refreshSync(); }
      else KVSync.saveNow().then(function () { refreshSync(); });
    });
  }
  function chooseFolder() { KVSync.choose().then(function (info) { if (info && (info.kv || info.jumps)) { U.sync = info; refreshSync(); } else KVSync.saveNow().then(function () { toast("Sicherungsordner aktiv."); refreshSync(); }); }).catch(function (e) { if (!e || e.name !== "AbortError") toast("Ordner nicht verfügbar: " + (e && e.message || e), 6000); }); }
  function grantFolder() { KVSync.grant().then(function (ok) { if (ok) probeAndAsk(false); else { toast("Zugriff nicht erteilt."); refreshSync(); } }); }
  function restoreFromFolder() {
    KVSync.restore().then(function (r) { U.sync = null; A.afterRestore(); load(S.activeTpl); A.refresh(); toast("Aus dem Ordner geladen" + (r.results ? ": " + r.results + " Sprünge" : "") + "."); })
      .catch(function (e) { toast("Laden nicht möglich: " + e.message, 6000); });
  }
  KVSync.onChange(function () { refreshSync(); });

  /* ================= Aufbau des Reiters ================= */
  A.renderTemplates = function () {
    var root = document.getElementById("kvTpl"); if (!root) return;
    if (!S.ready) { root.replaceChildren(el("div", { class: "kv-empty" }, "Sprungspeicher wird geöffnet …")); return; }
    if (!U.d || !A.findTemplate(U.id)) load(S.activeTpl);
    var note = document.getElementById("kvTplNote"); if (note) note.textContent = "aktiv: " + A.tplName();
    root.replaceChildren(el("div", { class: "kv-stack" }, panelBar(),
      el("div", { class: "kv-panel kv-count" }, el("span", { id: "kvTplCount" }, countText())), panelSingle(), panelBlocks(), panelSpider(), panelTests(), panelJumps(), panelImport(), panelSync()));
  };
})(KVApp);
