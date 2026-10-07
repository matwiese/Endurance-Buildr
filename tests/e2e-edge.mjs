/* Randfälle im Browser: Upload ohne Rohdatenblatt, Zusammenführen, Aggregation, Korrekturen, Zuordnung,
   Neu-Auswerten, Excel-/PDF-Export mit den Sprung-Metriken, Betrieb ohne dauerhaften Speicher.
   Aufruf: node tests/e2e-edge.mjs [Ordner für Screenshots]
   Excel-/PDF-Export brauchen die Bibliotheken (SheetJS, jsPDF); wo sie nicht erreichbar sind, wird der Teil übersprungen
   (Pfad kann über XLSX_JS / JSPDF_JS als Umgebungsvariable angegeben werden). */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { loadCore, makeJump } from "./helpers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.argv[2] || "/tmp/kader-e2e-edge"; fs.mkdirSync(shots, { recursive: true });
const req = createRequire(fs.existsSync("/opt/node-tools/node_modules/playwright") ? "/opt/node-tools/node_modules/" : import.meta.url);
const { chromium } = req("playwright");
const { CMJ } = loadCore();
const ok = m => console.log("  ✓ " + m);
const libXlsx = process.env.XLSX_JS || "/tmp/claude-0/-home-user-Endurance-Buildr/d1dd4d56-5fc7-5581-8c98-2572a0be5451/scratchpad/libs/xlsx/package/dist/xlsx.full.min.js";
const libPdf = process.env.JSPDF_JS || "/tmp/claude-0/-home-user-Endurance-Buildr/d1dd4d56-5fc7-5581-8c98-2572a0be5451/scratchpad/libs/jspdf/package/dist/jspdf.umd.min.js";

/* Testdateien: 3 Personen, zwei Tage; Namen absichtlich anders herum als im Rohdatenblatt */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kader-up-"));
const people = [["Sophie Wende", 2.35], ["Paul Luv", 2.55], ["Gast Eins", 2.2]];
const files = [];
function add(kind, who, date, trial, v0, hint) {
  const f = makeJump(CMJ, kind, { athlete: who, date, trial, v0, seed: trial + files.length, hint });
  const p = path.join(dir, files.length + "_" + f.name); fs.writeFileSync(p, f.text); files.push({ p, who, date, kind, trial });
}
people.forEach(([who, v], i) => ["2026.04.21", "2026.05.19"].forEach((d, di) => {
  [1, 2, 3].forEach(n => add("CMJ", who, d, n, v + di * 0.05 + n * 0.04));
  [1, 2].forEach(n => add("SJ", who, d, 10 + n, v - 0.3 + n * 0.02));
  [1, 2].forEach(n => add("SL-L", who, d, 20 + n, v - 0.35 + n * 0.02));
  [1, 2].forEach(n => add("SL-R", who, d, 30 + n, v - 0.4 + n * 0.02));
}));
const allPaths = files.map(f => f.p);

const errors = [];
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined });
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
  if (opts.noIdb) await ctx.addInitScript(() => { Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true }); });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push("PAGEERROR " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\.googleapis|net::ERR/.test(m.text())) errors.push("console: " + m.text()); });
  if (fs.existsSync(libXlsx)) await page.route("**/xlsx.full.min.js", r => r.fulfill({ path: libXlsx, contentType: "text/javascript" }));
  if (fs.existsSync(libPdf)) await page.route("**/jspdf.umd.min.js", r => r.fulfill({ path: libPdf, contentType: "text/javascript" }));
  await page.goto("file://" + path.join(root, "kaderauswertung_segeln_vald.html"));
  await page.waitForFunction(() => window.KVApp && KVApp.S.ready);
  return page;
}
const upload = async (page, list) => { await page.evaluate(() => setTab("sprung")); await page.setInputFiles("#kvSprung .kv-drop input", list); await page.waitForFunction(n => KVApp.S.results.length >= n && !KVApp.S.busy, list.length, { timeout: 120000 }); };
const rowOf = (page, name, date) => page.evaluate(([n, d]) => { const p = findPlayer(n); const t = p && p.tests.filter(x => x.date === d)[0]; return t ? JSON.parse(JSON.stringify(t)) : null; }, [name, date]);

try {
  console.log("A. Upload ohne Rohdatenblatt: Beispieldaten werden ersetzt");
  let page = await newPage();
  await upload(page, allPaths);
  let st = await page.evaluate(() => ({ n: KVApp.S.results.length, demo: DEMO, players: players.map(p => p.name).sort(), file: FILE }));
  assert.equal(st.n, files.length); assert.equal(st.demo, false); assert.deepEqual(st.players, ["Gast Eins", "Paul Luv", "Sophie Wende"]);
  ok(`${st.n} Dateien: Athlet:in aus Kopfzeile, Beispieldaten ersetzt (${st.file})`);
  const typeStat = await page.evaluate(() => { const c = {}; KVApp.S.results.forEach(r => { const k = KVCore.typeOf(r) + (KVCore.sideOf(r) || ""); c[k] = (c[k] || 0) + 1; }); return c; });
  assert.deepEqual(typeStat, { CMJ: 18, SJ: 12, "SL-CMJL": 12, "SL-CMJR": 12 }); ok("Sprungarten korrekt: " + JSON.stringify(typeStat));

  console.log("B. Rohdatenblatt danach laden: Zusammenführen nach Name und Testtag");
  const csv = await page.evaluate(() => DEMO_CSV); const csvPath = path.join(dir, "roh.csv"); fs.writeFileSync(csvPath, csv);
  await page.setInputFiles("#fin", csvPath);
  await page.waitForFunction(() => players.length > 3);
  st = await page.evaluate(() => ({ players: players.length, sophie: findPlayer("Wende Sophie").tests.map(t => t.date), unm: Object.keys(KVApp.S.info.unmatched), gast: !!findPlayer("Gast Eins") }));
  assert.equal(st.players, 13); assert.deepEqual(st.unm, ["Gast Eins"]);
  assert.ok(st.sophie.includes("2026-04-21") === false && st.sophie.some(d => /21\.04\.2026/.test(d)), "Sophie: Testtag aus dem Blatt und aus VALD müssen ein Testtag sein: " + st.sophie);
  assert.ok(st.sophie.some(d => d === "2026-05-19"), "zusätzlicher Sprungtag 19.05.2026 als eigene Zeile");
  ok("12 Blatt-Athlet:innen + 1 unbekannt; Sophie Wende ↔ Wende Sophie; Blattzeile 21.04.2026 und Sprungzeile zusammengeführt");

  console.log("C. Aggregation: bester Versuch / Mittelwert / Median (unabhängig nachgerechnet)");
  const H = "Jump Height (Imp-Mom)", key = "j_cmj_jump_height_imp_mom";
  const heights = await page.evaluate(([n, d]) => KVApp.S.results.filter(r => r.athlete === n && r.date === d && KVCore.groupOf(r) === "CMJ").map(r => KVCore.numOf(r.vc["Jump Height (Imp-Mom)"])), ["Sophie Wende", "2026-04-21"]);
  assert.equal(heights.length, 3);
  const exp = { best: Math.max(...heights), mean: heights.reduce((a, b) => a + b) / 3, median: [...heights].sort((a, b) => a - b)[1] };
  for (const mode of ["best", "mean", "median"]) {
    await page.evaluate(m => { KVApp.S.settings.agg = m; KVApp.refresh(); }, mode);
    const t = await rowOf(page, "Wende Sophie", "21.04.2026");
    assert.ok(Math.abs(t[key] - exp[mode]) < 1e-9, `${mode}: ${t[key]} vs ${exp[mode]}`);
  }
  ok("Werte in der Testzeile stimmen mit Eigenrechnung überein (" + heights.map(h => h.toFixed(1)).join(" / ") + " cm)");
  await page.evaluate(() => { KVApp.S.settings.agg = "best"; KVApp.refresh(); });

  console.log("D. Blatt-Wert hat Vorrang; leere CMJ/SJ-Felder werden gefüllt; Abschalten wirkt");
  const filled = await page.evaluate(() => { const t = findPlayer("Wende Sophie").tests.filter(x => x.date === "2026-05-19")[0]; return { cmj: t.cmj, sj: t.sj, psa: t.psa }; });
  assert.ok(filled.cmj > 20 && filled.sj > 15 && filled.psa > 0, JSON.stringify(filled));
  await page.evaluate(() => { KVApp.S.settings.fillCmjSj = false; KVApp.refresh(); });
  const off = await page.evaluate(() => { const t = findPlayer("Wende Sophie").tests.filter(x => x.date === "2026-05-19")[0]; return { cmj: t.cmj, key: t.j_cmj_jump_height_imp_mom }; });
  assert.equal(off.cmj, undefined); assert.ok(off.key > 20);
  await page.evaluate(() => { KVApp.S.settings.fillCmjSj = true; KVApp.refresh(); });
  ok("CMJ/SJ/PSA aus VALD gefüllt (" + filled.cmj.toFixed(1) + " / " + filled.sj.toFixed(1) + " cm, PSA " + filled.psa.toFixed(1) + " %), abschaltbar");

  console.log("E. Korrekturen: Versuch ausschließen, Art ändern, Seite ändern");
  const base = await page.evaluate(() => KVApp.S.results.filter(r => KVCore.usable(r)).length);
  const id = await page.evaluate(() => KVApp.S.results.filter(r => r.athlete === "Paul Luv" && KVCore.groupOf(r) === "CMJ")[0].id);
  await page.evaluate(i => KVApp.update([i], x => { x.use = false; }).then(() => KVApp.refresh()), id);
  assert.equal(await page.evaluate(() => KVApp.S.results.filter(r => KVCore.usable(r)).length), base - 1);
  await page.evaluate(i => KVApp.update([i], x => { x.use = true; x.override = "SJ"; }).then(() => KVApp.refresh()), id);
  const g = await page.evaluate(i => KVCore.groupOf(KVStore.result(i)), id); assert.equal(g, "SJ");
  const sjN = await page.evaluate(() => KVApp.S.table.filter(e => e.athlete === "Luv Paul").map(e => e.groups.SJ && e.groups.SJ.n)); assert.ok(sjN.some(n => n === 3), "SJ-Versuche von Paul: " + sjN);
  const lid = await page.evaluate(() => KVApp.S.results.filter(r => KVCore.sideOf(r) === "L" && r.athlete === "Gast Eins")[0].id);
  await page.evaluate(i => KVApp.update([i], x => { x.sideOverride = "R"; }).then(() => KVApp.refresh()), lid);
  assert.equal(await page.evaluate(i => KVCore.groupOf(KVStore.result(i)), lid), "SL-CMJ|R");
  await page.evaluate(([a, b]) => KVApp.update([a, b], x => { x.override = null; x.sideOverride = null; x.use = true; }).then(() => KVApp.refresh()), [id, lid]);
  ok("Ausschluss, Art-Korrektur und Seiten-Korrektur wirken sofort auf die Auswertung");

  console.log("F. Zuordnung: Gast Eins → Wende Sophie");
  await page.evaluate(() => { KVApp.S.aliases[KVCore.canonName("Gast Eins")] = "Wende Sophie"; KVApp.saveAliases(); KVApp.refresh(); });
  st = await page.evaluate(() => ({ players: players.length, n: findPlayer("Wende Sophie").tests.filter(t => testKey(t) === 20260421).length, cmjN: KVApp.S.table.filter(e => e.athlete === "Wende Sophie" && e.date === "2026-04-21").map(e => e.groups.CMJ.n)[0], unm: Object.keys(KVApp.S.info.unmatched) }));
  assert.equal(st.players, 12); assert.equal(st.n, 1); assert.deepEqual(st.unm, []); assert.equal(st.cmjN, 6, "Versuche beider Namen zählen zusammen");
  ok("zusammengelegt: 12 Athlet:innen, kein Duplikat am Testtag, die 3+3 CMJ-Versuche beider Namen zählen zusammen");
  await page.evaluate(() => { delete KVApp.S.aliases[KVCore.canonName("Gast Eins")]; KVApp.saveAliases(); KVApp.refresh(); });

  console.log("G. Upload ohne Namen in der Datei: Name und Datum aus den Feldern");
  const bare = makeJump(CMJ, "CMJ", { athlete: "X", date: "2026.06.01", trial: 1, v0: 2.3 });
  const bareText = bare.text.replace(/^Athlete,.*\n/m, "").replace(/^Date,.*\n/m, "");
  const bp = path.join(dir, "ohne_kopf.csv"); fs.writeFileSync(bp, bareText);
  await page.evaluate(() => setTab("sprung"));
  await page.fill("#kvSprung .kv-panel:has(.kv-drop) input[type=text]", "Nachtrag Person");
  await page.dispatchEvent("#kvSprung .kv-panel:has(.kv-drop) input[type=text]", "change");
  await page.fill("#kvSprung .kv-panel:has(.kv-drop) input[type=date]", "2026-06-02");
  await page.dispatchEvent("#kvSprung .kv-panel:has(.kv-drop) input[type=date]", "change");
  await page.setInputFiles("#kvSprung .kv-drop input", bp);
  await page.waitForFunction(() => KVApp.S.results.some(r => r.athlete === "Nachtrag Person"));
  const nach = await page.evaluate(() => KVApp.S.results.filter(r => r.athlete === "Nachtrag Person").map(r => ({ d: r.date, t: r.type })));
  assert.deepEqual(nach, [{ d: "2026-06-02", t: "CMJ" }]); ok("Name und Datum aus den Upload-Feldern übernommen");
  await page.evaluate(() => KVApp.remove(KVApp.S.results.filter(r => r.athlete === "Nachtrag Person").map(r => r.id)).then(() => KVApp.refresh()));

  console.log("H. Neu auswerten mit anderer Schwelle (gespeicherte Rohkurven)");
  const before = await page.evaluate(() => KVApp.S.results.map(r => r.thr).filter((v, i, a) => a.indexOf(v) === i));
  await page.evaluate(() => { KVApp.S.settings.thr = 35; return KVApp.reanalyze().then(r => { KVApp.refresh(); return r; }); });
  const after = await page.evaluate(() => ({ thr: KVApp.S.results.map(r => r.thr).filter((v, i, a) => a.indexOf(v) === i), use: KVApp.S.results.filter(r => KVCore.usable(r)).length, n: KVApp.S.results.length }));
  assert.deepEqual(before, [20]); assert.deepEqual(after.thr, [35]); assert.equal(after.use, after.n);
  ok("alle " + after.n + " Sprünge mit Schwelle 35 N neu ausgewertet, Korrekturen blieben erhalten");
  await page.evaluate(() => { KVApp.S.settings.thr = 20; return KVApp.reanalyze().then(() => KVApp.refresh()); });

  console.log("I. Excel-Export mit Sprung-Metriken");
  if (fs.existsSync(libXlsx)) {
    await page.evaluate(() => { KVApp.S.sel = new Set(CMJ.VALD_DEFAULT); KVApp.refresh(); });
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click("button:has-text('Gesamtübersicht als Excel')")]);
    const xp = path.join(shots, "export.xlsx"); await dl.saveAs(xp);
    const XLSX = req(path.dirname(libXlsx) + "/../xlsx.js");
    const wb = XLSX.readFile(xp);
    assert.ok(wb.SheetNames.includes("Leistung aktuell") && wb.SheetNames.includes("Leistung Rohdaten"));
    const leist = XLSX.utils.sheet_to_json(wb.Sheets["Leistung aktuell"], { header: 1 });
    assert.ok(leist[0].includes("Jump Height (Imp-Mom) (cm)"), "Spalte Sprunghöhe fehlt");
    assert.ok(leist[0].length > 150, "Spalten: " + leist[0].length);
    const col = leist[0].indexOf("Jump Height (Imp-Mom) (cm)"), rowS = leist.find(r => r[0] === "Wende Sophie");
    assert.ok(rowS && rowS[col] > 20, "Wert Sophie: " + (rowS && rowS[col]));
    ok(`Excel: ${wb.SheetNames.length} Blätter, ${leist[0].length} Spalten in „Leistung aktuell“, Sprunghöhe Sophie ${Number(rowS[col]).toFixed(1)} cm`);
  } else console.log("  – übersprungen (SheetJS nicht vorhanden)");

  console.log("J. PDF-Profil mit vielen Kennwerten");
  if (fs.existsSync(libPdf)) {
    const t0 = Date.now();
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), page.evaluate(() => exportPdfByName("Wende Sophie"))]);
    const pp = path.join(shots, "profil.pdf"); await dl.saveAs(pp);
    const bytes = fs.readFileSync(pp), pages = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.ok(bytes.length > 20000 && pages >= 2, `PDF ${bytes.length} Bytes, ${pages} Seiten`);
    ok(`PDF erzeugt: ${pages} Seiten, ${(bytes.length / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s (mit 65 Kennwerten × 4 Gruppen)`);
  } else console.log("  – übersprungen (jsPDF nicht vorhanden)");

  console.log("K. Betrieb ohne dauerhaften Speicher (IndexedDB gesperrt)");
  const p2 = await newPage({ noIdb: true });
  await upload(p2, allPaths.slice(0, 8));
  const np = await p2.evaluate(() => ({ persistent: KVStore.isPersistent(), n: KVApp.S.results.length, players: players.length }));
  assert.equal(np.persistent, false); assert.equal(np.n, 8);
  await p2.evaluate(() => setTab("qualitaet"));
  const warn = await p2.$$eval("#flags .flag b", e => e.map(x => x.textContent)); assert.ok(warn.includes("Sprungspeicher nur im Arbeitsspeicher"), warn.join("|"));
  await p2.evaluate(() => setTab("sprung")); assert.match(await p2.textContent("#kvSprung .kpis"), /nur Sitzung/);
  ok("läuft im Arbeitsspeicher weiter, weist deutlich auf fehlende Dauerhaftigkeit hin");

  assert.deepEqual(errors, [], "Fehler im Browser:\n" + errors.join("\n"));
  console.log("\nALLES OK (Randfälle)");
} catch (e) {
  console.error("\nFEHLGESCHLAGEN:", e.message); if (errors.length) console.error("Browser-Fehler:\n" + errors.join("\n")); process.exitCode = 1;
} finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
