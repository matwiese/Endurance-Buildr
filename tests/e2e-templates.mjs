/* Browser-Test der Auswertungstemplates: Vorlage anlegen und speichern, Wirkung auf Einzelauswertung/PDF/Excel,
   CSV-Import eigener Parameter, Neustart (alles wieder da), Sicherungsordner (mit einem Test-Ordner im Browser-Speicher).
   Aufruf: node tests/e2e-templates.mjs [Ordner für Screenshots] */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { loadCore, makeJump } from "./helpers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.argv[2] || "/tmp/kader-e2e-tpl"; fs.mkdirSync(shots, { recursive: true });
const req = createRequire(fs.existsSync("/opt/node-tools/node_modules/playwright") ? "/opt/node-tools/node_modules/" : import.meta.url);
const { chromium } = req("playwright");
const { CMJ } = loadCore();
const ok = m => console.log("  ✓ " + m);
const libXlsx = process.env.XLSX_JS || "/tmp/claude-0/-home-user-Endurance-Buildr/d1dd4d56-5fc7-5581-8c98-2572a0be5451/scratchpad/libs/xlsx/package/dist/xlsx.full.min.js";
const libPdf = process.env.JSPDF_JS || "/tmp/claude-0/-home-user-Endurance-Buildr/d1dd4d56-5fc7-5581-8c98-2572a0be5451/scratchpad/libs/jspdf/package/dist/jspdf.umd.min.js";
if (!fs.existsSync(libPdf)) { console.error("jsPDF fehlt (JSPDF_JS) – dieser Test prüft den PDF-Inhalt."); process.exit(2); }

/* Text aus dem PDF: Inhaltsströme (ggf. mit Flate gepackt) lesen, Textanzeigen (…) Tj einsammeln */
function pdfText(file) {
  const buf = fs.readFileSync(file), raw = buf.toString("latin1"), out = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g; let m;
  while ((m = re.exec(raw))) {
    let s = m[1];
    try { s = zlib.inflateSync(Buffer.from(s, "latin1")).toString("latin1"); } catch (e) { /* ungepackt */ }
    if (!/\bTj\b|\bTJ\b/.test(s)) continue;
    const t = /\(((?:\\.|[^\\)])*)\)\s*Tj/g; let x;
    while ((x = t.exec(s))) out.push(x[1].replace(/\\([()\\])/g, "$1"));
  }
  return { all: out.join("\n"), pages: (raw.match(/\/Type\s*\/Page[^s]/g) || []).length };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kader-tpl-"));
const jumpFiles = [];
[["Sophie Wende", 2.35], ["Paul Luv", 2.55], ["Hannah Schot", 2.3]].forEach(([who, v]) => ["2026.01.20", "2026.04.21"].forEach((d, di) => {
  const add = (k, t, v0) => { const f = makeJump(CMJ, k, { athlete: who, date: d, trial: t, v0, seed: t + jumpFiles.length }); const p = path.join(dir, jumpFiles.length + "_" + f.name); fs.writeFileSync(p, f.text); jumpFiles.push(p); };
  [1, 2].forEach(n => add("CMJ", n, v + di * 0.05 + n * 0.04)); [1, 2].forEach(n => add("SJ", 10 + n, v - 0.3 + n * 0.02)); add("SL-L", 21, v - 0.35); add("SL-R", 31, v - 0.4);
}));

const errors = [];
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
/* Test-Ordner im Browser-Speicher statt eines echten Ordners (die Auswahl-Dialoge des Systems lassen sich nicht bedienen) */
await ctx.addInitScript(() => { window.showDirectoryPicker = async () => { const r = await navigator.storage.getDirectory(); return r.getDirectoryHandle("kader-sync-test", { create: true }); }; });
const page = await ctx.newPage();
page.on("pageerror", e => errors.push("PAGEERROR " + e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\.googleapis|net::ERR/.test(m.text())) errors.push("console: " + m.text()); });
await page.route("**/jspdf.umd.min.js", r => r.fulfill({ path: libPdf, contentType: "text/javascript" }));
if (fs.existsSync(libXlsx)) await page.route("**/xlsx.full.min.js", r => r.fulfill({ path: libXlsx, contentType: "text/javascript" }));
/* Seite über einen lokalen Webserver ausliefern: der Test-Ordner im Browser-Speicher (OPFS) steht für file:// nicht zur Verfügung */
const server = http.createServer((req, res) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(path.join(root, "kaderauswertung_segeln_vald.html"))); });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const url = "http://127.0.0.1:" + server.address().port + "/";
const shot = n => page.screenshot({ path: path.join(shots, n + ".png"), fullPage: true });
const ready = () => page.waitForFunction(() => window.KVApp && KVApp.S.ready);
/* wartet, bis eine (asynchrone) Bedingung stimmt – page.waitForFunction wartet nicht auf Promises */
const until = async (fn, ms = 15000, what = "Bedingung") => { const t0 = Date.now(); for (;;) { try { if (await fn()) return; } catch (e) { /* weiter versuchen */ } if (Date.now() - t0 > ms) throw new Error("Zeitüberschreitung: " + what); await new Promise(r => setTimeout(r, 250)); } };
const pdfOf = async (name, file) => { const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), page.evaluate(n => exportPdfByName(n), name)]); const p = path.join(shots, file); await dl.saveAs(p); return pdfText(p); };

try {
  console.log("1. Start: Rohdatenblatt und Sprünge laden");
  await page.goto(url); await ready();
  const csv = await page.evaluate(() => DEMO_CSV); fs.writeFileSync(path.join(dir, "roh.csv"), csv);
  await page.setInputFiles("#fin", path.join(dir, "roh.csv")); await page.waitForFunction(() => DEMO === false);
  await page.evaluate(() => setTab("sprung")); await page.setInputFiles("#kvSprung .kv-drop input", jumpFiles);
  await page.waitForFunction(n => KVApp.S.results.length >= n && !KVApp.S.busy, jumpFiles.length, { timeout: 120000 });
  assert.equal(await page.evaluate(() => KVApp.tplName()), "Alle Kennwerte");
  ok(`12 Athlet:innen aus dem Blatt, ${jumpFiles.length} Sprünge; Vorlage „Alle Kennwerte“ aktiv`);

  console.log("2. Mit „Alle Kennwerte“ zeigt das PDF alles");
  const pdfAll = await pdfOf("Wende Sophie", "profil_alle.pdf");
  for (const t of ["Swiss ventral", "Fmax beidseitig", "CMJ ohne Arme", "Jump Height (Imp-Mom)", "LEISTUNGSPROFIL", "DURCHG"]) assert.ok(pdfAll.all.includes(t), "PDF (alle) ohne „" + t + "“");
  ok(`PDF ${pdfAll.pages} Seiten, enthält Rumpf, Maximalkraft, CMJ, Sprungkennwerte und Netzdiagramm`);

  console.log("3. Neue Vorlage anlegen: Auswahl, Bausteine, Speichern unter …");
  await page.evaluate(() => setTab("templates"));
  await page.waitForSelector("#kvTplBar");
  const picker = i => `#kvTpl .kv-panel:nth-of-type(${i}) .kv-picker`;
  /* Sportmotorik: alles abwählen, dann Körpermasse, CMJ, SJ, PSA anhaken */
  const tests = page.locator("#kvTpl .kv-picker").nth(0);
  await tests.locator(".kv-picker-top button:has-text('Keine')").click();
  for (const q of ["Körpermasse", "CMJ", "Squat Jump", "PSA", "Screen-Summe", "Reaktion"]) {
    await tests.locator("input[type=search]").fill(q); await tests.locator("button:has-text('Treffer anhaken')").click();
  }
  await tests.locator("input[type=search]").fill("");
  /* Sprungkennwerte: nur Sprunghöhe (Impuls) + Peak Power / BM für CMJ und Single Leg */
  const jumps = page.locator("#kvTpl .kv-picker").nth(1);
  await jumps.locator(".kv-picker-top button:has-text('Keine')").click();
  for (const rx of [/^Jump Height \(Imp-Mom\) \[cm\]$/, /^Peak Power \/ BM \[W\/kg\]$/]) await jumps.locator("label").filter({ hasText: rx }).locator("input").check();
  for (const g of ["SJ", "SL-SJ links", "SL-SJ rechts"]) await page.locator(`#kvTpl .kv-groups label:text-is("${g}") input`).uncheck();
  /* Bausteine: Vergleich zur Gruppe aus, Rang an */
  await page.locator("#kvTpl .kv-block:has-text('Vergleich zur Gruppe') input").uncheck();
  await page.locator("#kvTpl .kv-block:has-text('Rangplatz') input").check();
  assert.match(await page.textContent("#kvTplBar .kv-status"), /nicht gespeichert/);
  await page.click("#kvTplBar button:has-text('Speichern unter')");
  await page.fill("#kvTplBar .kv-dialog input[type=text]", "Testtag Kurz");
  await page.click("#kvTplBar .kv-dialog button:has-text('Speichern')");
  await page.waitForFunction(() => KVApp.S.templates.length === 1);
  const saved = await page.evaluate(() => KVApp.S.templates[0]);
  assert.equal(saved.name, "Testtag Kurz");
  assert.deepEqual(saved.metrics.sort(), ["cmj", "fmsSum", "gew", "psa", "reakt", "sj"]);
  assert.deepEqual(saved.jump.params.sort(), ["Jump Height (Imp-Mom)", "Peak Power / BM"]);
  assert.ok(saved.jump.groups.includes("CMJ") && saved.jump.groups.includes("SL-CMJ|L") && !saved.jump.groups.includes("SJ"));
  assert.equal(saved.blocks.deviation, false); assert.equal(saved.blocks.rank, true);
  ok("Vorlage „Testtag Kurz“ gespeichert: 6 Tests, 2 Sprungkennwerte, Bausteine angepasst");
  await shot("01_vorlage");

  console.log("4. Als Auswertung verwenden → Einzelauswertung zeigt nur das Angekreuzte");
  await page.click("#kvTplBar button:has-text('Als Auswertung verwenden')");
  await page.waitForFunction(() => KVApp.S.activeTpl !== "tpl:alle");
  await page.evaluate(() => { pickName = "Wende Sophie"; setTab("einzel"); });
  await page.waitForSelector("#single .panel h3");
  const heads = await page.$$eval("#single .panel h3", e => e.map(x => x.textContent));
  const labels = await page.$$eval("#single .mline .lbl", e => e.map(x => x.textContent));
  assert.ok(heads.includes("CMJ (VALD)") && heads.includes("SL-CMJ links (VALD)") && !heads.includes("SJ (VALD)") && !heads.includes("Rumpfkraftausdauer") && !heads.includes("Maximalkraft"), heads.join(" | "));
  assert.ok(labels.some(l => /CMJ ohne Arme/.test(l)) && labels.some(l => /Jump Height \(Imp-Mom\)/.test(l)) && !labels.some(l => /Swiss|Fmax|Hängen/.test(l)), labels.join(" | "));
  assert.ok(await page.$(".mline.mlite") && !(await page.$("#single .regwrap")), "Zeilen ohne Regler (Vergleich zur Gruppe aus)");
  assert.ok(labels.some(l => /Platz \d+\/\d+/.test(l)), "Rang sichtbar");
  assert.equal(await page.$("#single .spiderpanel"), null, "kein Netzdiagramm (Baustein aus bzw. zu wenige Achsen)");
  assert.match(await page.textContent("#tplNote"), /Testtag Kurz/);
  await shot("02_einzel_vorlage");
  ok(`nur ${labels.length} Kennwerte in ${heads.length} Karten, Rang statt Regler, kein Netzdiagramm; Hinweis „Vorlage: Testtag Kurz“`);

  console.log("5. PDF zeigt nur, was in der Vorlage angekreuzt ist");
  const pdf = await pdfOf("Wende Sophie", "profil_kurz.pdf");
  for (const t of ["CMJ ohne Arme", "Jump Height (Imp-Mom)", "Peak Power / BM", "Platz ", "Vorlage: Testtag Kurz"]) assert.ok(pdf.all.includes(t), "PDF ohne „" + t + "“");
  for (const t of ["Swiss", "Fmax", "Bankziehen", "LEISTUNGSPROFIL", "Tapping", "Hopp", "Eccentric Peak Power"]) assert.ok(!pdf.all.includes(t), "PDF enthält „" + t + "“, obwohl nicht angekreuzt");
  assert.ok(pdf.pages < pdfAll.pages, `weniger Seiten (${pdf.pages} statt ${pdfAll.pages})`);
  ok(`PDF ${pdf.pages} Seiten statt ${pdfAll.pages}: nur Vorlage, kein Netzdiagramm, Rangplätze, Vorlagenname im Kopf`);

  console.log("6. Excel folgt der Vorlage");
  if (fs.existsSync(libXlsx)) {
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click("button:has-text('Gesamtübersicht als Excel')")]);
    const xp = path.join(shots, "export_vorlage.xlsx"); await dl.saveAs(xp);
    const XLSX = req(path.dirname(libXlsx) + "/../xlsx.js"), wb = XLSX.readFile(xp), head = XLSX.utils.sheet_to_json(wb.Sheets["Leistung aktuell"], { header: 1 })[0];
    assert.ok(head.includes("CMJ ohne Arme (cm)") && head.includes("Jump Height (Imp-Mom) (cm)") && !head.some(h => /Swiss|Fmax/.test(h)), head.join(" | "));
    assert.ok(head.length < 25, "Spalten: " + head.length);
    ok(`Excel „Leistung aktuell“: ${head.length} Spalten statt über 100`);
  } else console.log("  – übersprungen (SheetJS nicht vorhanden)");

  console.log("7. CSV-Import weiterer Parameter (neue Parameter, bekannter Test, Wiederholung)");
  const csv1 = "Name;Testdatum;CMJ o.A. [cm];Sprint 10 m [s];Medizinball (m);Bemerkung\nWende Sophie;21.04.2026;31,2;1,85;8,5;gut\nLuv Paul;21.04.2026;36,4;1,79;9,25;ok\nNeu Person;21.04.2026;30,0;1,95;7,5;\nDurchschnitt;;32,5;1,86;8,4;\n";
  fs.writeFileSync(path.join(dir, "zusatz1.csv"), Buffer.from(csv1, "latin1"));   /* Windows-Zeichensatz wie bei Excel */
  await page.evaluate(() => setTab("templates"));
  await page.setInputFiles("#kvImp input[type=file]", path.join(dir, "zusatz1.csv"));
  await page.waitForSelector("#kvImp .kv-wiz");
  const rowsTxt = await page.$$eval("#kvImp .kv-wiz tbody tr", e => e.map(r => r.textContent));
  assert.ok(rowsTxt.some(r => /Sprint 10 m/.test(r)) && rowsTxt.some(r => /Medizinball/.test(r)), rowsTxt.join(" | "));
  await page.locator("#kvImp .kv-wiz tbody tr:has-text('Sprint 10 m') select").nth(1).selectOption("-1");
  await shot("03_csv_zuordnung");
  await page.locator("#kvImp label:has-text('in die geöffnete Vorlage') input").uncheck();   /* sonst würden die neuen Parameter gleich mit angekreuzt */
  await page.click("#kvImp button:has-text('Importieren')");
  await page.waitForFunction(() => KVApp.S.imports.length === 1);
  const st = await page.evaluate(() => ({ custom: KVApp.S.custom.map(d => [d.k, d.t, d.u, d.d, d.dir, d.g]), imp: KVApp.S.imports[0].rows.length, sophie: findPlayer("Wende Sophie").tests.filter(t => testKey(t) === 20260421).map(t => [t.cmj, t.c_sprint_10_m, t.c_medizinball]), neu: !!findPlayer("Neu Person") }));
  assert.deepEqual(st.custom, [["c_sprint_10_m", "Sprint 10 m", "s", 2, -1, "Eigene Parameter"], ["c_medizinball", "Medizinball", "m", 2, 0, "Eigene Parameter"]]);
  assert.equal(st.imp, 3, "Durchschnittszeile wird übersprungen");
  assert.equal(st.sophie.length, 1); assert.equal(st.sophie[0][1], 1.85); assert.equal(st.sophie[0][2], 8.5);
  assert.ok(st.neu, "unbekannte Person kommt als eigene Zeile dazu");
  assert.notEqual(st.sophie[0][0], 31.2, "CMJ aus dem Blatt bleibt (Import überschreibt nicht)");
  ok("2 neue Parameter (Sprint 10 m, Wertung „kleiner = besser“; Medizinball), 3 Zeilen; Blattwert für CMJ blieb");
  /* Zweiter Import mit demselben Parameternamen: gleicher Parameter, keine Dopplung */
  const csv2 = "Name;Testdatum;Sprint 10 m [s]\nSegel Jonas;21.04.2026;2,05\n";
  fs.writeFileSync(path.join(dir, "zusatz2.csv"), csv2);
  await page.setInputFiles("#kvImp input[type=file]", path.join(dir, "zusatz2.csv")); await page.waitForSelector("#kvImp .kv-wiz");
  await page.locator("#kvImp label:has-text('in die geöffnete Vorlage') input").uncheck();
  await page.click("#kvImp button:has-text('Importieren')"); await page.waitForFunction(() => KVApp.S.imports.length === 2);
  assert.equal(await page.evaluate(() => KVApp.S.custom.length), 2, "kein doppelter Parameter");
  assert.equal(await page.evaluate(() => findPlayer("Segel Jonas").cur.c_sprint_10_m), 2.05);
  ok("zweiter Import mit gleichem Namen ergänzt denselben Parameter");
  await shot("04_csv_importiert");

  console.log("8. Eigene Parameter in Vorlagen, Einzelauswertung und PDF");
  await page.evaluate(() => KVApp.setActive("tpl:alle"));
  await page.evaluate(() => { pickName = "Wende Sophie"; setTab("einzel"); });
  const h2 = await page.$$eval("#single .panel h3", e => e.map(x => x.textContent));
  assert.ok(h2.includes("Eigene Parameter"), h2.join(" | "));
  const pdf2 = await pdfOf("Wende Sophie", "profil_alle_mit_eigenen.pdf");
  assert.ok(pdf2.all.includes("Sprint 10 m") && pdf2.all.includes("Medizinball"), "PDF mit eigenen Parametern");
  /* in „Testtag Kurz“ erst nach dem Anhaken */
  const tid = await page.evaluate(() => KVApp.S.templates[0].id);
  await page.evaluate(id => KVApp.setActive(id), tid);
  const pdf3 = await pdfOf("Wende Sophie", "profil_kurz2.pdf");
  assert.ok(!pdf3.all.includes("Sprint 10 m"), "nicht angekreuzt → nicht im PDF");
  await page.evaluate(() => setTab("templates"));
  await page.locator("#kvTpl .kv-picker").nth(0).locator("input[type=search]").fill("Sprint");
  await page.locator("#kvTpl .kv-picker").nth(0).locator("button:has-text('Treffer anhaken')").click();
  await page.click("#kvTplBar button:has-text('Speichern')");
  const pdf4 = await pdfOf("Wende Sophie", "profil_kurz3.pdf");
  assert.ok(pdf4.all.includes("Sprint 10 m") && !pdf4.all.includes("Medizinball"), "angekreuzter eigener Parameter erscheint, der andere nicht: " + JSON.stringify(await page.evaluate(() => ({ t: KVApp.S.templates[0].metrics, a: KVApp.tplName(), dirty: document.querySelector("#kvTplBar .kv-status").textContent }))) + " | " + pdf4.all.replace(/\n/g, " ¦ ").slice(0, 900));
  ok("eigene Parameter erscheinen unter „Alle Kennwerte“ automatisch, in eigenen Vorlagen erst nach dem Anhaken");

  console.log("9. Neustart: Vorlage, aktive Auswahl, Importe, eigene Parameter sind wieder da");
  await page.waitForTimeout(700);
  await page.reload(); await ready(); await page.waitForFunction(() => players.length > 0);
  const re = await page.evaluate(() => ({ tpl: KVApp.S.templates.map(t => t.name), active: KVApp.tplName(), sel: document.getElementById("tplSel").selectedOptions[0].textContent, custom: KVApp.S.custom.length, imports: KVApp.S.imports.length, players: players.length, sprint: findPlayer("Segel Jonas").cur.c_sprint_10_m }));
  assert.deepEqual(re.tpl, ["Testtag Kurz"]); assert.equal(re.active, "Testtag Kurz"); assert.equal(re.sel, "Testtag Kurz"); assert.equal(re.custom, 2); assert.equal(re.imports, 2); assert.equal(re.sprint, 2.05);
  const pdf5 = await pdfOf("Wende Sophie", "profil_nach_neustart.pdf");
  assert.ok(pdf5.all.includes("Vorlage: Testtag Kurz") && !pdf5.all.includes("Swiss"), "PDF nach Neustart weiter nach Vorlage");
  ok(`nach Neu-Laden: Vorlage „${re.active}“ aktiv, ${re.custom} eigene Parameter, ${re.imports} Importe, ${re.players} Athlet:innen`);

  console.log("10. Vorlagen austauschen (Export/Import)");
  await page.evaluate(() => setTab("templates"));
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#kvTplBar button:has-text('Exportieren')")]);
  const ep = path.join(shots, "vorlagen.json"); await dl.saveAs(ep);
  const exp = JSON.parse(fs.readFileSync(ep, "utf8"));
  assert.equal(exp.format, "kader-auswertungsvorlagen"); assert.equal(exp.templates.length, 1); assert.equal(exp.templates[0].name, "Testtag Kurz");
  await page.setInputFiles("#kvTplBar input[type=file]", ep);
  await page.waitForFunction(() => KVApp.S.templates.length === 2);
  assert.deepEqual(await page.evaluate(() => KVApp.S.templates.map(t => t.name).sort()), ["Testtag Kurz", "Testtag Kurz (2)"]);
  ok("Export/Import: Kopie „Testtag Kurz (2)“ ohne Namenskonflikt");
  /* löschen */
  await page.click("#kvTplBar button:has-text('Löschen')"); await page.click("#kvTplBar .kv-dialog button:has-text('Löschen')");
  await page.waitForFunction(() => KVApp.S.templates.length === 1);

  console.log("11. Sicherungsordner: automatische Sicherung und Wiederherstellung");
  await page.evaluate(() => setTab("templates"));
  await page.click("#kvSyncPanel button:has-text('Sicherungsordner wählen')");
  await page.waitForSelector("#kvSyncPanel .kv-status:has-text('Sicherungsordner')");
  const readFiles = () => page.evaluate(async () => { const r = await navigator.storage.getDirectory(), d = await r.getDirectoryHandle("kader-sync-test"), o = {}; for await (const [n, h] of d.entries()) o[n] = await (await h.getFile()).text(); return o; });
  await until(async () => (await readFiles())["Kaderauswertung_Einstellungen.json"] && (await readFiles())["Kaderauswertung_Sprungdaten.json"], 20000, "beide Dateien im Ordner");
  let files = await readFiles();
  const kv = JSON.parse(files["Kaderauswertung_Einstellungen.json"]), jp = JSON.parse(files["Kaderauswertung_Sprungdaten.json"]);
  assert.equal(kv.kv.templates[0].name, "Testtag Kurz"); assert.ok(kv.kv.custom.length === 2 && kv.kv.imports.length === 2 && kv.kv.base.rows.length > 20);
  assert.equal(jp.results.length, jumpFiles.length); assert.ok(!("_syncHandle" in kv.kv) && !("_lastWrite" in kv.kv), "interne Schlüssel gehören nicht in die Sicherung");
  ok(`zwei Dateien geschrieben: Einstellungen (${(files["Kaderauswertung_Einstellungen.json"].length / 1024).toFixed(0)} KB) und ${jp.results.length} Sprünge`);
  /* Änderung → Datei wird nachgeführt */
  await page.evaluate(() => { KVApp.S.templates[0].name = "Testtag Kurz neu"; KVApp.saveTemplates(); });
  await until(async () => (await readFiles())["Kaderauswertung_Einstellungen.json"].includes("Testtag Kurz neu"), 15000, "umbenannte Vorlage im Ordner");
  ok("Änderung wurde selbsttätig in den Ordner geschrieben");
  /* Datenverlust im Browser: „Alles löschen“ darf die Sicherung nicht leeren */
  await page.evaluate(() => KVApp.wipe()); await page.waitForTimeout(2500);
  files = await readFiles();
  assert.equal(JSON.parse(files["Kaderauswertung_Einstellungen.json"]).kv.templates[0].name, "Testtag Kurz neu", "Sicherung blieb nach „Alles löschen“ erhalten");
  await page.reload(); await ready();
  assert.equal(await page.evaluate(() => KVApp.S.templates.length + KVApp.S.results.length + KVApp.S.imports.length), 0);
  await page.evaluate(() => setTab("templates"));
  await page.waitForSelector("#kvSyncPanel");
  await page.waitForFunction(() => KVSync.state().handle && KVSync.state().perm === "granted");
  await page.click("#kvSyncPanel button:has-text('Aus Ordner laden')");
  await page.waitForSelector("#kvSyncPanel .kv-dialog");
  await page.click("#kvSyncPanel .kv-dialog button:has-text('Aus Ordner laden')");
  await page.waitForFunction(() => KVApp.S.results.length > 0 && KVApp.S.templates.length === 1, null, { timeout: 20000 });
  const back = await page.evaluate(() => ({ tpl: KVApp.S.templates[0].name, results: KVApp.S.results.length, custom: KVApp.S.custom.length, players: players.length, active: KVApp.tplName() }));
  files = await readFiles(); const inFile = JSON.parse(files["Kaderauswertung_Einstellungen.json"]).kv.templates.map(t => t.name);
  assert.equal(back.tpl, "Testtag Kurz neu", "Datei enthält: " + inFile.join(", ")); assert.equal(back.results, jumpFiles.length); assert.equal(back.custom, 2); assert.ok(back.players >= 13);
  ok(`nach „Alles löschen“ und Neustart aus dem Ordner wiederhergestellt: Vorlage, ${back.results} Sprünge, ${back.custom} eigene Parameter, ${back.players} Athlet:innen`);
  await shot("05_nach_wiederherstellung");

  assert.deepEqual(errors, [], "Fehler im Browser:\n" + errors.join("\n"));
  console.log("\nALLES OK (Vorlagen) – Screenshots in " + shots);
} catch (e) {
  console.error("\nFEHLGESCHLAGEN:", e.message); if (errors.length) console.error("Browser-Fehler:\n" + errors.join("\n")); process.exitCode = 1;
  try { await shot("fehler"); } catch (x) {}
} finally { await browser.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
