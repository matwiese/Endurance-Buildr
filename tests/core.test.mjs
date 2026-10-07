import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, makeJump } from "./helpers.mjs";

const { CMJ, KV } = loadCore();
const rec = (kind, o = {}) => { const f = makeJump(CMJ, kind, o); return { id: f.name, name: f.name, text: f.text, source: "Test", ...o.rec }; };

test("Katalog: Namen eindeutig, SJ-Zuordnung zeigt nur auf vorhandene Kennwerte", () => {
  const names = KV.ALL.map(p => p.name);
  assert.equal(new Set(names).size, names.length, "doppelte Kennwertnamen");
  assert.ok(names.length > 200);
  for (const [k, list] of Object.entries(KV.SJ_MAP)) for (const n of list) assert.ok(KV.BYNAME[n], `SJ ${k} → ${n} fehlt im Katalog`);
  for (const n of KV.LSI_NAMES) assert.ok(KV.BYNAME[n], `LSI-Kennwert ${n} fehlt im Katalog`);
});

test("Metrikschlüssel sind eindeutig und tauchen sicher in HTML-Attributen auf", () => {
  const keys = new Set();
  for (const g of Object.keys(KV.GROUPS)) for (const p of KV.ALL) {
    const k = KV.metricKey(g, p.name);
    assert.match(k, /^j_[a-z]+_[a-z0-9_]+$/);
    assert.ok(!keys.has(k), "Schlüssel doppelt: " + k); keys.add(k);
  }
});

test("Erkennung: CMJ, SJ, SL-CMJ links/rechts – mit VALD-Kopfzeile", () => {
  const cases = [["CMJ", "CMJ", null], ["SJ", "SJ", null], ["SL-L", "SL-CMJ", "L"], ["SL-R", "SL-CMJ", "R"]];
  for (const [kind, type, side] of cases) {
    const r = KV.processFile(rec(kind), { thr: 20 });
    assert.equal(r.type, type, kind); assert.equal(r.side, side, kind); assert.ok(r.ok, kind);
    assert.equal(r.check, false, kind + " sollte ohne Prüfhinweis erkannt werden: " + r.reasons.join(" | "));
  }
});

test("Erkennung: ohne Kopfzeile entscheidet die Kraftkurve", () => {
  const cases = [["CMJ", "CMJ", null], ["SJ", "SJ", null], ["SL-L", "SL-CMJ", "L"], ["SL-R", "SL-CMJ", "R"]];
  for (const [kind, type, side] of cases) {
    const r = KV.processFile(rec(kind, { hint: false }), { thr: 20 });
    assert.equal(r.type, type, kind); assert.equal(r.side, side, kind);
  }
});

test("Falsche VALD-Testart wird als Prüfhinweis markiert", () => {
  const f = makeJump(CMJ, "SL-L");
  const text = f.text.replace("Test,SLJ", "Test,CMJ").replace(/Trial,Trial (\d+) \(Left\)/, "Trial,$1");
  const r = KV.processFile({ id: "x", name: "x_2026_03_15_Trial1.csv", text }, { thr: 20 });
  assert.equal(r.type, "CMJ"); assert.equal(r.check, true);
});

test("Kennwerte: CMJ-Katalog vollständig, SJ über Zuordnung, Sprunghöhe plausibel", () => {
  const c = KV.processFile(rec("CMJ"), { thr: 20 });
  assert.equal(Object.keys(c.vc).length, 215);
  const h = KV.numOf(c.vc["Jump Height (Imp-Mom)"]);
  assert.ok(h > 25 && h < 40, "CMJ-Höhe " + h);
  const s = KV.processFile(rec("SJ"), { thr: 20 });
  assert.ok(s.vs, "SJ-Werte fehlen");
  assert.ok(KV.numOf(s.vs["Jump Height (Imp-Mom)"]) > 15);
  assert.ok(KV.fin(KV.numOf(s.vs["Concentric Peak Force"])));
  assert.equal(KV.valuesOf(s), s.vs); assert.equal(KV.valuesOf(c), c.vc);
});

test("Datum und Athlet:in aus Kopfzeile/Dateiname, Vorrang für Importangaben", () => {
  const a = KV.processFile(rec("CMJ"), { thr: 20 });
  assert.equal(a.date, "2026-03-15"); assert.equal(a.athlete, "Test A");
  const b = KV.processFile(rec("CMJ", { rec: { athlete: "Anna Berg", date: "2026-04-01T08:00:00Z" } }), { thr: 20 });
  assert.equal(b.athlete, "Anna Berg"); assert.equal(b.date, "2026-04-01");
  assert.equal(KV.nameFromFile("Max Muster-Countermovement_Jump_2025_05_27_Trial1.csv"), "Max Muster");
});

test("Namensabgleich: Reihenfolge, Umlaute, Teilmenge", () => {
  assert.equal(KV.canonName("Müller, Anna"), KV.canonName("anna mueller".replace("ue", "u")));
  assert.equal(KV.canonName("Wende Sophie"), KV.canonName("Sophie Wende"));
  const list = [KV.canonName("Max Franz Muster"), KV.canonName("Anna Berg")];
  assert.equal(KV.findMatch(KV.canonName("Max Muster"), list), list[0]);
  assert.equal(KV.findMatch(KV.canonName("Berg"), list), null, "Einzelwort darf nicht zuordnen");
  assert.equal(KV.findMatch(KV.canonName("Anna Berg"), list), list[1]);
});

test("Aggregation: bester Versuch, Mittelwert, Median", () => {
  const trials = [1, 2, 3].map((n, i) => KV.processFile(rec("CMJ", { trial: n, seed: n, v0: 2.2 + i * 0.1 }), { thr: 20 }));
  const H = "Jump Height (Imp-Mom)", hs = trials.map(t => KV.numOf(t.vc[H]));
  const best = KV.aggregate(trials, "best", [H, "Peak Power"]);
  assert.equal(best[H], Math.max(...hs));
  const mean = KV.aggregate(trials, "mean", [H])[H];
  assert.ok(Math.abs(mean - hs.reduce((a, b) => a + b) / 3) < 1e-9);
  const med = KV.aggregate(trials, "median", [H])[H];
  assert.equal(med, hs.slice().sort((a, b) => a - b)[1]);
});

test("Tabelle: Gruppen je Athlet/Tag, Seitenvergleich, Metrikdefinitionen", () => {
  const sel = ["Jump Height (Imp-Mom)", "Peak Power / BM", "Concentric Peak Force", "Concentric Impulse Asymmetry", "Concentric Mean Force (Left)", "Contraction Time"];
  const results = [
    KV.processFile(rec("CMJ", { trial: 1 }), { thr: 20 }), KV.processFile(rec("CMJ", { trial: 2, seed: 4, v0: 2.5 }), { thr: 20 }),
    KV.processFile(rec("SJ", { trial: 3 }), { thr: 20 }),
    KV.processFile(rec("SL-L", { trial: 4 }), { thr: 20 }), KV.processFile(rec("SL-R", { trial: 5, v0: 1.8 }), { thr: 20 })
  ];
  const table = KV.buildTable(results, { agg: "best", names: sel, resolve: n => ({ key: KV.canonName(n), display: n }) });
  assert.equal(table.length, 1);
  const e = table[0];
  assert.deepEqual(Object.keys(e.groups).sort(), ["CMJ", "SJ", "SL-CMJ|L", "SL-CMJ|R"].sort());
  assert.equal(e.groups.CMJ.n, 2);
  assert.ok(e.lsi && e.lsi["Jump Height (Imp-Mom)"] > 0, "Seitenvergleich fehlt");
  /* Single Leg: Asymmetrie- und Links/Rechts-Kennwerte entfallen */
  assert.equal(e.groups["SL-CMJ|L"].vals["Concentric Impulse Asymmetry"], undefined);
  assert.equal(e.groups["SL-CMJ|L"].vals["Concentric Mean Force (Left)"], undefined);
  assert.ok(e.groups.CMJ.vals["Concentric Impulse Asymmetry"] >= 0);
  /* SJ kennt die Kennwerte aus der Zuordnung */
  assert.ok(e.groups.SJ.vals["Jump Height (Imp-Mom)"] > 0);
  const defs = KV.metricDefs(table, sel);
  const keys = defs.map(d => d.k);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(defs.some(d => d.g === "CMJ (VALD)" && d.t === "Jump Height (Imp-Mom)" && d.dir === 1));
  assert.ok(defs.some(d => d.g === "SL-CMJ links (VALD)") && defs.some(d => d.g === "SL-CMJ rechts (VALD)"));
  assert.ok(defs.some(d => d.g === "SL-CMJ Seitenvergleich (VALD)" && d.dir === -1));
  const row = KV.rowValues(e);
  for (const d of defs) assert.ok(KV.fin(row[d.k]), "Wert fehlt für " + d.k);
});

test("Ausgeschlossene und unlesbare Sprünge zählen nicht", () => {
  const a = KV.processFile(rec("CMJ"), { thr: 20 }); a.use = false;
  const b = KV.processFile(rec("CMJ", { trial: 2 }), { thr: 20 });
  const t = KV.buildTable([a, b], { agg: "mean", names: ["Peak Power"], resolve: n => ({ key: n, display: n }) });
  assert.equal(t[0].groups.CMJ.n, 1);
  const c = KV.processFile(rec("CMJ", { trial: 3 }), { thr: 20 }); c.override = "DJ";
  assert.equal(KV.groupOf(c), null);
  assert.throws(() => KV.processFile({ id: "k", name: "kaputt.csv", text: "a,b\n1,2\n" }, { thr: 20 }));
});
