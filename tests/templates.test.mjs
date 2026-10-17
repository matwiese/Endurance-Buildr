import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = ["src/templates.js", "src/csv-import.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n;\n");
const { KVTpl, CsvImport } = new Function(src + "\n;return {KVTpl:KVTpl,CsvImport:CsvImport};")();

/* gleiche Regeln wie in der Segeln-Auswertung (hnorm, num) und ein Ausschnitt ihrer Überschriften-Tabelle */
const hnorm = s => String(s == null ? "" : s).trim().replace(/\.\d+$/, "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");
const num = v => { if (v == null || v === "") return null; if (typeof v === "number") return isFinite(v) ? v : null; const n = parseFloat(String(v).trim().replace(",", ".")); return isNaN(n) ? null : n; };
const metrics = { cmj: { k: "cmj", t: "CMJ ohne Arme", calc: 0 }, sj: { k: "sj", calc: 0 }, bmi: { k: "bmi", calc: 1 }, psa: { k: "psa", calc: 1 } };
const hmap = {}; [["Name", "name", "txt"], ["Testdatum", "date", "date"], ["Kader", "kader", "txt"], ["CMJ o.A. [cm]", "cmj"], ["SJ [cm]", "sj"], ["BMI", "bmi"], ["PSA [%]", "psa"]].forEach(([h, k, t]) => {
  const d = { k, t: t || "num", h }; hmap[hnorm(h)] = hmap[hnorm(h)] || d; hmap[hnorm(h.replace(/\[.*?\]/g, ""))] = hmap[hnorm(h.replace(/\[.*?\]/g, ""))] || d;
});
const ctx = { hnorm, hmap, num, serialToIso: n => "2026-01-01", metrics };

test("Vorlagen: eingebaute Vorlagen und Filterregeln", () => {
  const [alle, statik, kurz, sprung] = KVTpl.builtins().map(KVTpl.prepare);
  const m = k => ({ k, jump: 0 }), j = (g, n) => ({ k: "j_x", jump: 1, jg: g, jn: n });
  assert.ok(KVTpl.includes(alle, m("irgendwas")) && KVTpl.includes(alle, j("CMJ", "Peak Power")));
  assert.ok(KVTpl.includes(statik, m("c_neu")) && !KVTpl.includes(statik, j("CMJ", "Peak Power")), "ohne Sprungkennwerte");
  assert.ok(KVTpl.includes(kurz, m("fmsSum")) && !KVTpl.includes(kurz, m("hopL")) && !KVTpl.includes(kurz, m("c_neu")));
  assert.ok(KVTpl.includes(sprung, j("CMJ", "Jump Height (Imp-Mom)")) && !KVTpl.includes(sprung, j("SJ", "Total Work")) && !KVTpl.includes(sprung, j("SL-SJ|L", "Jump Height (Imp-Mom)")));
  assert.equal(sprung.blocks.rank, true); assert.equal(kurz.blocks.rank, false);
});

test("Vorlagen: Sprungkennwerte gelten je Sprungart × Kennwert", () => {
  const t = KVTpl.prepare(KVTpl.normalize({ name: "x", metrics: [], jump: { groups: ["CMJ", "LSI"], params: ["Jump Height (Imp-Mom)"] } }));
  assert.ok(KVTpl.includes(t, { jump: 1, jg: "CMJ", jn: "Jump Height (Imp-Mom)" }));
  assert.ok(KVTpl.includes(t, { jump: 1, jg: "LSI", jn: "Jump Height (Imp-Mom)" }));
  assert.ok(!KVTpl.includes(t, { jump: 1, jg: "SJ", jn: "Jump Height (Imp-Mom)" }));
  assert.ok(!KVTpl.includes(t, { jump: 1, jg: "CMJ", jn: "Peak Power" }));
});

test("Vorlagen: expand/same/normalize, Namen eindeutig, Export und Import", () => {
  const universe = { metrics: ["a", "b", "c"], groups: ["CMJ"], params: ["P1", "P2"] };
  const all = KVTpl.expand(KVTpl.builtins()[0], universe);
  assert.deepEqual(all.metrics, ["a", "b", "c"]); assert.deepEqual(all.jump.params, ["P1", "P2"]); assert.equal(all.kind, "list");
  const stat = KVTpl.expand(KVTpl.builtins()[1], universe);
  assert.deepEqual(stat.jump.params, []);
  const t = KVTpl.normalize({ name: "Mein", metrics: ["a", "a", "b"], blocks: { rank: true } });
  assert.deepEqual(t.metrics, ["a", "b"]); assert.equal(t.blocks.rank, true); assert.equal(t.blocks.spider, true);
  assert.ok(KVTpl.same(t, { name: "anders", metrics: ["b", "a"], blocks: { rank: true } }), "Reihenfolge und Name zählen nicht");
  assert.ok(!KVTpl.same(t, { metrics: ["a"], blocks: { rank: true } }));
  assert.equal(KVTpl.uniqueName([{ name: "X" }, { name: "X (2)" }], "X"), "X (3)");
  const out = KVTpl.toExport([KVTpl.builtins()[2], { ...t, id: "tpl:1" }]);
  assert.equal(out.templates.length, 1, "eingebaute Vorlagen werden nicht exportiert");
  const back = KVTpl.fromImport(JSON.parse(JSON.stringify(out)));
  assert.equal(back.length, 1); assert.equal(back[0].name, "Mein"); assert.notEqual(back[0].id, "tpl:1"); assert.equal(back[0].builtin, false);
  assert.deepEqual(KVTpl.fromImport({ foo: 1 }), []);
});

test("Netzdiagramm: Achsen je Vorlage (normalisieren, Standard, auflösen, Austausch)", () => {
  /* Eintrag je Achse; Doppelte, Leeres und Nicht-Text fallen weg, höchstens 12 */
  const many = Array.from({ length: 20 }, (_, i) => "k" + i);
  assert.equal(KVTpl.spiderOf(undefined), null); assert.equal(KVTpl.spiderOf("x"), null);
  assert.deepEqual(KVTpl.spiderOf(["a", "a", "", 5, null, "b"]), ["a", "b"]);
  assert.equal(KVTpl.spiderOf(many).length, KVTpl.SPIDER_MAX); assert.equal(KVTpl.SPIDER_MIN, 3); assert.equal(KVTpl.SPIDER_MAX, 12);

  /* ältere Vorlagen ohne Angabe: Standardachsen, soweit angekreuzt – wie bisher */
  const old = KVTpl.normalize({ name: "alt", metrics: ["cmj", "hbl", "fmsSum", "gr"] });
  assert.equal(old.spider, null);
  assert.deepEqual(KVTpl.spiderIds(old), ["fmsSum", "cmj", "hbl"], "Reihenfolge der Standardachsen, nur angekreuzte");
  const [alle, statik, kurz, sprung] = KVTpl.builtins();
  assert.deepEqual(KVTpl.spiderIds(alle), KVTpl.SPIDER); assert.deepEqual(KVTpl.spiderIds(statik), KVTpl.SPIDER); assert.deepEqual(KVTpl.spiderIds(kurz), KVTpl.SPIDER);
  assert.equal(KVTpl.spiderIds(sprung).length, 8); assert.ok(KVTpl.spiderIds(sprung).includes("CMJ||Peak Power / BM"));
  /* ausdrückliche Auswahl gilt unabhängig von den Haken (auch ohne das Kennwert-Häkchen), Reihenfolge bleibt */
  const own = KVTpl.normalize({ name: "e", metrics: ["cmj"], spider: ["sj", "cmj", "hopL", "CMJ||Flight Time"] });
  assert.deepEqual(KVTpl.spiderIds(own), ["sj", "cmj", "hopL", "CMJ||Flight Time"]);
  assert.deepEqual(KVTpl.spiderJumpNames(own), ["Flight Time"]);
  assert.deepEqual(KVTpl.spiderJumpNames(old), []);

  /* Editor-Arbeitskopie: immer eine ausdrückliche Liste (bei zu wenigen angekreuzten die acht Standardachsen) */
  const u = { metrics: ["cmj", "sj"], groups: ["CMJ"], params: ["P"] };
  assert.deepEqual(KVTpl.expand(KVTpl.normalize({ name: "x", metrics: ["cmj"] }), u).spider, KVTpl.SPIDER);
  assert.deepEqual(KVTpl.expand(own, u).spider, ["sj", "cmj", "hopL", "CMJ||Flight Time"]);
  assert.deepEqual(KVTpl.expand(alle, u).spider, KVTpl.SPIDER);

  /* Auflösen: sportmotorisch über den Schlüssel, Sprungkennwerte über Sprungart||Kennwert; ohne Wertung (dir 0) und Unbekanntes entfällt */
  const defs = [{ k: "cmj", dir: 1 }, { k: "bmi", dir: 0 }, { k: "j_cmj_ft", dir: 1, jump: 1, jg: "CMJ", jn: "Flight Time" }, { k: "j_sj_ft", dir: 1, jump: 1, jg: "SJ", jn: "Flight Time" }, { k: "c_x", dir: -1 }];
  assert.deepEqual(KVTpl.resolveAxes(["SJ||Flight Time", "cmj", "bmi", "nix", "CMJ||Flight Time", "c_x", "cmj", "CMJ||gibt es nicht"], defs), ["j_sj_ft", "cmj", "j_cmj_ft", "c_x"]);
  assert.equal(KVTpl.axisId("CMJ", "Flight Time"), "CMJ||Flight Time");

  /* Vergleich (ungespeichert?) zählt die Reihenfolge der Achsen mit, Export und Import tragen die Achsen mit */
  const a = KVTpl.normalize({ name: "a", metrics: ["cmj"], spider: ["cmj", "sj", "hopL"] }), b = KVTpl.normalize({ name: "a", metrics: ["cmj"], spider: ["sj", "cmj", "hopL"] });
  assert.ok(!KVTpl.same(a, b), "andere Reihenfolge = geändert"); assert.ok(KVTpl.same(a, { ...a, name: "anders" }));
  assert.ok(!KVTpl.same(a, { ...a, spider: ["cmj", "sj"] }));
  const back = KVTpl.fromImport(JSON.parse(JSON.stringify(KVTpl.toExport([{ ...a, id: "tpl:9" }, { ...old, id: "tpl:8" }]))));
  assert.deepEqual(back[0].spider, ["cmj", "sj", "hopL"]); assert.equal(back[1].spider, null, "Vorlage ohne Angabe bleibt ohne Angabe");
});

test("CSV-Import: Spalten erkennen (Name, Datum, bekannter Test, neuer Parameter, ignorieren)", () => {
  const grid = [
    ["Name", "Testdatum", "Kader", "CMJ o.A. [cm]", "Sprint 10 m [s]", "Medizinball (m)", "BMI", "Bemerkung", "", "Qualität"],
    ["Wende Sophie", "21.04.2026", "A-Kader", "30,5", "1,85", "8", "22", "gut", "", "3"],
    ["Luv Paul", "21.04.2026", "A-Kader", "35,1", "1,79", "9,5", "23", "ok", "", "2"],
    ["Mittelwert", "", "", "32", "1,8", "8,7", "", "", "", ""]
  ];
  const a = CsvImport.analyze(grid, ctx), g = a.columns.map(c => c.guess);
  assert.equal(a.hr, 0); assert.equal(a.rows, 3);
  assert.equal(g[0].action, "name"); assert.equal(g[1].action, "date");
  assert.equal(g[2].action, "ignore", "Stammdaten laufen über „Rohdaten laden“");
  assert.deepEqual(g[3], { action: "metric", key: "cmj" });
  assert.deepEqual(g[4], { action: "new", name: "Sprint 10 m", unit: "s", dp: 2, dir: 0, group: "Eigene Parameter" });
  assert.equal(g[5].name, "Medizinball"); assert.equal(g[5].unit, "m"); assert.equal(g[5].dp, 1);
  assert.equal(g[6].action, "ignore"); assert.match(g[6].note, /gerechnet/);
  assert.equal(g[7].action, "ignore"); assert.equal(g[8].action, "ignore"); assert.equal(g[9].action, "ignore");
});

test("CSV-Import: Kopfzeile nicht in Zeile 1, Name fehlt → Fehler", () => {
  const a = CsvImport.analyze([["Bericht Frühjahr"], ["Name", "X [s]"], ["A B", "1,5"], ["C D", "2,5"]], ctx);
  assert.equal(a.hr, 1);
  assert.throws(() => CsvImport.analyze([["Wert"], ["1"], ["2"]], ctx), /Name/);
  assert.throws(() => CsvImport.analyze([["Name"]], ctx), /Datenzeilen/);
});

test("CSV-Import: neue Parameter anlegen, gleichnamige weiterverwenden, Schlüssel eindeutig", () => {
  const plan = { columns: [
    { index: 0, action: "name" }, { index: 1, action: "new", name: "Sprint 10 m", unit: "s", dp: 2, dir: -1, group: "Schnelligkeit extra" },
    { index: 2, action: "new", name: "Sprint 10 m", unit: "s", dp: 2, dir: -1 }, { index: 3, action: "new", name: "Sprung/Weit", unit: "%", dp: 1, dir: 1 }] };
  const r = CsvImport.defineMetrics(plan, [], ["cmj"]);
  assert.equal(r.defs.length, 3);
  assert.equal(new Set(r.defs.map(d => d.k)).size, 3, "Schlüssel eindeutig");
  assert.equal(r.defs[0].k, "c_sprint_10_m"); assert.equal(r.defs[0].dir, -1); assert.equal(r.defs[0].g, "Schnelligkeit extra");
  assert.equal(r.defs[2].pp, 1, "Prozentwerte: Abweichung in Prozentpunkten");
  const again = CsvImport.defineMetrics({ columns: [{ index: 1, action: "new", name: "Sprint 10 m", unit: "s", dp: 2, dir: -1 }] }, r.defs, []);
  assert.equal(again.defs.length, 0); assert.equal(again.keyOf[1], "c_sprint_10_m", "gleicher Name → derselbe Parameter");
});

test("CSV-Import: Zeilen bauen (Datum, Zahlen mit Komma, Zusammenfassungszeilen, Ersatzdatum)", () => {
  const grid = [["Name", "Testdatum", "CMJ o.A. [cm]", "Sprint [s]"], ["Wende Sophie", "21.04.2026", "30,5", "1,85"], ["Luv Paul", "", "35,1", "x"], ["Durchschnitt", "", "33", "2"], ["Leer Zeile", "", "", ""]];
  const plan = { hr: 0, defaultDate: "2026-05-01", columns: [{ index: 0, action: "name" }, { index: 1, action: "date" }, { index: 2, action: "metric", key: "cmj" }, { index: 3, action: "new", name: "Sprint", unit: "s", dp: 2, dir: -1 }] };
  const keys = CsvImport.defineMetrics(plan, [], []);
  const r = CsvImport.buildRows(grid, plan, keys.keyOf, ctx);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], { name: "Wende Sophie", date: "21.04.2026", q: {}, cmj: 30.5, c_sprint: 1.85 });
  assert.equal(r.rows[1].date, "2026-05-01"); assert.equal(r.rows[1].cmj, 35.1); assert.equal(r.rows[1].c_sprint, undefined);
  assert.equal(r.bad, 1, "„x“ ist keine Zahl"); assert.equal(r.skipped, 2, "Zusammenfassungs- und leere Zeile");
  assert.throws(() => CsvImport.buildRows(grid, { hr: 0, columns: [{ index: 2, action: "metric", key: "cmj" }] }, {}, ctx), /Name/);
  assert.throws(() => CsvImport.buildRows(grid, { hr: 0, columns: [{ index: 0, action: "name" }] }, {}, ctx), /Messspalte/);
});

test("CSV-Import: Text aus Bytes (UTF-8 und Windows-1252)", () => {
  assert.equal(CsvImport.decode(new TextEncoder().encode("Größe;Müller")), "Größe;Müller");
  assert.equal(CsvImport.decode(Uint8Array.from([0x47, 0x72, 0xf6, 0xdf, 0x65])), "Größe");
});
