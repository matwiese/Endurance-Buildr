/* „Einzel-PDFs letzter Test in Ordner“: nur Personen, die beim letzten Testtermin dabei waren, jeweils mit ihrem Test an diesem Tag.
   Der Ordner wird durch einen Test-Ordner im Speicher ersetzt (die Auswahl-Dialoge des Systems lassen sich nicht bedienen).
   Aufruf: node tests/e2e-letzter-test.mjs   (braucht jsPDF, Pfad über JSPDF_JS) */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(fs.existsSync("/opt/node-tools/node_modules/playwright") ? "/opt/node-tools/node_modules/" : import.meta.url);
const { chromium } = req("playwright");
const ok = m => console.log("  ✓ " + m);
const libPdf = process.env.JSPDF_JS || "/tmp/claude-0/-home-user-Endurance-Buildr/d1dd4d56-5fc7-5581-8c98-2572a0be5451/scratchpad/libs/jspdf/package/dist/jspdf.umd.min.js";
if (!fs.existsSync(libPdf)) { console.error("jsPDF fehlt (JSPDF_JS) – dieser Test erzeugt echte PDF-Dateien."); process.exit(2); }

const errors = [];
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
/* Ordner-Attrappe: merkt sich Dateinamen und Größen */
await ctx.addInitScript(() => {
  window.__files = {};
  window.showDirectoryPicker = async () => ({ name: "Testordner", getFileHandle: async fn => ({ createWritable: async () => ({ write: async b => { window.__files[fn] = b.size; }, close: async () => {} }) }) });
});
const page = await ctx.newPage();
page.on("pageerror", e => errors.push("PAGEERROR " + e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\.googleapis|net::ERR/.test(m.text())) errors.push("console: " + m.text()); });
await page.route("**/jspdf.umd.min.js", r => r.fulfill({ path: libPdf, contentType: "text/javascript" }));

const finished = n => page.waitForFunction(n => Object.keys(window.__files).length === n && FORCE_KEY === null, n, { timeout: 60000 });
try {
  await page.goto("file://" + path.join(root, "kaderauswertung_segeln_vald.html"));
  await page.waitForFunction(() => window.KVApp && KVApp.S.ready && players.length === 12);

  console.log("1. Vorbereitung: eine Person war nur beim früheren Test da, eine hat am letzten Tag eine leere Zeile");
  await page.evaluate(() => {
    BASE_ROWS.push({ name: "Alt Person", date: "14.10.2025", cls: "49er", kader: "B-Kader", cmj: 30, q: {} });
    BASE_ROWS.push({ name: "Leer Person", date: "21.04.2026", cls: "49er", kader: "B-Kader", q: {} });
    rebuildTests(); render();
  });
  const info = await page.evaluate(() => { const li = lastTestInfo(); return { date: li.date, n: li.list.length, names: li.list.map(p => p.name), all: players.length }; });
  assert.equal(info.date, "21.04.2026");
  assert.equal(info.all, 14); assert.equal(info.n, 12, "12 von 14 Personen waren beim letzten Test dabei");
  assert.ok(!info.names.includes("Alt Person") && !info.names.includes("Leer Person"));
  ok(`letzter Test ${info.date}: ${info.n} von ${info.all} Personen (ohne „Alt Person“ und „Leer Person“)`);

  console.log("2. Export „letzter Test“: nur diese Personen, alle mit ihrem Test am letzten Tag (auch bei anderer Auswahl in der Einzelauswertung)");
  await page.evaluate(() => {
    window.__seen = []; const orig = pdfPage;
    window.pdfPage = function (doc, p) { window.__seen.push([p.name, p.cur.date]); return orig.apply(this, arguments); };
    EVALSEL["Wende Sophie"] = { k: 20250610 };   /* in der Einzelauswertung ist bei ihr ein früherer Test gewählt */
  });
  assert.notEqual(await page.evaluate(() => evalIdx(findPlayer("Wende Sophie")) === findPlayer("Wende Sophie").defIdx), true, "Vorbedingung: frühere Auswahl wirkt");
  await page.click("button:has-text('Einzel-PDFs letzter Test in Ordner')");
  await finished(12);
  const files = await page.evaluate(() => Object.keys(window.__files).sort());
  assert.equal(files.length, 12);
  assert.ok(!files.some(f => /Alt_Person|Leer_Person/.test(f)), files.join(", "));
  assert.ok(files.some(f => /Wende_Sophie/.test(f)));
  assert.ok((await page.evaluate(() => Object.values(window.__files))).every(s => s > 3000), "PDF-Dateien haben Inhalt");
  const seen = await page.evaluate(() => window.__seen);
  assert.equal(seen.length, 12);
  assert.ok(seen.every(([, d]) => d === info.date), "alle mit dem Test vom " + info.date + ": " + JSON.stringify(seen.filter(([, d]) => d !== info.date)));
  assert.equal(await page.evaluate(() => FORCE_KEY), null, "Umschaltung endet nach dem Export");
  assert.equal(await page.evaluate(() => { const p = findPlayer("Wende Sophie"); return evalIdx(p) !== p.defIdx; }), true, "Auswahl in der Einzelauswertung bleibt unverändert");
  assert.match(await page.textContent("#toast"), /12 Einzel-PDFs \(letzter Test 21\.04\.2026\) im Ordner „Testordner“ gespeichert\. 2 Personen ohne Test an diesem Tag ausgelassen\./);
  ok("12 PDFs im Ordner, 2 ausgelassen; auch „Wende Sophie“ mit ihrem Test vom letzten Tag; Auswahl der Einzelauswertung unberührt");

  console.log("3. „Einzel-PDFs in Ordner“ (alle Personen): jede mit dem in der Einzelauswertung gewählten Test");
  await page.evaluate(() => { window.__files = {}; window.__seen = []; });
  await page.click("button:has-text('Einzel-PDFs in Ordner')");
  await page.waitForFunction(() => Object.keys(window.__files).length === 14, null, { timeout: 60000 });
  assert.ok((await page.evaluate(() => Object.keys(window.__files))).some(f => /Alt_Person/.test(f)));
  const seenAll = await page.evaluate(() => window.__seen.find(([n]) => n === "Wende Sophie"));
  assert.equal(seenAll[1], "10.06.2025", "alle Personen: Wende Sophie mit ihrer eigenen Auswahl (früherer Test)");
  ok("alle 14 Personen, jede mit ihrem gewählten Test (wie im Sammel-PDF)");

  console.log("4. Kein Messwert am letzten Tag");
  await page.evaluate(() => { BASE_ROWS = BASE_ROWS.filter(r => r.name === "Leer Person"); rebuildTests(); render(); });
  await page.evaluate(() => { window.__files = {}; });
  await page.click("button:has-text('Einzel-PDFs letzter Test in Ordner')");
  assert.match(await page.textContent("#toast"), /keine Messwerte/);
  assert.equal(await page.evaluate(() => Object.keys(window.__files).length), 0);
  ok("nichts zu exportieren: Hinweis statt leerem Ordner");

  assert.deepEqual(errors, [], "Fehler im Browser:\n" + errors.join("\n"));
  ok("keine Fehler in der Browser-Konsole");
} finally { await browser.close(); }
console.log("\nLetzter Test: alles bestanden");
