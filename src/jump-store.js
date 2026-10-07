/* ===== Sprungspeicher: dauerhafte Ablage im Browser (IndexedDB) =====
   Drei Fächer:
     results – je Sprung die Erkennung und alle Kennwerte (klein, alles Weitere rechnet daraus)
     raw     – die Rohkurve (CSV-Text) je Sprung, nur zum späteren Neuauswerten (optional)
     kv      – Einstellungen, Namenszuordnungen, zuletzt geladenes Rohdatenblatt
   Ist IndexedDB nicht verfügbar (z. B. privates Fenster), läuft alles im Arbeitsspeicher weiter; dann sichert nur
   „Speicher sichern“. Reihenfolge der Werte im Speicher = Reihenfolge der Importe, nichts wird stillschweigend verworfen. */
var KVStore = (function () {
  "use strict";
  var DB = "kader_sprungspeicher", VER = 1, dbp = null, persistent = false;
  var mem = { results: new Map(), raw: new Map(), kv: new Map() };
  var STORES = ["results", "raw", "kv"];
  var KEYPATH = { results: "id", raw: "id", kv: "key" };

  function open() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      try {
        var r = indexedDB.open(DB, VER);
        r.onupgradeneeded = function () { STORES.forEach(function (s) { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: KEYPATH[s] }); }); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
        r.onblocked = function () { rej(new Error("blockiert")); };
      } catch (e) { rej(e); }
    }).catch(function () { return null; });
    return dbp;
  }
  /* mehrere Schreib-/Leseaktionen in einer Transaktion */
  function run(stores, mode, fn) {
    return open().then(function (db) {
      if (!db) return null;
      return new Promise(function (res, rej) {
        try {
          var t = db.transaction(stores, mode), out = fn(function (n) { return t.objectStore(n); });
          t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
          t.onerror = function () { rej(t.error); };
          t.onabort = function () { rej(t.error || new Error("abgebrochen")); };
        } catch (e) { rej(e); }
      });
    });
  }
  function reqAll(store) { return new Promise(function (res, rej) { var r = store.getAll(); r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }

  return {
    /* lädt Ergebnisse und Einstellungen in den Arbeitsspeicher; Rohkurven bleiben in der Datenbank */
    init: function () {
      return open().then(function (db) {
        persistent = !!db;
        if (!db) return { persistent: false };
        return new Promise(function (res, rej) {
          var t = db.transaction(["results", "kv"], "readonly"), a = reqAll(t.objectStore("results")), b = reqAll(t.objectStore("kv"));
          t.oncomplete = function () {
            Promise.all([a, b]).then(function (x) {
              x[0].forEach(function (r) { mem.results.set(r.id, r); });
              x[1].forEach(function (r) { mem.kv.set(r.key, r.value); });
              res({ persistent: true });
            });
          };
          t.onerror = function () { rej(t.error); };
        });
      }).catch(function () { persistent = false; return { persistent: false }; });
    },
    isPersistent: function () { return persistent; },
    results: function () { return Array.from(mem.results.values()); },
    result: function (id) { return mem.results.get(id) || null; },
    hasRaw: function (id) { return !persistent ? mem.raw.has(id) : null; },

    /* ein Sprung: Ergebnis (+ Rohkurve, wenn text gegeben) */
    saveJump: function (res, text) {
      mem.results.set(res.id, res);
      if (!persistent && text != null) mem.raw.set(res.id, text);
      return run(["results", "raw"], "readwrite", function (st) {
        st("results").put(res);
        if (text != null) st("raw").put({ id: res.id, text: text });
      }).catch(function () { /* Speicher voll o. ä.: Ergebnis bleibt im Arbeitsspeicher */ throw new Error("Speichern in der Browser-Datenbank nicht möglich (Speicher voll?)."); });
    },
    /* geänderte Ergebnisse (z. B. Art, „verwenden“) zurückschreiben */
    saveResults: function (list) {
      list.forEach(function (r) { mem.results.set(r.id, r); });
      return run(["results"], "readwrite", function (st) { list.forEach(function (r) { st("results").put(r); }); });
    },
    deleteJumps: function (ids) {
      ids.forEach(function (id) { mem.results.delete(id); mem.raw.delete(id); });
      return run(["results", "raw"], "readwrite", function (st) { ids.forEach(function (id) { st("results").delete(id); st("raw").delete(id); }); });
    },
    getRaw: function (id) {
      if (!persistent) return Promise.resolve(mem.raw.has(id) ? mem.raw.get(id) : null);
      return run(["raw"], "readonly", function (st) { return st("raw").get(id); }).then(function (r) { return r ? r.text : null; });
    },
    dropRaw: function () {
      mem.raw.clear();
      return run(["raw"], "readwrite", function (st) { st("raw").clear(); });
    },
    countRaw: function () {
      if (!persistent) return Promise.resolve(mem.raw.size);
      return run(["raw"], "readonly", function (st) { return st("raw").count(); }).then(function (n) { return n || 0; });
    },

    kvGet: function (key, dflt) { return mem.kv.has(key) ? mem.kv.get(key) : dflt; },
    kvSet: function (key, value) {
      mem.kv.set(key, value);
      return run(["kv"], "readwrite", function (st) { st("kv").put({ key: key, value: value }); }).catch(function () {});
    },
    kvDelete: function (key) {
      mem.kv.delete(key);
      return run(["kv"], "readwrite", function (st) { st("kv").delete(key); }).catch(function () {});
    },

    estimate: function () {
      try { if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate().then(function (e) { return { usage: e.usage || 0, quota: e.quota || 0 }; }).catch(function () { return null; }); } catch (e) {}
      return Promise.resolve(null);
    },
    /* Bitte den Browser, den Speicher nicht von selbst zu räumen (verhindert Verlust bei knappem Plattenplatz) */
    persist: function () { try { if (navigator.storage && navigator.storage.persist) return navigator.storage.persist().catch(function () { return false; }); } catch (e) {} return Promise.resolve(false); },

    /* Sicherung als Blob (JSON). withRaw: Rohkurven mitnehmen (deutlich größer). */
    exportBlob: function (withRaw) {
      var head = { format: "kader-sprungspeicher", version: 1, exported: new Date().toISOString(), withRaw: !!withRaw };
      var parts = ["{" + Object.keys(head).map(function (k) { return JSON.stringify(k) + ":" + JSON.stringify(head[k]); }).join(",") + ",\"kv\":{"];
      var first = true;
      mem.kv.forEach(function (v, k) { parts.push((first ? "" : ",") + JSON.stringify(k) + ":" + JSON.stringify(v)); first = false; });
      parts.push("},\"results\":[" + Array.from(mem.results.values()).map(function (r) { return JSON.stringify(r); }).join(",") + "]");
      if (!withRaw) { parts.push("}"); return Promise.resolve(new Blob(parts, { type: "application/json" })); }
      var ids = Array.from(mem.results.keys()), i = 0, firstRaw = true;
      parts.push(",\"raw\":[");
      function step() {
        if (i >= ids.length) { parts.push("]}"); return Promise.resolve(new Blob(parts, { type: "application/json" })); }
        var id = ids[i++];
        return KVStore.getRaw(id).then(function (t) { if (t != null) { parts.push((firstRaw ? "" : ",") + JSON.stringify({ id: id, text: t })); firstRaw = false; } return step(); });
      }
      return step();
    },
    /* Sicherung einlesen: ergänzt/überschreibt Sprünge gleicher ID, Einstellungen werden übernommen */
    importObject: function (o) {
      if (!o || o.format !== "kader-sprungspeicher") return Promise.reject(new Error("Keine Sicherung des Sprungspeichers."));
      var results = o.results || [], raw = o.raw || [], kv = o.kv || {};
      results.forEach(function (r) { mem.results.set(r.id, r); });
      Object.keys(kv).forEach(function (k) { mem.kv.set(k, kv[k]); });
      if (!persistent) raw.forEach(function (r) { mem.raw.set(r.id, r.text); });
      return run(["results", "raw", "kv"], "readwrite", function (st) {
        results.forEach(function (r) { st("results").put(r); });
        raw.forEach(function (r) { st("raw").put(r); });
        Object.keys(kv).forEach(function (k) { st("kv").put({ key: k, value: kv[k] }); });
      }).then(function () { return { results: results.length, raw: raw.length }; });
    },
    clearAll: function () {
      mem.results.clear(); mem.raw.clear(); mem.kv.clear();
      return run(["results", "raw", "kv"], "readwrite", function (st) { st("results").clear(); st("raw").clear(); st("kv").clear(); });
    }
  };
})();
