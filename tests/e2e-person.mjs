/* Gemeinsame Person: „Entwicklung“ und „Erweiterte Übersicht“ zeigen die in der Einzelauswertung gewählte Person.
   Aufruf: node tests/e2e-person.mjs */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(fs.existsSync("/opt/node-tools/node_modules/playwright") ? "/opt/node-tools/node_modules/" : import.meta.url);
const { chromium } = req("playwright");
const ok = m => console.log("  ✓ " + m);
const errors = [];
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined });
const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
page.on("pageerror", e => errors.push("PAGEERROR " + e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\.googleapis|net::ERR/.test(m.text())) errors.push("console: " + m.text()); });
const val = sel => page.$eval(sel, e => e.value);
const go = t => page.click("#tab" + t);
const title = sel => page.$eval(sel, e => e.textContent);

try {
  await page.goto("file://" + path.join(root, "kaderauswertung_segeln_vald.html"));
  await page.waitForFunction(() => window.KVApp && KVApp.S.ready && players.length === 12);

  console.log("1. Ohne Wahl in der Einzelauswertung bleibt alles wie bisher");
  await go("Entwicklung"); assert.equal(await val("#entWho"), "__multi__", "Entwicklung zeigt zunächst den Vergleich aller");
  await go("Uebersicht"); const ov0 = await val("#ovWho");
  assert.equal(ov0, await page.evaluate(() => players[0].name));
  ok("Entwicklung: „Alle mit mehreren Durchgängen“, Übersicht: erste Person");

  console.log("2. Person in der Einzelauswertung wählen → Entwicklung und Übersicht übernehmen sie");
  await go("Einzel"); await page.selectOption("#pick", "Luv Paul");
  await go("Entwicklung");
  assert.equal(await val("#entWho"), "Luv Paul");
  assert.match(await page.textContent("#entwicklung"), /Luv Paul/);
  await go("Uebersicht"); assert.equal(await val("#ovWho"), "Luv Paul");
  assert.match(await page.textContent("#overview, #ov, #viewUebersicht"), /Luv Paul/);
  ok("Luv Paul in beiden Reitern");

  console.log("3. „Weiter“ in der Einzelauswertung wechselt die Person überall");
  await go("Einzel"); await page.click('button[onclick="stepPick(1)"]');
  const next = await val("#pick");
  assert.notEqual(next, "Luv Paul");
  await go("Entwicklung"); assert.equal(await val("#entWho"), next);
  await go("Uebersicht"); assert.equal(await val("#ovWho"), next);
  ok("nächste Person: " + next);

  console.log("4. Von Hand gewählt bleibt bestehen, solange die Einzelauswertung nicht wechselt");
  await go("Entwicklung"); await page.selectOption("#entWho", "__multi__");
  await go("Einzel"); await go("Entwicklung"); assert.equal(await val("#entWho"), "__multi__", "Vergleich bleibt");
  await page.selectOption("#entWho", "Pinne Felix");
  await go("Uebersicht"); await go("Entwicklung"); assert.equal(await val("#entWho"), "Pinne Felix");
  await go("Einzel"); assert.equal(await val("#pick"), next, "die Einzelauswertung bleibt bei ihrer Person");
  await go("Einzel"); await page.selectOption("#pick", "Kiel Moritz");
  await go("Entwicklung"); assert.equal(await val("#entWho"), "Kiel Moritz");
  ok("Handwahl bleibt bis zur nächsten Wahl in der Einzelauswertung");

  console.log("5. Neues Rohdatenblatt: zurück auf Standard");
  await page.evaluate(() => { syncReset(); devWho = ""; ovWho = ""; render(); });
  await go("Einzel"); await go("Entwicklung"); assert.equal(await val("#entWho"), "__multi__");
  ok("zurückgesetzt");

  assert.deepEqual(errors, [], "Fehler im Browser:\n" + errors.join("\n"));
  ok("keine Fehler in der Browser-Konsole");
} finally { await browser.close(); }
console.log("\nGemeinsame Person: alles bestanden");
