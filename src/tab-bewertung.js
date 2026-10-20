/* ===== Reiter „Bewertung“ =====
   Alle Tests, die in der Auswertung vorkommen (Rohdatenblatt, eigene CSV-Parameter, angehakte VALD-Kennwerte), mit der Wahl,
   ob ein höherer oder ein niedrigerer Wert besser ist – oder ob der Test ohne Wertung bleibt.
   Die Wahl wirkt sofort auf alle Berechnungen (Rang, Abweichung zur Gruppe, z-Wert, Netzdiagramm, Entwicklung, Übersicht, PDF, Excel)
   und wird mit den anderen Einstellungen gespeichert und gesichert (Schlüssel „dirs“). */
(function (A) {
  "use strict";
  var S = A.S, el = A.el;
  var B = { q: "", only: false };
  var OPTS = [[1, "höher ist besser"], [-1, "niedriger ist besser"], [0, "ohne Wertung"]];
  var NAME = { "1": "höher besser", "-1": "niedriger besser", "0": "ohne Wertung" };

  function btn(label, fn, cls, o) { o = o || {}; return el("button", { type: "button", class: "kv-b " + (cls || ""), disabled: !!o.disabled, title: o.title || false, onclick: fn }, label); }
  function source(m) { return m.jump ? "VALD" : S.custom.some(function (c) { return c.k === m.k; }) ? "CSV-Import" : "Rohdatenblatt"; }
  function tokens(q) { return q.toLowerCase().split(/\s+/).filter(Boolean); }
  function hay(m) { return (m.t + " " + (m.s || "") + " " + (m.u || "") + " " + (m.g || "") + " " + source(m)).toLowerCase(); }
  function changed(m) { return m.dir !== m.dir0; }

  function noteText() {
    var n = METRICS.length, c = A.dirsChanged();
    return n + " Tests · " + (c ? c + " abweichend von der Voreinstellung" : "alle in der Voreinstellung");
  }
  function updateNote() {
    var n = document.getElementById("kvBewNote"); if (n) n.textContent = noteText();
    var r = document.getElementById("kvBewReset"); if (r) r.disabled = !A.dirsChanged();
  }

  /* Zeile einer Messgröße; die Radiogruppe ändert die Wertung sofort (die Auswertung baut sich danach von selbst neu auf) */
  function row(key) {
    var m = MET[key], tr = el("tr", { "data-k": key, class: changed(m) ? "chg" : "" });
    var radios = OPTS.map(function (o) {
      var i = el("input", { type: "radio", name: "kvdir_" + key, value: String(o[0]), checked: m.dir === o[0], "aria-label": m.t + ": " + o[1] });
      i.addEventListener("change", function () { if (i.checked) set(key, o[0]); });
      return el("label", { class: "kv-dir d" + (o[0] === 1 ? "p" : o[0] === -1 ? "m" : "n") }, i, el("span", {}, o[1]));
    });
    var reset = btn("Voreinstellung", function () { set(key, null); }, "s", { title: "Voreinstellung: " + NAME[m.dir0] });
    tr.append(
      el("td", {}, m.t, m.u ? el("small", { class: "kv-unit" }, " [" + m.u + "]") : null),
      el("td", { class: "u" }, source(m)),
      el("td", { class: "u kv-def" }, NAME[m.dir0]),
      el("td", { class: "kv-dirs" }, radios),
      el("td", { class: "kv-rs" }, reset));
    reset.hidden = !changed(m);
    return tr;
  }
  function set(key, dir) {
    A.setDir(key, dir);
    var tr = document.querySelector('#kvBew tr[data-k="' + key.replace(/"/g, '\\"') + '"]'), m = MET[key];
    if (tr && m) {
      tr.classList.toggle("chg", changed(m));
      Array.prototype.forEach.call(tr.querySelectorAll("input[type=radio]"), function (i) { i.checked = +i.value === m.dir; });
      var b = tr.querySelector(".kv-rs button"); if (b) b.hidden = !changed(m);
    }
    updateNote();
  }

  function table() {
    var toks = tokens(B.q), groups = [], by = {};
    METRICS.forEach(function (m) {
      if (B.only && !changed(m)) return;
      var h = hay(m); if (!toks.every(function (t) { return h.indexOf(t) >= 0; })) return;
      var g = m.g || "Weitere"; if (!by[g]) { by[g] = []; groups.push(g); } by[g].push(m.k);
    });
    var body = el("tbody", {});
    groups.forEach(function (g) {
      body.append(el("tr", { class: "grp" }, el("td", { colspan: 5 }, g)));
      by[g].forEach(function (k) { body.append(row(k)); });
    });
    if (!groups.length) body.append(el("tr", {}, el("td", { colspan: 5, class: "kv-empty" }, B.only ? "Keine abweichenden Tests." : "Kein Test gefunden.")));
    return el("div", { class: "kv-tblbox" }, el("table", { class: "kv-t kv-bew" },
      el("thead", {}, el("tr", {}, ["Test", "Quelle", "Voreinstellung", "Besser ist …", ""].map(function (h) { return el("th", {}, h); }))), body));
  }

  A.renderBewertung = function () {
    var root = document.getElementById("kvBew"); if (!root) return;
    if (!S.ready) { root.replaceChildren(el("div", { class: "kv-empty" }, "Speicher wird geöffnet …")); return; }
    var holder = el("div", { id: "kvBewTable" }, table());
    var redraw = function () { holder.replaceChildren(table()); };
    var q = el("input", { type: "search", placeholder: "Test suchen …", "aria-label": "Test suchen", value: B.q });
    q.addEventListener("input", function () { B.q = q.value; redraw(); });
    var only = el("input", { type: "checkbox", id: "kvBewOnly", checked: B.only });
    only.addEventListener("change", function () { B.only = only.checked; redraw(); });
    var reset = btn("Alle auf Voreinstellung", function () {
      if (!A.dirsChanged() || !window.confirm("Alle geänderten Wertungen (" + A.dirsChanged() + ") auf die Voreinstellung zurücksetzen?")) return;
      A.resetDirs(); A.renderBewertung(); toast("Wertungen zurückgesetzt.");
    }, "d", { disabled: !A.dirsChanged() });
    reset.id = "kvBewReset";
    var note = document.getElementById("kvBewNote"); if (note) note.textContent = noteText();
    root.replaceChildren(el("div", { class: "kv-stack" },
      el("div", { class: "kv-panel" },
        el("h3", {}, "Welcher Wert ist besser?"),
        el("p", { class: "hint" }, "Lege je Test fest, ob ein höherer oder ein niedrigerer Wert besser ist (z. B. bei Zeiten wie Hürden-Bumerang-Lauf oder Reaktion: niedriger = besser). " +
          "Die Wahl gilt sofort überall: Rang, Abweichung zur Gruppe (grün/rot), z-Wert, Netzdiagramm (außen = besser), Entwicklung, Erweiterte Übersicht, PDF und Excel. " +
          "„Ohne Wertung“ nimmt einen Test aus Rang, Farbwertung und Netzdiagramm; der Messwert selbst bleibt sichtbar. VALD-Kennwerte erscheinen hier, sobald sie im Reiter „Parameter“ angehakt sind."),
        el("div", { class: "kv-row" }, q, el("label", {}, only, "nur geänderte"), reset)),
      holder));
  };
})(KVApp);
