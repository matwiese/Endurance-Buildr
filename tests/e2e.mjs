/* Ende-zu-Ende-Test im echten Browser (Chromium, Playwright):
   Test-Bridge starten → Rohdatenblatt laden → alle Sprünge per VALD-Import holen → Auswertung prüfen → Neustart prüfen.
   Aufruf:  node tests/e2e.mjs   (Voraussetzung: node tools/build.mjs wurde ausgeführt, Playwright ist installiert)
   Screenshots landen im Ordner, der als erstes Argument angegeben wird (Standard: /tmp/kader-e2e). */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.argv[2] || "/tmp/kader-e2e";
fs.mkdirSync(shots, { recursive: true });
const req = createRequire(fs.existsSync("/opt/node-tools/node_modules/playwright") ? "/opt/node-tools/node_modules/" : import.meta.url);
const { chromium } = req("playwright");

const PORT = 8799, BRIDGE = `http://127.0.0.1:${PORT}`;
const bridge = spawn(process.execPath, [path.join(root, "tools/mock-bridge.mjs"), "--port", String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise(r => bridge.stdout.once("data", r));
const errors = [];
let browser;
const ok = (m) => console.log("  ✓ " + m);
try {
  browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined });
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push("PAGEERROR " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\.googleapis|net::ERR/.test(m.text())) errors.push("console: " + m.text()); });
  const shot = (n, full = true) => page.screenshot({ path: path.join(shots, n + ".png"), fullPage: full });
  const url = "file://" + path.join(root, "kaderauswertung_segeln_vald.html");

  console.log("1. Start (Beispieldaten, leerer Speicher)");
  await page.goto(url);
  await page.waitForFunction(() => window.KVApp && KVApp.S.ready);
  assert.equal(await page.evaluate(() => players.length), 12);
  assert.equal(await page.evaluate(() => DEMO), true);
  ok("Beispieldaten sichtbar, Sprungspeicher bereit");

  console.log("2. Rohdatenblatt laden (CSV)");
  const csv = await page.evaluate(() => DEMO_CSV);
  const csvPath = path.join(shots, "rohdaten.csv"); fs.writeFileSync(csvPath, csv);
  await page.setInputFiles("#fin", csvPath);
  await page.waitForFunction(() => DEMO === false);
  assert.equal(await page.evaluate(() => players.length), 12);
  ok("Rohdatenblatt geladen: 12 Athlet:innen");

  console.log("3. VALD-Import über die Test-Bridge (Massenimport)");
  await page.evaluate(() => setTab("sprung"));
  await page.fill("#kvApi input[type=text]", BRIDGE);
  await page.dispatchEvent("#kvApi input[type=text]", "change");
  await page.click("#kvApi button:has-text('Verbinden')");
  await page.waitForSelector("#kvApi .kv-status.ok");
  await page.fill("#kvApi input[type=date] >> nth=0", "2026-01-01");
  await page.dispatchEvent("#kvApi input[type=date] >> nth=0", "change");
  await page.fill("#kvApi input[type=date] >> nth=1", "2026-12-31");
  await page.dispatchEvent("#kvApi input[type=date] >> nth=1", "change");
  await page.click("#kvApi button:has-text('Suchen und alle importieren')");
  await page.waitForFunction(() => KVApp.S.results.length >= 252, null, { timeout: 240000 });
  await page.waitForFunction(() => !KVApp.S.busy);
  const st = await page.evaluate(() => {
    const c = {}; KVApp.S.results.forEach(r => { const k = KVCore.typeOf(r) + (KVCore.sideOf(r) || ""); c[k] = (c[k] || 0) + 1; });
    return { n: KVApp.S.results.length, c, check: KVApp.S.results.filter(r => r.check).length, bad: KVApp.S.results.filter(r => !r.ok).length };
  });
  assert.equal(st.n, 252);
  assert.deepEqual(st.c, { CMJ: 63, SJ: 63, "SL-CMJL": 63, "SL-CMJR": 63 });
  assert.equal(st.check, 0, "Erkennung widerspricht der Testart");
  assert.equal(st.bad, 0, "nicht auswertbare Sprünge");
  ok("252 Sprünge importiert und erkannt: " + JSON.stringify(st.c));
  await shot("01_sprungdaten");

  console.log("4. Zuordnung zum Rohdatenblatt und dynamische Metriken");
  const m = await page.evaluate(() => ({
    players: players.length, sophie: findPlayer("Wende Sophie") && findPlayer("Wende Sophie").tests.length, gast: !!findPlayer("Gast Tester"),
    unmatched: KVApp.S.info.unmatched, metrics: METRICS.length, stat: STATIC_METRICS.length, defs: KVApp.S.defs.length,
    groups: Array.from(new Set(KVApp.S.defs.map(d => d.g)))
  }));
  assert.equal(m.players, 13, "12 aus dem Blatt + Gast Tester");
  assert.ok(m.gast);
  assert.deepEqual(Object.keys(m.unmatched), ["Gast Tester"]);
  assert.ok(m.sophie >= 4, "Sophie Wende: Blatt-Termine + Sprungtag zusammengeführt");
  assert.equal(await page.evaluate(() => KVApp.S.sel.size), 15, "Erststart: kompakte Auswahl");
  assert.ok(m.defs > 40 && m.defs < 90, "Metriken aus den Sprungdaten (kompakte Auswahl): " + m.defs);
  assert.deepEqual(m.groups.sort(), ["CMJ (VALD)", "SJ (VALD)", "SL-CMJ Seitenvergleich (VALD)", "SL-CMJ links (VALD)", "SL-CMJ rechts (VALD)"].sort());
  ok(`Namen zugeordnet (Sophie Wende ↔ Wende Sophie), ${m.defs} Sprung-Metriken in ${m.groups.length} Gruppen`);

  console.log("5. Einzelauswertung, Rangliste, Entwicklung, Datenqualität");
  await page.evaluate(() => { pickName = "Wende Sophie"; setTab("einzel"); });
  await page.waitForSelector("#single .panel h3");
  const heads = await page.$$eval("#single .panel h3", e => e.map(x => x.textContent));
  /* alle Sprünge stehen in einer Kategorie „Sprungleistung / Schnellkraft“ (nicht mehr „Sprungkraft“), die Sprungart in Klammern */
  assert.ok(heads.includes("Sprungleistung / Schnellkraft") && !heads.includes("Sprungkraft") && !heads.some(h => /\(VALD\)/.test(h)), "Gruppen in Einzelauswertung: " + heads.join(" | "));
  const jl = await page.$$eval("#single .panel:has(h3:text-is('Sprungleistung / Schnellkraft')) .lbl", e => e.map(x => x.textContent.replace(/\s+/g, " ").trim()));
  for (const rx of [/^CMJ ohne Arme/, /^Squat Jump/, /^5er Hopp links/, /^Jump Height \(Imp-Mom\) \(CMJ\)/, /^Jump Height \(Imp-Mom\) \(SJ\)/, /\(SL-CMJ links\)/, /\(SL-CMJ rechts\)/]) assert.ok(jl.some(l => rx.test(l)), `Zeile ${rx} fehlt in „Sprungleistung / Schnellkraft“: ` + jl.slice(0, 8).join(" | "));
  await shot("02_einzel");
  await page.evaluate(() => { curMetric = "j_cmj_jump_height_imp_mom"; setTab("leistung"); });
  await page.waitForSelector("#board .lb");
  assert.ok((await page.$$("#board .lb")).length >= 12);
  await shot("03_rangliste");
  /* Gesamtübersicht: Sprung-Spalten voreingestellt, weitere frei wählbar */
  let ths = await page.$$eval("#lthead th", e => e.map(x => x.textContent));
  assert.ok(ths.some(t => /RSI-modified/.test(t)) && ths.some(t => /Seitendifferenz Jump Height/.test(t)), "Sprung-Spalten in der Gesamtübersicht: " + ths.join(" | "));
  const nCols = ths.length;
  await page.selectOption("#lcAdd", "j_cmj_flight_time"); await page.click("button:has-text('+ Spalte')");
  ths = await page.$$eval("#lthead th", e => e.map(x => x.textContent)); assert.equal(ths.length, nCols + 1); assert.ok(ths.some(t => /Flight Time/.test(t)));
  await page.click("#lthead th:has-text('Flight Time') .lcx");
  assert.equal((await page.$$("#lthead th")).length, nCols);
  ok("Gesamtübersicht mit Sprung-Spalten; Spalten hinzufügen und entfernen funktioniert");
  await page.evaluate(() => { devWho = "Wende Sophie"; devMetric = "j_cmj_jump_height_imp_mom"; setTab("entwicklung"); });
  await page.waitForTimeout(300);
  await shot("04_entwicklung");
  await page.evaluate(() => setTab("qualitaet"));
  const flags = await page.$$eval("#flags .flag b", e => e.map(x => x.textContent));
  assert.ok(flags.includes("Sprungspeicher (VALD)") && flags.includes("Sprung-Athlet:innen nicht im Rohdatenblatt"), flags.join(" | "));
  await shot("05_qualitaet");
  ok("Karten, Rangliste, Entwicklung und Hinweise vorhanden");

  console.log("6. Parameter-Auswahl wirkt auf die Auswertung; Kombination speichern");
  await page.evaluate(() => setTab("parameter"));
  await page.waitForSelector(".kv-setbar");
  await page.selectOption(".kv-setbar select", "builtin:vald");
  await page.waitForFunction(() => KVApp.S.defs.length > 150, null, { timeout: 8000 });
  const vald = await page.evaluate(() => ({ sel: KVApp.S.sel.size, defs: KVApp.S.defs.length }));
  assert.equal(vald.sel, 65);
  ok("Vorlage „VALD-Standard“: " + vald.sel + " Kennwerte → " + vald.defs + " Metriken in der Auswertung");
  await page.selectOption(".kv-setbar select", "builtin:compact");
  await page.waitForFunction(() => KVApp.S.defs.length < 100 && KVApp.S.defs.length > 20, null, { timeout: 8000 });
  const compact = await page.evaluate(() => ({ sel: KVApp.S.sel.size, defs: KVApp.S.defs.length }));
  assert.equal(compact.sel, 15);
  ok("Vorlage „Kompakt“: " + compact.sel + " Kennwerte → " + compact.defs + " Metriken");
  await page.click(".kv-setbar button:has-text('Speichern unter')");
  await page.fill(".kv-dialog input[type=text]", "Test Sprungkraft");
  await page.click(".kv-dialog button:has-text('Speichern')");
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem("cmj_metric_sets_v1")).sets && Object.values(JSON.parse(localStorage.getItem("cmj_metric_sets_v1")).sets).some(s => s.name === "Test Sprungkraft")));
  await page.click("button:has-text('Kennwerte auswählen')");
  await page.fill(".kv-picker-top input[type=search]", "landing asymmetry");
  await shot("06_parameter");
  ok("eigene Kombination gespeichert");

  console.log("7. Neustart: alles kommt aus dem Speicher zurück");
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForFunction(() => window.KVApp && KVApp.S.ready && players.length > 0);
  const re = await page.evaluate(() => ({ results: KVApp.S.results.length, players: players.length, demo: DEMO, file: FILE, sel: KVApp.S.sel.size, persistent: KVStore.isPersistent() }));
  assert.equal(re.results, 252); assert.equal(re.players, 13); assert.equal(re.demo, false); assert.equal(re.sel, 15); assert.equal(re.persistent, true);
  ok("nach Neu-Laden: 252 Sprünge, 13 Athlet:innen, Auswahl und Rohdatenblatt wieder da (" + re.file + ")");

  console.log("8. Sicherung: Export und Wiederherstellung");
  await page.evaluate(() => setTab("sprung"));
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("button:has-text('Speicher sichern (klein)')")]);
  const bpath = path.join(shots, "sicherung.json"); await dl.saveAs(bpath);
  const backup = JSON.parse(fs.readFileSync(bpath, "utf8"));
  assert.equal(backup.format, "kader-sprungspeicher"); assert.equal(backup.results.length, 252);
  ok("Sicherung geschrieben (" + (fs.statSync(bpath).size / 1024).toFixed(0) + " KB, " + backup.results.length + " Sprünge)");
  await page.evaluate(() => { window.confirm = () => true; });
  await page.click("button:has-text('Alles löschen')"); await page.click("button:has-text('Ja, alles löschen')");
  await page.waitForFunction(() => KVApp.S.results.length === 0);
  await page.setInputFiles("#kvSprung input[type=file][accept*=json]", bpath);
  await page.waitForFunction(() => KVApp.S.results.length === 252);
  ok("nach „Alles löschen“ per Sicherung wieder 252 Sprünge");

  assert.deepEqual(errors, [], "Fehler im Browser:\n" + errors.join("\n"));
  console.log("\nALLES OK – Screenshots in " + shots);
} catch (e) {
  console.error("\nFEHLGESCHLAGEN:", e.message);
  if (errors.length) console.error("Browser-Fehler:\n" + errors.join("\n"));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  bridge.kill();
}
