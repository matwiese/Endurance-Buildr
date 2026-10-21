/* ===== Tab „Sprungdaten“: Speicher, Import (VALD-Bridge, CSV), Zuordnung, Sprungliste ===== */
(function (A) {
  "use strict";
  var S = A.S, K = KVCore, ST = KVStore, el = A.el, nf = A.nf;
  var U = { page: 0, per: 20, q: "", filt: "", sortKey: "athlete", sortDir: 1, sel: new Set(), open: new Set(), upErrors: [], bulkType: "", bulkWho: "", bulkDate: "", wipe: false, usage: null };
  var root = null;
  /* wie append(), lässt aber null/false aus (append(null) würde den Text „null“ einfügen) */
  function put(parent) { Array.prototype.slice.call(arguments, 1).forEach(function (k) { if (k != null && k !== false) parent.append(k); }); return parent; }

  /* ---------- Fortschritt (ohne die ganze Ansicht neu zu bauen) ---------- */
  function prog(label, i, n) {
    var box = document.getElementById("kvProg"); if (!box) return;
    box.replaceChildren();
    if (!label) return;
    put(box, el("div", { class: "kv-mini" }, label + (n ? " (" + i + " / " + n + ")" : "")),
      n ? el("div", { class: "kv-prog" }, el("i", { style: "width:" + Math.round(i / n * 100) + "%" })) : null);
  }
  function busy(label) { S.busy = label; prog(label); }

  /* ---------- Hilfen ---------- */
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + "-" + s.length.toString(36); }
  function mb(x) { return nf(x / 1048576, x > 1.05e8 ? 0 : 1) + " MB"; }
  function typeBadge(t) { return el("span", { class: "kv-tb " + t }, A.typeLabel(t)); }
  function btn(label, fn, cls, o) { o = o || {}; return el("button", { type: "button", class: "kv-b " + (cls || ""), disabled: !!o.disabled, title: o.title || false, onclick: fn }, label); }
  function done(msg) { A.refresh(); if (msg) toast(msg, 5200); }

  /* ================= Panel 1: Speicher & Einstellungen ================= */
  function panelStatus() {
    var all = S.results, use = all.filter(K.usable), ath = {}, days = {};
    all.forEach(function (r) { ath[r.athlete] = 1; }); use.forEach(function (r) { if (r.date) days[r.date] = 1; });
    var kp = function (cls, val, lab, sub) { return el("div", { class: "kpi " + cls }, el("div", { class: "val" }, val), el("div", { class: "lab" }, lab), el("div", { class: "sub" }, sub)); };
    var use2 = el("div", { class: "kpis", style: "margin-bottom:14px" },
      kp("k-red", String(all.length), "Sprünge im Speicher", use.length + " in der Auswertung"),
      kp("k-navy", String(Object.keys(ath).length), "Athlet:innen", Object.keys(days).length + " Testtag(e)"),
      kp("", ST.isPersistent() ? "dauerhaft" : "nur Sitzung", "Speicherart", ST.isPersistent() ? "Browser-Datenbank (IndexedDB)" : "Sicherung nötig!"),
      kp("k-gold", U.usage ? mb(U.usage.usage) : "…", "Belegt", U.usage && U.usage.quota ? "von " + mb(U.usage.quota) + " möglich" : "Browser-Speicher"));
    if (!U.usage) ST.estimate().then(function (e) { if (e) { U.usage = e; var v = use2.querySelectorAll(".kpi")[3]; if (v) { v.querySelector(".val").textContent = mb(e.usage); v.querySelector(".sub").textContent = e.quota ? "von " + mb(e.quota) + " möglich" : "Browser-Speicher"; } } });

    var set = S.settings;
    var agg = el("select", { "aria-label": "Aggregation mehrerer Versuche" }, Object.keys(K.AGG).map(function (k) { return el("option", { value: k, selected: set.agg === k }, K.AGG[k]); }));
    agg.onchange = function () { set.agg = agg.value; A.saveSettings(); done(); };
    var thr = el("input", { type: "number", min: 1, max: 200, step: 1, value: set.thr, "aria-label": "Absprung-/Landeschwelle in Newton" });
    thr.onchange = function () { set.thr = Math.max(1, +thr.value || 20); thr.value = set.thr; A.saveSettings(); };
    var chk = function (key, label, after) {
      var c = el("input", { type: "checkbox", checked: !!set[key] }); c.onchange = function () { set[key] = c.checked; A.saveSettings(); if (after) after(); };
      return el("label", {}, c, label);
    };
    var fileIn = el("input", { type: "file", accept: ".json,application/json", style: "display:none" });
    fileIn.onchange = function () {
      var f = fileIn.files[0]; fileIn.value = ""; if (!f) return;
      busy("Sicherung wird gelesen …");
      A.restore(f).then(function (r) { busy(""); done("Sicherung geladen: " + r.results + " Sprünge" + (r.raw ? ", " + r.raw + " Rohkurven" : "") + "."); })
        .catch(function (e) { busy(""); toast("Sicherung nicht lesbar: " + e.message, 7000); });
    };
    var wipeRow = U.wipe
      ? el("div", { class: "kv-dialog" }, el("span", {}, "Wirklich ALLE Sprünge, Zuordnungen und das gemerkte Rohdatenblatt aus dem Speicher löschen? Das geht nicht rückgängig – vorher am besten sichern."),
          btn("Ja, alles löschen", function () { A.wipe().then(function () { U.wipe = false; U.sel.clear(); done("Speicher geleert."); }); }, "d"), btn("Abbrechen", function () { U.wipe = false; A.renderSprung(); }))
      : null;
    return el("div", { class: "kv-panel" },
      el("h3", {}, "Sprungspeicher"),
      el("p", { class: "hint" }, "Alle Sprünge liegen mit Erkennung und allen Kennwerten dauerhaft in dieser Browser-Datenbank. Einzel- und Teamauswertung rechnen daraus – auch nach dem Schließen und Neu-Öffnen. Die Datenbank gehört zu diesem Browser auf diesem Rechner; über „Sichern“ lässt sie sich auf einen anderen Rechner mitnehmen."),
      use2,
      el("div", { class: "kv-row" }, el("label", {}, "Mehrere Versuche je Tag:", agg),
        el("label", {}, "Absprung-/Landeschwelle (N):", thr),
        btn("Alle neu auswerten", function () {
          busy("Werte neu auswerten …");
          A.reanalyze(function (i, n) { prog("Werte neu auswerten …", i, n); }).then(function (r) { busy(""); done(r.ok + " Sprünge neu ausgewertet" + (r.skipped ? ", " + r.skipped + " ohne gespeicherte Rohkurve übersprungen" : "") + "."); });
        }, "", { disabled: !S.results.length, title: "Wendet die Schwelle auf alle gespeicherten Rohkurven an" })),
      el("div", { class: "kv-row" },
        chk("keepRaw", "Rohkurven mitspeichern (nötig für „Neu auswerten“; braucht mehr Platz)"),
        chk("fillCmjSj", "CMJ-/SJ-Spalten des Rohdatenblatts aus VALD füllen, wenn dort leer", function () { done(); })),
      el("div", { class: "kv-row" },
        btn("Speicher sichern (klein)", function () { A.backup(false).then(function (n) { toast("Sicherung gespeichert (" + mb(n) + ", ohne Rohkurven).", 5000); }); }, "", { disabled: !S.results.length }),
        btn("Sichern mit Rohkurven", function () { busy("Sicherung wird geschrieben …"); A.backup(true).then(function (n) { busy(""); toast("Sicherung gespeichert (" + mb(n) + ").", 5000); }); }, "", { disabled: !S.results.length }),
        btn("Sicherung laden", function () { fileIn.click(); }), fileIn,
        btn("Alles löschen", function () { U.wipe = true; A.renderSprung(); }, "d", { disabled: !S.results.length && !ST.kvGet("base", null) })),
      wipeRow, el("div", { id: "kvProg" }));
  }

  /* ================= Panel 2: VALD-Import über die lokale Bridge ================= */
  var API_KEY = "cmj_vald_bridge_v1";   /* wie im CMJ Analyzer */
  var api = (function () {
    var saved = {}; try { saved = JSON.parse(localStorage.getItem(API_KEY)) || {}; } catch (e) {}
    var local = /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    var iso = function (x) { return x.toISOString().slice(0, 10); };
    return { url: saved.url || (local ? location.origin : "http://127.0.0.1:8787"), status: null, tenants: [], tenantId: saved.tenantId || "", groups: [], groupId: "", profiles: [], profileId: "",
      q: "", from: iso(new Date(Date.now() - 90 * 864e5)), to: iso(new Date()), testType: saved.testType != null ? saved.testType : "CMJ,SJ,SLJ", tests: null, sel: new Set(), log: [] };
  })();
  function apiSave() { try { localStorage.setItem(API_KEY, JSON.stringify({ url: api.url, tenantId: api.tenantId, testType: api.testType })); } catch (e) {} }
  function apiLog(msg, kind) { api.log.unshift({ t: new Date().toLocaleTimeString("de-DE"), msg: msg, kind: kind || "" }); api.log = api.log.slice(0, 60); }
  function bridge(pathQ) {
    var url = api.url.replace(/\/$/, "") + pathQ;
    return fetch(url, { cache: "no-store" }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "Bridge-Fehler " + r.status); return j; });
    }, function () { throw new Error("Bridge nicht erreichbar unter " + api.url + ". Läuft „node vald-bridge.mjs“? Adresse prüfen. Eine Seite aus dem Internet kann keine lokalen Dienste ansprechen – die Datei bitte vom eigenen Rechner öffnen (oder über die Bridge selbst, falls sie die Seite ausliefert)."); });
  }
  function apiRun(label, fn) {
    busy(label);
    return Promise.resolve().then(fn).catch(function (e) { apiLog(e.message, "err"); toast(e.message, 7000); }).then(function () { busy(""); renderApiPanel(); });
  }
  function apiConnect() {
    return apiRun("Verbinde …", function () {
      return bridge("/api/status").then(function (st) {
        api.status = st; return bridge("/api/tenants");
      }).then(function (j) {
        api.tenants = j.tenants || [];
        if (!api.tenants.some(function (t) { return t.id === api.tenantId; })) api.tenantId = api.tenants[0] ? api.tenants[0].id : "";
        apiLog("Verbunden" + (api.status.mock ? " (Testbetrieb)" : " · Region " + api.status.region) + " · " + api.tenants.length + " Tenant(s)", "ok");
        apiSave(); return api.tenantId ? loadTenant() : null;
      });
    });
  }
  function loadTenant() {
    var q = "tenantId=" + encodeURIComponent(api.tenantId);
    return bridge("/api/groups?" + q).then(function (g) {
      api.groups = g.groups || []; api.groupId = ""; api.profileId = ""; api.tests = null; api.sel.clear();
      return bridge("/api/profiles?" + q);
    }).then(function (p) { api.profiles = p.profiles || []; apiLog(api.groups.length + " Gruppen, " + api.profiles.length + " Athlet:innen geladen"); });
  }
  function loadGroup() {
    return bridge("/api/profiles?tenantId=" + encodeURIComponent(api.tenantId) + (api.groupId ? "&groupId=" + encodeURIComponent(api.groupId) : "")).then(function (p) {
      api.profiles = p.profiles || []; if (!api.profiles.some(function (x) { return x.id === api.profileId; })) api.profileId = "";
    });
  }
  function searchTests() {
    var qs = new URLSearchParams({ tenantId: api.tenantId, from: api.from, to: api.to });
    if (api.groupId) qs.set("groupId", api.groupId); if (api.profileId) qs.set("profileId", api.profileId); if (api.testType) qs.set("testType", api.testType);
    return bridge("/api/tests?" + qs).then(function (j) {
      api.tests = j.tests || []; api.sel = new Set(api.tests.map(function (t) { return t.testId; }));
      apiLog(api.tests.length + " Test(s) gefunden", "ok");
    });
  }
  function recDate(t) { var d = new Date(new Date(t.recordedDateUtc).getTime() + (t.recordedDateOffset || 0) * 60000); return isNaN(d) ? "" : d.toISOString().slice(0, 10); }
  /* Ausgewählte Tests holen → je Sprung auswerten → im Speicher ablegen; die Auswertung der Athlet:innen läuft danach einmal gesamt */
  function importTests(list) {
    if (!list.length) { toast("Keine Tests ausgewählt."); return Promise.resolve(); }
    return apiRun("Importiere …", function () {
      var known = {}; S.results.forEach(function (r) { if (r.testId) known[r.testId] = 1; });
      var i = 0, files = 0, skipped = 0, failed = 0, athletes = {};
      function step() {
        if (i >= list.length) return Promise.resolve();
        var t = list[i++];
        if (S.settings.skipKnown && known[t.testId]) { skipped++; return step(); }
        prog("Importiere: " + t.athlete + " · " + t.testType, i, list.length);
        var q = "tenantId=" + encodeURIComponent(api.tenantId) + "&testId=" + encodeURIComponent(t.testId) + "&profileId=" + encodeURIComponent(t.profileId) +
          "&from=" + encodeURIComponent(String(t.recordedDateUtc).slice(0, 10) + "T00:00:00.000Z");
        return bridge("/api/import?" + q).then(function (j) {
          var recs = (j.files || []).map(function (f) {
            return { id: t.testId + "|" + f.name, name: f.name, text: f.text, athlete: t.athlete, date: recDate(t), source: "VALD-API", testId: t.testId, profileId: t.profileId, testType: t.testType, recorded: t.recordedDateUtc };
          });
          return A.ingest(recs).then(function (r) { files += r.ok; athletes[t.athlete] = 1; r.errs.forEach(function (e) { apiLog(e, "err"); }); });
        }).catch(function (e) { failed++; apiLog(t.athlete + " · " + t.testType + ": " + e.message, "err"); }).then(A.tick).then(step);
      }
      return step().then(function () {
        apiLog(files + " Sprung-Datei(en) von " + Object.keys(athletes).length + " Athlet:innen importiert" + (skipped ? ", " + skipped + " Test(s) schon gespeichert" : "") + (failed ? ", " + failed + " fehlgeschlagen" : ""), failed ? "err" : "ok");
        prog(""); done(files + " Sprünge importiert und ausgewertet" + (skipped ? " · " + skipped + " Test(s) waren schon im Speicher" : "") + ".");
      });
    });
  }
  function renderApiPanel() {
    var old = document.getElementById("kvApi"); if (!old) return;
    old.replaceWith(panelApi());
  }
  function apiLogEl() {
    if (!api.log.length) return el("div");
    return el("details", { class: "kv-d", open: api.log.some(function (l) { return l.kind === "err"; }) }, el("summary", {}, "Protokoll"),
      el("ul", { class: "kv-log" }, api.log.map(function (l) { return el("li", { class: l.kind }, l.t + " · " + l.msg); })));
  }
  function panelApi() {
    var box = el("div", { class: "kv-panel", id: "kvApi" }), isBusy = !!S.busy;
    box.append(el("h3", {}, "VALD-Import (ForceDecks)"),
      el("p", { class: "hint" }, "Holt die Sprünge direkt aus VALD – alle Athlet:innen einer Gruppe auf einmal. Die Zugangsdaten liegen nur in der lokalen VALD-Bridge auf diesem Rechner; diese Seite spricht nie direkt mit VALD."));
    var url = el("input", { type: "text", value: api.url, "aria-label": "Adresse der VALD-Bridge", style: "min-width:210px" });
    url.onchange = function () { api.url = url.value.trim(); apiSave(); };
    var st = api.status ? el("span", { class: "kv-status ok" }, "✓ verbunden" + (api.status.mock ? " · Testbetrieb (Demo-Daten)" : " · Region " + api.status.region)) : el("span", { class: "kv-status no" }, "nicht verbunden");
    box.append(el("div", { class: "kv-row" }, el("label", {}, "Bridge:", url), btn(api.status ? "Neu verbinden" : "Verbinden", apiConnect, "p", { disabled: isBusy }), st));
    if (!api.status) {
      box.append(el("div", { class: "kv-help" }, el("ol", {},
        el("li", {}, "Bei VALD (support@vald.com) Zugang zur External API beantragen, für die Kraftkurven zusätzlich die Freigabe für „test recordings“ (Rohdaten)."),
        el("li", {}, "Node.js (ab Version 18) installieren, den Ordner „vald-bridge“ entpacken, „.env.beispiel“ in „.env“ umbenennen und Client-ID, Client-Secret, Region eintragen."),
        el("li", {}, "Im Ordner „node vald-bridge.mjs“ starten, danach hier „Verbinden“ klicken."),
        el("li", {}, "Zum Ausprobieren ohne VALD-Zugang: „node vald-bridge.mjs --mock ./mock“ bzw. die mitgelieferte Test-Bridge (tools/mock-bridge.mjs).")),
        el("p", { class: "kv-note" }, "Die Bridge nimmt nur Anfragen vom eigenen Rechner (127.0.0.1) an.")), apiLogEl());
      return box;
    }
    var tenSel = el("select", { "aria-label": "Tenant", disabled: isBusy }, api.tenants.map(function (t) { return el("option", { value: t.id, selected: t.id === api.tenantId }, t.name); }));
    tenSel.onchange = function () { api.tenantId = tenSel.value; apiSave(); apiRun("Lade Tenant …", loadTenant); };
    var grpSel = el("select", { "aria-label": "Gruppe", disabled: isBusy }, el("option", { value: "" }, "Alle Gruppen"), api.groups.map(function (g) { return el("option", { value: g.id, selected: g.id === api.groupId }, g.name); }));
    grpSel.onchange = function () { api.groupId = grpSel.value; apiRun("Lade Gruppe …", loadGroup); };
    var flt = api.profiles.filter(function (p) { return !api.q || p.name.toLowerCase().indexOf(api.q.toLowerCase()) >= 0; });
    var q = el("input", { type: "search", placeholder: "Athlet suchen …", value: api.q, style: "min-width:140px;flex:0 1 150px" });
    q.oninput = function () { api.q = q.value; var pos = q.selectionStart; renderApiPanel(); var nq = document.querySelector("#kvApi input[type=search]"); if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); } };
    var athSel = el("select", { "aria-label": "Athlet", disabled: isBusy }, el("option", { value: "" }, "Alle Athlet:innen (" + flt.length + ")"), flt.map(function (p) { return el("option", { value: p.id, selected: p.id === api.profileId }, p.name); }));
    athSel.onchange = function () { api.profileId = athSel.value; };
    var from = el("input", { type: "date", value: api.from }), to = el("input", { type: "date", value: api.to });
    from.onchange = function () { api.from = from.value; }; to.onchange = function () { api.to = to.value; };
    var types = [["CMJ,SJ,SLJ", "CMJ + SJ + Single Leg"], ["CMJ", "Countermovement Jump"], ["SJ", "Squat Jump"], ["SLJ", "Single Leg Jump (SL-CMJ)"], ["DJ,SLDJ", "Drop Jumps"], ["", "Alle Testarten"]];
    var typSel = el("select", { "aria-label": "Testart" }, types.map(function (t) { return el("option", { value: t[0], selected: api.testType === t[0] }, t[1]); }));
    typSel.onchange = function () { api.testType = typSel.value; apiSave(); };
    var skip = el("input", { type: "checkbox", checked: !!S.settings.skipKnown }); skip.onchange = function () { S.settings.skipKnown = skip.checked; A.saveSettings(); };
    box.append(
      el("div", { class: "kv-row" }, el("label", {}, "Tenant:", tenSel), el("label", {}, "Gruppe:", grpSel)),
      el("div", { class: "kv-row" }, el("label", {}, "Athlet:", q, athSel)),
      el("div", { class: "kv-row" }, el("label", {}, "von", from, "bis", to), el("label", {}, "Testart:", typSel)),
      el("div", { class: "kv-row" },
        btn("Tests suchen", function () { apiRun("Suche Tests …", searchTests); }, "", { disabled: isBusy || !api.tenantId }),
        btn("Suchen und alle importieren", function () { apiRun("Suche Tests …", searchTests).then(function () { importTests(api.tests || []); }); }, "p", { disabled: isBusy || !api.tenantId, title: "Massenimport: alle Treffer der Filter holen, auswerten und speichern" }),
        el("label", {}, skip, "schon gespeicherte Tests überspringen")));
    if (api.tests) {
      var fmtRec = function (t) { var d = new Date(new Date(t.recordedDateUtc).getTime() + (t.recordedDateOffset || 0) * 60000); return A.fmtDate(d.toISOString().slice(0, 10)) + " " + d.toISOString().slice(11, 16); };
      var all = el("input", { type: "checkbox", checked: api.tests.length && api.sel.size === api.tests.length, "aria-label": "Alle auswählen" });
      all.onchange = function () { api.sel = new Set(all.checked ? api.tests.map(function (t) { return t.testId; }) : []); renderApiPanel(); };
      var shown = api.tests.slice(0, 300);
      var body = el("tbody", {}, shown.map(function (t) {
        var cb = el("input", { type: "checkbox", checked: api.sel.has(t.testId) });
        cb.onchange = function () { cb.checked ? api.sel.add(t.testId) : api.sel.delete(t.testId); var c = document.getElementById("kvApiCount"); if (c) c.textContent = api.tests.length + " Test(s) · " + api.sel.size + " ausgewählt"; };
        return el("tr", {}, el("td", {}, cb), el("td", {}, fmtRec(t)), el("td", {}, t.athlete), el("td", {}, t.testType), el("td", { class: "u" }, t.notes || ""));
      }));
      put(box, el("div", { class: "kv-row", style: "margin-top:6px" }, el("span", { id: "kvApiCount", class: "kv-mini" }, api.tests.length + " Test(s) · " + api.sel.size + " ausgewählt"),
        btn("Ausgewählte importieren", function () { importTests(api.tests.filter(function (t) { return api.sel.has(t.testId); })); }, "g", { disabled: isBusy || !api.sel.size })),
        api.tests.length ? el("div", { class: "kv-tblbox", style: "max-height:300px;overflow:auto" }, el("table", { class: "kv-t" }, el("thead", {}, el("tr", {}, el("th", {}, all), el("th", {}, "Datum"), el("th", {}, "Athlet"), el("th", {}, "Testart"), el("th", {}, "Notiz"))), body))
          : el("p", { class: "kv-hint" }, "Keine Tests für diese Filter gefunden."),
        api.tests.length > shown.length ? el("p", { class: "kv-note" }, "Es werden die ersten 300 Tests angezeigt; importiert werden alle ausgewählten (" + api.sel.size + ").") : null);
    }
    box.append(apiLogEl());
    return box;
  }

  /* ================= Panel 3: CSV-Dateien hochladen ================= */
  function uploadFiles(files, meta) {
    var list = Array.prototype.slice.call(files), errs = [], recs = [], i = 0;
    busy("Dateien werden gelesen …");
    function read() {
      if (i >= list.length) return Promise.resolve();
      var f = list[i++];
      if (!/\.csv$/i.test(f.name)) { errs.push(f.name + ": keine CSV-Datei."); return read(); }
      return f.text().then(function (text) {
        recs.push({ id: "Upload|" + f.name + "|" + hash(text), name: f.name, text: text, source: "Upload", athlete: meta.athlete || undefined, date: meta.date || undefined, added: Date.now() });
      }).then(read);
    }
    return read().then(function () { return A.ingest(recs, function (n, tot) { prog("Dateien werden ausgewertet …", n, tot); }); }).then(function (r) {
      busy(""); prog(""); U.upErrors = errs.concat(r.errs); done(r.ok ? r.ok + " Datei" + (r.ok > 1 ? "en" : "") + " ausgewertet und gespeichert." : null);
      if (!r.ok) A.renderSprung();
    });
  }
  function panelUpload() {
    var who = el("input", { type: "text", placeholder: "nur wenn nicht in der Datei steht", value: U.bulkUpWho || "" }), dt = el("input", { type: "date", value: U.bulkUpDate || "" });
    who.onchange = function () { U.bulkUpWho = who.value.trim(); }; dt.onchange = function () { U.bulkUpDate = dt.value; };
    var inp = el("input", { type: "file", accept: ".csv,text/csv", multiple: true });
    var drop = el("label", { class: "kv-drop", tabindex: 0 }, inp, el("strong", {}, "CSV-Dateien wählen oder hierher ziehen"), el("span", {}, "ForceDecks-Exporte, viele Dateien und mehrere Athlet:innen auf einmal möglich"));
    var go = function (files) { uploadFiles(files, { athlete: U.bulkUpWho || "", date: U.bulkUpDate || "" }); };
    inp.onchange = function () { go(inp.files); inp.value = ""; };
    drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } });
    ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { go(e.dataTransfer.files); });
    return el("div", { class: "kv-panel" }, el("h3", {}, "CSV-Dateien hochladen"),
      el("p", { class: "hint" }, "Für Sprünge ohne VALD-Anbindung. Name und Datum werden aus der Datei (Kopfzeilen bzw. Dateiname) gelesen; fehlen sie, hier eintragen – gilt für alle Dateien dieses Uploads."),
      el("div", { class: "kv-row" }, el("label", {}, "Athlet:in:", who), el("label", {}, "Testdatum:", dt)), drop,
      U.upErrors.length ? el("ul", { class: "kv-errs" }, U.upErrors.map(function (e) { return el("li", {}, e); })) : null);
  }

  /* ================= Panel 4: Zuordnung der Namen ================= */
  function panelAthletes() {
    var list = A.athletes(), names = Object.keys(S.excel).map(function (c) { return S.excel[c]; }).sort(function (a, b) { return a.localeCompare(b, "de"); });
    var hasExcel = names.length > 0 && !(typeof DEMO !== "undefined" && DEMO);
    var box = el("div", { class: "kv-panel" }, el("h3", {}, "Zuordnung der Athlet:innen"),
      el("p", { class: "hint" }, hasExcel
        ? "Namen aus VALD werden automatisch den Namen im Rohdatenblatt zugeordnet (Reihenfolge, Umlaute und Zweitnamen egal). Wo das nicht klappt, hier den passenden Namen wählen."
        : "Noch kein Rohdatenblatt geladen – die Namen aus VALD werden direkt übernommen. Nach „Rohdaten laden“ erfolgt hier die Zuordnung zu den Namen im Blatt."));
    if (!list.length) { box.append(el("div", { class: "kv-empty" }, "Noch keine Sprünge im Speicher.")); return box; }
    var body = el("tbody", {}, list.map(function (a) {
      var m = a.map, cur = S.aliases[K.canonName(a.name)] || "";
      var sel = el("select", { "aria-label": "Zuordnung für " + a.name },
        el("option", { value: "" }, "automatisch" + (m.via === "auto" ? " → " + m.display : hasExcel ? " (kein Treffer)" : "")),
        names.map(function (n) { return el("option", { value: n, selected: cur === n }, n); }),
        el("option", { value: A.OWN, selected: cur === A.OWN }, "eigene Person führen"));
      sel.onchange = function () { var c = K.canonName(a.name); if (!sel.value) delete S.aliases[c]; else S.aliases[c] = sel.value; A.saveAliases(); done(); };
      var state = m.via === "none" ? (hasExcel ? el("span", { class: "kv-chk" }, "nicht im Blatt") : el("span", { class: "kv-mini" }, "übernommen")) :
        m.via === "own" ? el("span", { class: "kv-mini" }, "eigene Person") : el("span", { class: "kv-status ok" }, "→ " + m.display);
      return el("tr", {}, el("td", {}, a.name), el("td", { class: "n" }, String(a.n)), el("td", {}, Object.keys(a.types).map(function (t) { return [typeBadge(t), " ", a.types[t] + "× "]; })),
        el("td", { class: "n" }, String(Object.keys(a.dates).length)), el("td", {}, state), el("td", {}, sel));
    }));
    var unm = list.filter(function (a) { return a.map.via === "none"; }).length;
    put(box, el("div", { class: "kv-tblbox", style: "max-height:360px;overflow:auto" }, el("table", { class: "kv-t" },
      el("thead", {}, el("tr", {}, ["Name in VALD / Datei", "Sprünge", "Arten", "Testtage", "Status", "Zuordnung"].map(function (h, i) { return el("th", { class: i === 1 || i === 3 ? "n" : "" }, h); }))), body)),
      hasExcel && unm ? el("p", { class: "kv-note" }, unm + " Name(n) ohne Treffer im Rohdatenblatt – sie erscheinen als eigene Personen ohne Bootsklasse.") : null);
    return box;
  }

  /* ================= Panel 5: Sprungliste ================= */
  function visibleJumps() {
    var q = U.q.toLowerCase();
    var list = S.results.filter(function (r) {
      if (U.filt) {
        var t = K.typeOf(r);
        if (U.filt === "check") { if (!((r.check && !r.override) || !r.ok || A.sjCm(r))) return false; }
        else if (U.filt === "off") { if (r.use) return false; }
        else if (U.filt === "SL") { if (t !== "SL-CMJ" && t !== "SL-SJ") return false; }
        else if (U.filt === "DJ") { if (t !== "DJ" && t !== "SL-DJ") return false; }
        else if (t !== U.filt) return false;
      }
      return !q || (r.athlete + " " + r.file + " " + r.date + " " + r.trial + " " + r.source).toLowerCase().indexOf(q) >= 0;
    });
    var k = U.sortKey, d = U.sortDir;
    return list.sort(function (a, b) {
      var x, y;
      if (k === "date") { x = a.date; y = b.date; } else if (k === "type") { x = K.typeOf(a); y = K.typeOf(b); } else if (k === "trial") { x = a.trial; y = b.trial; } else { x = a.athlete; y = b.athlete; }
      var c = String(x).localeCompare(String(y), "de", { numeric: true }) * d;
      return c || a.athlete.localeCompare(b.athlete, "de") || a.date.localeCompare(b.date) || String(a.trial).localeCompare(String(b.trial), undefined, { numeric: true });
    });
  }
  function selIds() { return Array.from(U.sel).filter(function (id) { return ST.result(id); }); }
  function bulk(fn, msg) { var ids = selIds(); if (!ids.length) return; A.update(ids, fn).then(function () { done(msg ? msg.replace("{n}", ids.length) : null); }); }
  function jumpRows() {
    var list = visibleJumps(), pages = Math.max(1, Math.ceil(list.length / U.per));
    U.page = Math.min(U.page, pages - 1);
    var slice = list.slice(U.page * U.per, U.page * U.per + U.per);
    var typeKeys = Object.keys(CMJ.JUMP_TYPES);
    var allBox = el("input", { type: "checkbox", "aria-label": "Alle auf dieser Seite wählen", checked: slice.length && slice.every(function (r) { return U.sel.has(r.id); }) });
    allBox.onchange = function () { slice.forEach(function (r) { allBox.checked ? U.sel.add(r.id) : U.sel.delete(r.id); }); renderJumpTable(); };
    var th = function (label, key, cls) {
      var arw = U.sortKey === key ? (U.sortDir > 0 ? " ▲" : " ▼") : "";
      return el("th", { class: "s " + (cls || ""), onclick: function () { if (U.sortKey === key) U.sortDir *= -1; else { U.sortKey = key; U.sortDir = 1; } renderJumpTable(); } }, label + arw);
    };
    var body = el("tbody");
    slice.forEach(function (r) {
      var ty = K.typeOf(r), isSL = ty === "SL-CMJ" || ty === "SL-SJ";
      var cb = el("input", { type: "checkbox", checked: U.sel.has(r.id), "aria-label": "Auswählen" }); cb.onchange = function () { cb.checked ? U.sel.add(r.id) : U.sel.delete(r.id); renderJumpFoot(); };
      var tsel = el("select", { "aria-label": "Sprungart" }, el("option", { value: "" }, "automatisch (" + A.typeLabel(r.type) + ")"),
        typeKeys.map(function (k) { return el("option", { value: k, selected: r.override === k }, CMJ.JUMP_TYPES[k].label); }));
      tsel.onchange = function () { A.update([r.id], function (x) { x.override = tsel.value || null; }).then(function () { done(); }); };
      var side = "—";
      if (isSL) {
        side = el("select", { "aria-label": "Seite" }, el("option", { value: "" }, "auto (" + A.sideTxt(r.side) + ")"), el("option", { value: "L", selected: r.sideOverride === "L" }, "links"), el("option", { value: "R", selected: r.sideOverride === "R" }, "rechts"));
        side.onchange = function () { A.update([r.id], function (x) { x.sideOverride = side.value || null; }).then(function () { done(); }); };
      }
      var use = el("input", { type: "checkbox", checked: !!r.use, "aria-label": "Sprung verwenden", disabled: !r.ok }); use.onchange = function () { A.update([r.id], function (x) { x.use = use.checked; }).then(function () { done(); }); };
      var flags = [];
      if (!r.ok) flags.push(el("span", { class: "kv-bad", title: (r.warnings || []).join(" ") }, "nicht auswertbar"));
      if (r.check && !r.override) flags.push(el("span", { class: "kv-chk", title: "Testart laut VALD passt nicht zur Kraftkurve" }, "prüfen"));
      var cm = A.sjCm(r);
      if (cm) flags.push(el("span", { class: "kv-chk", title: "Squat Jump mit Ausholbewegung: Höhe aus dem Impuls " + nf(cm.im, 1) + " cm, aus der Flugzeit " + nf(cm.ft, 1) + " cm. Die Kennwerte stammen aus der Auswertung ab Stand (wie CMJ)." }, "Gegenbewegung"));
      if (isSL && !K.sideOf(r)) flags.push(el("span", { class: "kv-bad" }, "Seite fehlt"));
      if ((ty === "DJ" || ty === "SL-DJ")) flags.push(el("span", { class: "kv-mini" }, "nicht ausgewertet"));
      var open = U.open.has(r.id);
      var info = el("button", { type: "button", class: "kv-l", title: "Begründung der Erkennung und Hinweise", onclick: function () { open ? U.open.delete(r.id) : U.open.add(r.id); renderJumpTable(); } }, open ? "weniger" : "Details");
      body.append(el("tr", { class: (r.use && r.ok ? "" : "off") + (U.sel.has(r.id) ? " sel" : "") },
        el("td", {}, cb), el("td", {}, r.athlete), el("td", {}, A.fmtDate(r.date)), el("td", { title: r.file }, r.trial || r.file), el("td", {}, tsel), el("td", {}, side), el("td", { class: "kv-mini" }, r.source),
        el("td", {}, flags, " ", info), el("td", { style: "text-align:center" }, use)));
      if (open) body.append(el("tr", {}, el("td", {}), el("td", { colspan: 8, class: "why" },
        el("div", {}, el("b", {}, "Erkennung: "), (r.reasons || []).join(" · ") || "—"), (r.warnings || []).length ? el("div", {}, el("b", {}, "Hinweise: "), r.warnings.join(" ")) : null,
        el("div", { class: "kv-mini" }, "Datei: " + r.file + (r.testTypeHint ? " · VALD-Testart: " + r.testTypeHint : "") + (r.mass ? " · Körpermasse " + nf(r.mass, 1) + " kg" : "")))));
    });
    return { list: list, pages: pages, head: el("tr", {}, el("th", {}, allBox), th("Athlet:in", "athlete"), th("Datum", "date"), th("Versuch", "trial"), th("Sprungart", "type"), el("th", {}, "Seite"), el("th", {}, "Quelle"), el("th", {}, "Hinweis"), el("th", {}, "Verwenden")), body: body };
  }
  function renderJumpTable() {
    var host = document.getElementById("kvJumpTbl"); if (!host) return;
    var d = jumpRows();
    host.replaceChildren(!S.results.length ? el("div", { class: "kv-empty" }, "Noch keine Sprünge. Oben aus VALD importieren oder CSV-Dateien hochladen.")
      : !d.list.length ? el("div", { class: "kv-empty" }, "Kein Treffer. Suchbegriff oder Filter anpassen.")
      : el("div", { class: "kv-tblbox" }, el("table", { class: "kv-t" }, el("thead", {}, d.head), d.body)),
      el("div", { class: "kv-foot", id: "kvJumpFoot" }));
    renderJumpFoot();
  }
  function renderJumpFoot() {
    var foot = document.getElementById("kvJumpFoot"); if (!foot) return;
    var d = visibleJumps(), pages = Math.max(1, Math.ceil(d.length / U.per));
    var prev = btn("‹", function () { U.page--; renderJumpTable(); }, "s", { disabled: U.page <= 0 }), next = btn("›", function () { U.page++; renderJumpTable(); }, "s", { disabled: U.page >= pages - 1 });
    foot.replaceChildren(el("span", {}, selIds().length + " ausgewählt · " + d.length + " von " + S.results.length + " Sprüngen"), el("span", {}, prev, " Seite " + (U.page + 1) + " / " + pages + " ", next));
    var bar = document.getElementById("kvBulk"); if (bar) bar.querySelectorAll("button,select,input").forEach(function (x) { if (x.dataset.needsel) x.disabled = !selIds().length; });
  }
  function panelJumps() {
    var box = el("div", { class: "kv-panel" }, el("h3", {}, "Sprünge"),
      el("p", { class: "hint" }, "Jeder Versuch mit erkannter Sprungart (CMJ, SJ, Single Leg links/rechts). „Verwenden“ nimmt einen Versuch aus der Auswertung heraus, ohne ihn zu löschen. Die Art lässt sich korrigieren – die Kennwerte sind für beide Auswertungen schon gespeichert."));
    var q = el("input", { type: "search", placeholder: "Athlet:in, Datei, Datum suchen", value: U.q, "aria-label": "Sprünge suchen" });
    q.oninput = function () { U.q = q.value; U.page = 0; renderJumpTable(); };
    var chips = [["", "Alle"], ["CMJ", "CMJ"], ["SJ", "SJ"], ["SL", "Single Leg"], ["DJ", "Drop Jump"], ["check", "Prüfen"], ["off", "Ausgeschlossen"]];
    var chipEls = chips.map(function (c) { var b = el("button", { type: "button", class: "chip", "aria-pressed": String(U.filt === c[0]), onclick: function () { U.filt = c[0]; U.page = 0; chipEls.forEach(function (x, i) { x.setAttribute("aria-pressed", String(chips[i][0] === U.filt)); }); renderJumpTable(); } }, c[1]); return b; });
    box.append(el("div", { class: "kv-row" }, q, el("span", { class: "chipset" }, chipEls)));
    var typeSel = el("select", { "data-needsel": 1, "aria-label": "Sprungart für Auswahl" }, el("option", { value: "" }, "Art setzen …"), el("option", { value: "__auto" }, "automatisch"), Object.keys(CMJ.JUMP_TYPES).map(function (k) { return el("option", { value: k }, CMJ.JUMP_TYPES[k].label); }));
    typeSel.onchange = function () { var v = typeSel.value; if (!v) return; bulk(function (x) { x.override = v === "__auto" ? null : v; }, "Sprungart für {n} Sprünge gesetzt."); };
    var who = el("input", { type: "text", placeholder: "Athlet:in setzen …", value: U.bulkWho, "data-needsel": 1, style: "width:170px" }); who.onchange = function () { U.bulkWho = who.value.trim(); };
    var dt = el("input", { type: "date", value: U.bulkDate, "data-needsel": 1 }); dt.onchange = function () { U.bulkDate = dt.value; };
    var nb = function (label, fn, cls) { var b = btn(label, fn, (cls || "") + " s"); b.dataset.needsel = 1; b.disabled = true; return b; };
    box.append(el("div", { class: "kv-row", id: "kvBulk" },
      nb("Alle gefilterten wählen", function () { visibleJumps().forEach(function (r) { U.sel.add(r.id); }); renderJumpTable(); }), nb("Auswahl aufheben", function () { U.sel.clear(); renderJumpTable(); }),
      el("span", { class: "kv-sep" }), nb("Verwenden", function () { bulk(function (x) { if (x.ok) x.use = true; }, "{n} Sprünge werden verwendet."); }), nb("Ausschließen", function () { bulk(function (x) { x.use = false; }, "{n} Sprünge ausgeschlossen."); }),
      typeSel, who, nb("Name setzen", function () { if (!U.bulkWho) { toast("Bitte zuerst einen Namen eintragen."); return; } var v = U.bulkWho; bulk(function (x) { x.athlete = v; }, "Name für {n} Sprünge gesetzt."); }),
      dt, nb("Datum setzen", function () { if (!U.bulkDate) { toast("Bitte zuerst ein Datum wählen."); return; } var v = U.bulkDate; bulk(function (x) { x.date = v; }, "Datum für {n} Sprünge gesetzt."); }),
      el("span", { class: "kv-sep" }),
      nb("Löschen", function () { var ids = selIds(); if (!ids.length) return; if (!window.confirm(ids.length + " Sprünge endgültig aus dem Speicher löschen?")) return; A.remove(ids).then(function () { ids.forEach(function (id) { U.sel.delete(id); }); done(ids.length + " Sprünge gelöscht."); }); }, "d")));
    box.append(el("div", { id: "kvJumpTbl" }));
    return box;
  }

  /* ================= Aufbau des Tabs ================= */
  A.renderSprung = function () {
    root = document.getElementById("kvSprung"); if (!root) return;
    var note = document.getElementById("kvNote");
    if (!S.ready) { root.replaceChildren(el("div", { class: "kv-empty" }, "Sprungspeicher wird geöffnet …")); return; }
    if (note) note.textContent = S.results.length + " Sprünge · " + S.results.filter(K.usable).length + " in der Auswertung";
    U.usage = null;
    root.replaceChildren(el("div", { class: "kv-stack" }, panelStatus(), el("div", { class: "kv-cols" }, panelApi(), panelUpload()), panelAthletes(), panelJumps()));
    renderJumpTable();
  };
})(KVApp);
