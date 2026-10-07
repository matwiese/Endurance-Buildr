/* ===== Sicherungsordner: dauerhafte Ablage außerhalb des Browsers =====
   Die Browser-Datenbank überlebt Schließen und Neustart, geht aber verloren, wenn Browserdaten gelöscht werden oder die Datei
   an einen anderen Ort wandert. Deshalb kann ein Ordner auf dem Rechner (oder in einem Cloud-Ordner) gewählt werden. Die App schreibt
   dort nach jeder Änderung selbsttätig zwei Dateien:
     Kaderauswertung_Einstellungen.json   Vorlagen, Zuordnungen, eigene Parameter, CSV-Importe, Rohdatenblatt, Einstellungen
     Kaderauswertung_Sprungdaten.json     alle Sprünge mit Erkennung und Kennwerten (ohne Rohkurven)
   Technik: File System Access API (Chrome, Edge). Der Browser verlangt, dass der Zugriff nach jedem Neustart mit einem Klick
   bestätigt wird; bis dahin läuft alles weiter über die Browser-Datenbank. */
var KVSync = (function () {
  "use strict";
  var ST = KVStore, HK = "_syncHandle";
  var F_KV = "Kaderauswertung_Einstellungen.json", F_JUMPS = "Kaderauswertung_Sprungdaten.json";
  var supported = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
  var S = { supported: supported, handle: null, perm: "", last: null, error: "", busy: false };
  var listeners = [], timers = {}, pending = { kv: false, results: false };
  function notify() { listeners.forEach(function (f) { try { f(S); } catch (e) {} }); }
  function granted() { return !!S.handle && S.perm === "granted"; }

  function perm(handle, ask) {
    var o = { mode: "readwrite" };
    return Promise.resolve(handle.queryPermission ? handle.queryPermission(o) : "granted").then(function (p) {
      if (p === "granted" || !ask) return p;
      return handle.requestPermission ? handle.requestPermission(o) : p;
    }).catch(function () { return "denied"; });
  }
  function put(name, blob) {
    return S.handle.getFileHandle(name, { create: true }).then(function (fh) { return fh.createWritable(); })
      .then(function (w) { return w.write(blob).then(function () { return w.close(); }); });
  }
  function read(handle, name) {
    return handle.getFileHandle(name).then(function (fh) { return fh.getFile(); }).then(function (f) { return f.text().then(function (t) { return { text: t, modified: f.lastModified, size: f.size }; }); })
      .catch(function () { return null; });
  }

  /* Ein leerer Speicher (z. B. nach „Alles löschen“) darf eine vorhandene Sicherung nie überschreiben */
  function storeEmpty() { return !ST.kvKeys().length && !ST.results().length; }
  function writeNow(which) {
    if (!granted()) return Promise.resolve(false);
    if (storeEmpty()) return Promise.resolve(false);
    S.busy = true; notify();
    var jobs = [];
    if (which.kv) jobs.push(ST.exportBlob(false, "kv").then(function (b) { return put(F_KV, b); }));
    if (which.results) jobs.push(ST.exportBlob(false, "results").then(function (b) { return put(F_JUMPS, b); }));
    return Promise.all(jobs).then(function () { S.last = Date.now(); S.error = ""; ST.kvSet("_lastWrite", S.last); return true; })
      .catch(function (e) { S.error = (e && e.message) || String(e); return false; })
      .then(function (ok) { S.busy = false; notify(); return ok; });
  }
  function schedule(kind) {
    if (!granted()) return;
    pending[kind] = true;
    clearTimeout(timers[kind]);
    timers[kind] = setTimeout(function () {
      var w = { kv: pending.kv && kind === "kv", results: pending.results && kind === "results" };
      pending[kind] = false; writeNow(w);
    }, kind === "kv" ? 1500 : 12000);
  }
  ST.subscribe(function (kind) { schedule(kind === "results" ? "results" : "kv"); });

  return {
    state: function () { return S; },
    isActive: granted,
    onChange: function (fn) { listeners.push(fn); },
    /* beim Start: verknüpften Ordner aus der Datenbank holen (Zugriff muss ggf. neu bestätigt werden) */
    init: function () {
      var h = ST.kvGet(HK, null);
      if (!supported || !h) return Promise.resolve(S);
      S.handle = h;
      return perm(h, false).then(function (p) { S.perm = p; notify(); return S; });
    },
    /* Ordner wählen (Klick nötig). Gibt Infos über vorhandene Sicherungsdateien zurück. */
    choose: function () {
      return window.showDirectoryPicker({ mode: "readwrite", id: "kader-speicher" }).then(function (h) {
        S.handle = h; S.perm = "granted";
        return ST.kvSet(HK, h).then(function () { notify(); return KVSync.probe(); });
      });
    },
    /* Zugriff nach Neustart bestätigen (Klick nötig) */
    grant: function () {
      if (!S.handle) return Promise.resolve(false);
      return perm(S.handle, true).then(function (p) { S.perm = p; notify(); return p === "granted"; });
    },
    unlink: function () { S.handle = null; S.perm = ""; return ST.kvDelete(HK).then(function () { notify(); }); },
    /* was liegt schon im Ordner? */
    probe: function () {
      if (!S.handle) return Promise.resolve(null);
      return Promise.all([read(S.handle, F_KV), read(S.handle, F_JUMPS)]).then(function (r) {
        var info = function (x) { return x ? { modified: x.modified, size: x.size } : null; };
        return { name: S.handle.name || "", kv: info(r[0]), jumps: info(r[1]), newest: Math.max(r[0] ? r[0].modified : 0, r[1] ? r[1].modified : 0), mine: ST.kvGet("_lastWrite", 0) };
      });
    },
    saveNow: function () { return writeNow({ kv: true, results: true }); },
    /* Sicherung aus dem Ordner in den Speicher übernehmen (ergänzt/überschreibt gleiche Einträge) */
    restore: function () {
      if (!S.handle) return Promise.reject(new Error("Kein Ordner verknüpft."));
      return Promise.all([read(S.handle, F_KV), read(S.handle, F_JUMPS)]).then(function (r) {
        if (!r[0] && !r[1]) throw new Error("Im Ordner liegt keine Sicherung.");
        var out = { results: 0 };
        return [r[0], r[1]].reduce(function (p, f) {
          return p.then(function () { return f ? ST.importObject(JSON.parse(f.text)).then(function (x) { out.results += x.results; }) : null; });
        }, Promise.resolve()).then(function () { return out; });
      });
    },
    files: { kv: F_KV, jumps: F_JUMPS }
  };
})();
