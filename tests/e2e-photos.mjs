/* Browser-Test: Fotos aus der Excel-Rohdatendatei kommen gleich in die Einzelauswertung (und ins PDF).
   Prüft drei echte Excel-Dateien (tests/fixtures, erzeugt mit tests/fixtures/make_fotos.py): schwebende Bilder in der Datenzeile,
   „Bild in Zelle“ und Bilder auf dem Blatt „Fotos“ – dazu Zuordnung nach Zeile, Neustart und Verhalten ohne Bilder.
   Aufruf: node tests/e2e-photos.mjs */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(fs.existsSync("/opt/node-tools/node_modules/playwright") ? "/opt/node-tools/node_modules/" : import.meta.url);
const { chromium } = req("playwright");
const ok = m => console.log("  ✓ " + m);
const libXlsx = process.env.XLSX_JS || "/tmp/claude-0/-home-user-Endurance-Buildr/d1dd4d56-5fc7-5581-8c98-2572a0be5451/scratchpad/libs/xlsx/package/dist/xlsx.full.min.js";
const libPdf = process.env.JSPDF_JS || "/tmp/claude-0/-home-user-Endurance-Buildr/d1dd4d56-5fc7-5581-8c98-2572a0be5451/scratchpad/libs/jspdf/package/dist/jspdf.umd.min.js";
if (!fs.existsSync(libXlsx)) { console.error("SheetJS fehlt (XLSX_JS) – dieser Test liest Excel-Dateien."); process.exit(2); }
const fx = n => path.join(root, "tests", "fixtures", n + ".xlsx");
const html = "file://" + path.join(root, "kaderauswertung_segeln_vald.html");
const WANT = { "Wende Sophie": [220, 40, 40], "Luv Paul": [40, 60, 220], "Schot Hannah": [40, 180, 60] };   /* Farben der Testbilder */

const errors = [];
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined });
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 }, acceptDownloads: true }), page = await ctx.newPage();
  page.on("pageerror", e => errors.push("PAGEERROR " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\.googleapis|net::ERR/.test(m.text())) errors.push("console: " + m.text()); });
  await page.route("**/xlsx.full.min.js", r => r.fulfill({ path: libXlsx, contentType: "text/javascript" }));
  if (fs.existsSync(libPdf)) await page.route("**/jspdf.umd.min.js", r => r.fulfill({ path: libPdf, contentType: "text/javascript" }));
  await page.goto(html); await page.waitForFunction(() => window.KVApp && KVApp.S.ready);
  return page;
};
/* Farbe jedes Fotos (Pixel nahe der Mitte der oberen Ecke) → die Testbilder sind einfarbig */
const colors = page => page.evaluate(async () => {
  const out = {};
  for (const n of Object.keys(FOTOS)) { const im = new Image(); im.src = FOTOS[n]; await im.decode(); const c = document.createElement("canvas"); c.width = c.height = 20; const g = c.getContext("2d"); g.drawImage(im, 0, 0, 20, 20); const d = g.getImageData(1, 1, 1, 1).data; out[n] = [d[0], d[1], d[2]]; }
  return out;
});
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 12);
const load = async (page, file) => { await page.setInputFiles("#fin", fx(file)); await page.waitForFunction(() => DEMO === false); await page.waitForFunction(() => Object.keys(FOTOS).length > 0, null, { timeout: 15000 }); };

try {
  for (const [file, what] of [["fotos_schwebend", "in Excel eingefügte (schwebende) Bilder in der Zeile der Person"], ["fotos_in_zelle", "„Bild in Zelle“"], ["fotos_blatt", "Bilder auf dem Blatt „Fotos“ neben dem Namen"]]) {
    console.log(`${file}: ${what}`);
    const page = await newPage();
    await load(page, file);
    const c = await colors(page);
    assert.deepEqual(Object.keys(c).sort(), Object.keys(WANT).sort(), "genau die drei Personen mit Foto: " + Object.keys(c));
    for (const [n, col] of Object.entries(WANT)) assert.ok(near(c[n], col), `${n}: erwartet ${col}, gelesen ${c[n]}`);
    assert.equal(await page.evaluate(() => players.length), 12, "alle 12 Athlet:innen geladen (Bilder stören das Einlesen der Tabelle nicht)");
    await page.waitForFunction(() => /3 Fotos aus der Excel-Datei übernommen/.test(document.getElementById("toast").textContent), null, { timeout: 8000 });
    ok("Fotos Sophie rot, Paul blau, Hannah grün richtig zugeordnet, die übrigen 9 ohne Foto");

    /* Einzelauswertung: Foto vorhanden bzw. Initialen */
    const hero = async n => { await page.evaluate(x => { pickName = x; setTab("einzel"); }, n); await page.waitForSelector("#single .hero"); return page.evaluate(() => { const i = document.querySelector("#single .hero img.big"); return { img: !!i, src: i ? i.src.slice(0, 22) : "", ph: !!document.querySelector("#single .hero .bigph") }; }); };
    const hs = await hero("Wende Sophie"), hp = await hero("Pinne Felix");
    assert.ok(hs.img && /^data:image\/jpeg/.test(hs.src) && !hs.ph, "Sophie: Foto im Kopf der Einzelauswertung: " + JSON.stringify(hs));
    assert.ok(!hp.img && hp.ph, "Pinne Felix ohne Foto: Initialen: " + JSON.stringify(hp));
    ok("Einzelauswertung zeigt das Foto sofort, ohne Foto die Initialen");

    /* PDF: Foto auf Seite 1 (ein Bild mehr als bei einer Person ohne Foto; das Netzdiagramm ist ebenfalls ein Bild) */
    if (file === "fotos_schwebend" && fs.existsSync(libPdf)) {
      const imgs = async n => { const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.evaluate(x => exportPdfByName(x), n)]); const p = path.join(root, "tests", "fixtures", "_t.pdf"); await dl.saveAs(p); const k = (fs.readFileSync(p).toString("latin1").match(/\/Subtype\s*\/Image/g) || []).length; fs.rmSync(p); return k; };
      const a = await imgs("Wende Sophie"), b = await imgs("Pinne Felix");
      assert.equal(a, b + 1, `PDF mit Foto hat ein Bild mehr (${a} statt ${b + 1})`);
      ok("PDF: Foto der Person steht auf Seite 1");
    }

    /* Neustart: Fotos sind aus dem Speicher wieder da */
    await page.waitForTimeout(800); await page.reload(); await page.waitForFunction(() => window.KVApp && KVApp.S.ready); await page.waitForFunction(() => players.length > 0);
    const c2 = await colors(page); assert.deepEqual(Object.keys(c2).sort(), Object.keys(WANT).sort(), "Fotos nach Neustart");
    ok("nach Neu-Laden sind die Fotos weiter da");
    await page.context().close();
  }

  console.log("Von Hand geladene Fotos gehen vor; Dateien ohne Bilder");
  {
    const page = await newPage();
    await page.evaluate(() => { PHOTOS["Wende Sophie"] = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="; });
    await page.setInputFiles("#fin", fx("fotos_schwebend")); await page.waitForFunction(() => DEMO === false);
    await page.waitForFunction(() => Object.keys(FOTOS).length === 2);
    assert.deepEqual((await page.evaluate(() => Object.keys(FOTOS))).sort(), ["Luv Paul", "Schot Hannah"], "für Sophie gibt es schon ein von Hand geladenes Foto: das Bild aus Excel überschreibt es nicht");
    ok("von Hand geladenes Foto bleibt, die übrigen kommen aus Excel");
    await page.evaluate(() => { delete PHOTOS["Wende Sophie"]; });
    await page.setInputFiles("#fin", fx("fotos_schwebend")); await page.waitForFunction(() => Object.keys(FOTOS).length === 3);
    const csv = await page.evaluate(() => DEMO_CSV); const cp = path.join(root, "tests", "fixtures", "_roh.csv"); fs.writeFileSync(cp, csv);
    await page.setInputFiles("#fin", cp); await page.waitForFunction(() => FILE === "_roh.csv"); fs.rmSync(cp);
    assert.equal(await page.evaluate(() => Object.keys(FOTOS).length), 0, "CSV ohne Bilder: keine Fotos, kein Fehler");
    ok("CSV (kann keine Bilder enthalten) lädt ohne Fotos und ohne Fehler");
    await page.context().close();
  }

  assert.deepEqual(errors, [], "Fehler im Browser:\n" + errors.join("\n"));
  console.log("\nALLES OK (Fotos aus Excel)");
} catch (e) {
  console.error("\nFEHLGESCHLAGEN:", e.message); if (errors.length) console.error("Browser-Fehler:\n" + errors.join("\n")); process.exitCode = 1;
} finally { await browser.close(); }
