/* Reiter „Bewertung“: HBL ist standardmäßig „niedriger ist besser“; je Test lässt sich höher / niedriger / ohne Wertung wählen,
   die Wahl wirkt sofort in Rang, z-Wert, Abweichung, Netzdiagramm und Übersicht, bleibt nach einem Neustart erhalten, ist in der Sicherung
   enthalten und lässt sich zurücksetzen.
   Aufruf: node tests/e2e-bewertung.mjs [Ordner für Screenshots] */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.argv[2] || "/tmp/kader-e2e-bew"; fs.mkdirSync(shots, { recursive: true });
const req = createRequire(fs.existsSync("/opt/node-tools/node_modules/playwright") ? "/opt/node-tools/node_modules/" : import.meta.url);
const { chromium } = req("playwright");
const ok = m => console.log("  ✓ " + m);
const errors = [];
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", e => errors.push("PAGEERROR " + e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\.googleapis|net::ERR/.test(m.text())) errors.push("console: " + m.text()); });
page.on("dialog", d => d.accept());
const url = "file://" + path.join(root, "kaderauswertung_segeln_vald.html");
const shot = n => page.screenshot({ path: path.join(shots, n + ".png"), fullPage: true });
const settle = () => page.waitForTimeout(450);   /* Auswertung baut sich verzögert (200 ms) neu auf */
const pick = (k, v) => page.locator(`#kvBew tr[data-k="${k}"] input[value="${v}"]`).check();
/* Farbe des Reglers in der Einzelauswertung (g = besser als der Schnitt, b = schwächer, n = neutral) bei der Person mit dem kleinsten Wert */
const devClass = k => page.evaluate(k => {
  const ps = players.filter(p => p.hasVal && p.val[k] != null).sort((a, b) => a.val[k] - b.val[k]);
  pickName = ps[0].name; setTab("einzel"); renderSingle();
  const l = Array.from(document.querySelectorAll("#single .mline")).find(x => x.title.startsWith(MET[k].t + ":"));
  const c = l ? l.querySelector(".dev").className.replace("dev", "").trim() : null; setTab("bewertung"); return c;
}, k);
/* Kenngrößen eines Tests: beste/schlechteste Person nach Rohwert, Rang des kleinsten Werts, Achse im Netzdiagramm, z-Wert */
const probe = k => page.evaluate(k => {
  const ps = players.filter(p => p.hasVal && p.val[k] != null).sort((a, b) => a.val[k] - b.val[k]);
  const lo = ps[0], hi = ps[ps.length - 1];
  return { dir: MET[k].dir, dir0: MET[k].dir0, n: ps.length, rankLo: rankOf(lo, k).r, rankHi: rankOf(hi, k).r, fracLo: spFrac(k, lo.val[k]), fracHi: spFrac(k, hi.val[k]),
    zLo: zOf(lo, k, "team"), betterLo: devOf(lo, k, "team").better, axis: spiderAxes().includes(k), ovLow: ovDelta(MET[k], hi.val[k], lo.val[k]).c };
}, k);

try {
  console.log("1. Voreinstellung: HBL = niedriger ist besser");
  await page.goto(url);
  await page.waitForFunction(() => window.KVApp && KVApp.S.ready);
  let h = await probe("hbl");
  assert.equal(h.dir, -1, "HBL ist eine Zeit: niedriger = besser");
  assert.equal(h.rankLo, 1, "kleinster HBL-Wert = Rang 1");
  assert.equal(h.rankHi, h.n, "größter HBL-Wert = letzter Rang");
  assert.equal(h.fracLo, 1, "im Netzdiagramm liegt die kleinste Zeit außen");
  assert.equal(h.fracHi, 0);
  assert.ok(h.zLo > 0 && h.betterLo === true, "schnellste Zeit ist besser als der Schnitt (z > 0, grün)");
  assert.equal(h.ovLow, "g", "kürzere Zeit gegenüber dem Vorwert ist grün");
  assert.equal(await devClass("hbl"), "g", "Einzelauswertung: schnellste HBL-Zeit liegt grün über dem Schnitt");
  ok("HBL: Rang 1 = kleinste Zeit, Netzdiagramm außen = kleinste Zeit, grün bei kürzerer Zeit (auch im Regler der Einzelauswertung)");

  console.log("2. Reiter „Bewertung“: alle Tests, Voreinstellung markiert");
  await page.click("#tabBewertung");
  await page.waitForSelector("#kvBew tr[data-k]");
  const info = await page.evaluate(() => ({ rows: document.querySelectorAll("#kvBew tr[data-k]").length, metrics: METRICS.length, groups: Array.from(document.querySelectorAll("#kvBew tr.grp td")).map(t => t.textContent), note: document.getElementById("kvBewNote").textContent, tabSel: document.getElementById("tabBewertung").getAttribute("aria-selected") }));
  assert.equal(info.rows, info.metrics, "jeder Test steht in der Liste");
  assert.ok(info.groups.includes("Schnelligkeit") && info.groups.includes("Movement Screen") && info.groups.includes("Oberkörper"), info.groups.join("|"));
  assert.equal(info.tabSel, "true");
  assert.match(info.note, /alle in der Voreinstellung/);
  assert.equal(await page.locator('#kvBew tr[data-k="hbl"] input:checked').getAttribute("value"), "-1", "HBL: niedriger ist besser angehakt");
  assert.equal(await page.locator('#kvBew tr[data-k="cmj"] input:checked').getAttribute("value"), "1");
  assert.equal(await page.locator('#kvBew tr[data-k="gew"] input:checked').getAttribute("value"), "0", "Körpermasse ohne Wertung");
  assert.equal(await page.locator("#kvBew tr.chg").count(), 0);
  assert.equal(await page.locator('#kvBewReset').isDisabled(), true, "nichts zum Zurücksetzen");
  await shot("01_bewertung");
  ok(`${info.rows} Tests in ${info.groups.length} Gruppen, HBL „niedriger ist besser“ voreingestellt`);

  console.log("3. Tapping auf „niedriger ist besser“: Rang, z-Wert, Farbe und Netzdiagramm drehen sich");
  const t0 = await probe("tap");
  assert.equal(t0.dir, 1); assert.equal(t0.rankHi, 1); assert.equal(t0.fracHi, 1); assert.ok(t0.axis, "Tapping ist eine Standardachse");
  await pick("tap", -1); await settle();
  const t1 = await probe("tap");
  assert.equal(t1.dir, -1);
  assert.equal(t1.rankLo, 1, "kleinster Wert ist jetzt Rang 1"); assert.equal(t1.rankHi, t1.n);
  assert.equal(t1.fracLo, 1); assert.equal(t1.fracHi, 0);
  assert.ok(t1.zLo > 0 && t1.betterLo === true);
  assert.equal(t1.ovLow, "g");
  assert.ok(await page.locator('#kvBew tr[data-k="tap"]').evaluate(r => r.classList.contains("chg")), "geänderte Zeile ist markiert");
  assert.equal(await page.locator('#kvBew tr[data-k="tap"] .kv-rs button').isVisible(), true);
  assert.match(await page.textContent("#kvBewNote"), /1 abweichend/);
  assert.equal(await page.locator('#kvBewReset').isDisabled(), false);
  ok("Tapping: Rang, z-Wert, Abweichung, Netzdiagramm und Übersicht folgen der Wahl");
  assert.equal(await devClass("tap"), "g", "Einzelauswertung: kleinster Tapping-Wert ist jetzt grün (besser als der Schnitt)");

  console.log("4. „ohne Wertung“ nimmt den Test aus Rang, Farbe und Netzdiagramm");
  await pick("tap", 0); await settle();
  const t2 = await probe("tap");
  assert.equal(t2.dir, 0); assert.equal(t2.axis, false, "Achse entfällt im Netzdiagramm");
  assert.equal(await page.evaluate(() => rankTag(players.find(p => p.val.tap != null), MET.tap)), "");
  assert.equal(t2.ovLow, "n");
  ok("ohne Wertung: kein Rang, neutrale Farbe, keine Achse");

  console.log("5. HBL auf „höher ist besser“ stellen (Gegenprobe)");
  await pick("hbl", 1); await settle();
  h = await probe("hbl");
  assert.equal(h.dir, 1); assert.equal(h.rankHi, 1); assert.equal(h.fracHi, 1); assert.equal(h.fracLo, 0);
  assert.equal(h.ovLow, "b", "kürzere Zeit ist dann schlechter");
  assert.equal(await devClass("hbl"), "b", "Regler der Einzelauswertung wird gelb/schwächer");
  ok("HBL höher = besser: alles dreht sich um");

  console.log("6. Suche und „nur geänderte“");
  await page.fill('#kvBew input[type=search]', "hürde");
  assert.equal(await page.locator("#kvBew tr[data-k]").count(), 0, "„Hürde“ kommt in den Bezeichnungen nicht vor");
  await page.fill('#kvBew input[type=search]', "hbl");
  assert.deepEqual(await page.$$eval("#kvBew tr[data-k]", e => e.map(r => r.dataset.k)), ["hbl", "hblH"]);
  await page.fill('#kvBew input[type=search]', "");
  await page.check("#kvBewOnly");
  assert.deepEqual((await page.$$eval("#kvBew tr[data-k]", e => e.map(r => r.dataset.k))).sort(), ["hbl", "tap"]);
  await page.uncheck("#kvBewOnly");
  ok("Suche über Bezeichnung/Gruppe; Filter zeigt nur die geänderten Tests");

  console.log("7. Neustart: Wahl bleibt erhalten, Sicherung enthält sie");
  const saved = await page.evaluate(() => JSON.stringify(KVStore.kvGet("dirs")));
  assert.equal(saved, JSON.stringify({ tap: 0, hbl: 1 }));
  const backup = await page.evaluate(async () => { const b = await KVStore.exportBlob(false); return JSON.parse(await b.text()).kv.dirs; });
  assert.deepEqual(backup, { tap: 0, hbl: 1 }, "Sicherung enthält die Wertungen");
  await page.reload(); await page.waitForFunction(() => window.KVApp && KVApp.S.ready);
  await page.evaluate(() => setTab("bewertung")); await page.waitForSelector("#kvBew tr[data-k]");
  h = await probe("hbl"); const t3 = await probe("tap");
  assert.equal(h.dir, 1); assert.equal(h.dir0, -1); assert.equal(t3.dir, 0);
  assert.equal(await page.locator('#kvBew tr[data-k="hbl"] input:checked').getAttribute("value"), "1");
  assert.equal(await page.locator("#kvBew tr.chg").count(), 2);
  ok("nach dem Neustart: HBL höher = besser, Tapping ohne Wertung");

  console.log("8. Eine Wahl zurücknehmen, dann alles zurücksetzen");
  await page.locator('#kvBew tr[data-k="hbl"] .kv-rs button').click(); await settle();
  assert.equal((await probe("hbl")).dir, -1);
  assert.equal(await page.evaluate(() => JSON.stringify(KVStore.kvGet("dirs"))), JSON.stringify({ tap: 0 }));
  await pick("tap", -1); await settle();
  await page.click("#kvBewReset"); await settle();
  assert.equal(await page.evaluate(() => KVApp.dirsChanged()), 0);
  assert.equal((await probe("tap")).dir, 1); assert.equal((await probe("hbl")).dir, -1);
  assert.equal(await page.locator("#kvBew tr.chg").count(), 0);
  assert.equal(await page.evaluate(() => KVStore.kvGet("dirs", "leer")), "leer", "Speicherschlüssel entfernt");
  ok("einzeln zurücknehmen und „Alle auf Voreinstellung“");

  console.log("9. Eigener Parameter (CSV): Wahl wirkt, die Definition bleibt unverändert");
  const csv = "Name;Testdatum;Sprint 10 m [s]\nWende Sophie;21.04.2026;1,85\nLuv Paul;21.04.2026;1,79\nSegel Jonas;21.04.2026;2,05\n";
  const csvPath = path.join(shots, "zusatz.csv"); fs.writeFileSync(csvPath, csv);
  await page.evaluate(() => setTab("templates"));
  await page.setInputFiles("#kvImp input[type=file]", csvPath); await page.waitForSelector("#kvImp .kv-wiz");
  await page.locator("#kvImp .kv-wiz tbody tr:has-text('Sprint 10 m') select").nth(1).selectOption("-1");
  await page.locator("#kvImp label:has-text('in die geöffnete Vorlage') input").uncheck();
  await page.click("#kvImp button:has-text('Importieren')");
  await page.waitForFunction(() => KVApp.S.imports.length === 1);
  await page.evaluate(() => setTab("bewertung")); await page.waitForSelector('#kvBew tr[data-k="c_sprint_10_m"]');
  assert.equal(await page.locator('#kvBew tr[data-k="c_sprint_10_m"] td.u').first().textContent(), "CSV-Import");
  assert.equal(await page.locator('#kvBew tr[data-k="c_sprint_10_m"] input:checked').getAttribute("value"), "-1");
  await pick("c_sprint_10_m", 1); await settle();
  const c1 = await page.evaluate(() => ({ met: MET.c_sprint_10_m.dir, def: KVApp.S.custom[0].dir, p: rankOf(findPlayer("Luv Paul"), "c_sprint_10_m") }));
  assert.equal(c1.met, 1); assert.equal(c1.def, -1, "die gespeicherte Definition bleibt unverändert"); assert.equal(c1.p.r, 3, "kleinster Wert (Luv Paul) ist jetzt letzter");
  /* nach Neustart weiterhin angewendet */
  await page.reload(); await page.waitForFunction(() => window.KVApp && KVApp.S.ready);
  await page.waitForFunction(() => MET.c_sprint_10_m);
  assert.equal(await page.evaluate(() => MET.c_sprint_10_m.dir), 1, "Wahl überlebt den Neustart");
  /* Änderung in der Tabelle „Eigene Parameter“ nimmt die Wahl zurück */
  await page.evaluate(() => setTab("templates")); await page.waitForSelector("#kvImp select[aria-label=Wertung]");
  await page.locator("#kvImp select[aria-label=Wertung]").selectOption("-1"); await settle();
  assert.equal(await page.evaluate(() => MET.c_sprint_10_m.dir), -1);
  assert.equal(await page.evaluate(() => KVApp.dirsChanged()), 0);
  ok("Wertung eines eigenen Parameters: Wahl wirkt, Definition bleibt, Neustart ok, Änderung bei „Eigene Parameter“ ersetzt sie");

  console.log("10. Sicherung wiederherstellen und Speicher leeren");
  await page.evaluate(() => setTab("bewertung")); await page.waitForSelector("#kvBew tr[data-k]");
  await pick("liege", -1); await settle();
  const blob = await page.evaluate(async () => { const b = await KVStore.exportBlob(false); return await b.text(); });
  const bf = path.join(shots, "sicherung.json"); fs.writeFileSync(bf, blob);
  await page.evaluate(async () => { await KVApp.wipe(); KVApp.refresh(true); });
  await settle();
  assert.equal(await page.evaluate(() => MET.liege.dir), 1, "nach „Rohdaten/Speicher leeren“ gilt die Voreinstellung");
  await page.evaluate(async (t) => { await KVStore.importObject(JSON.parse(t)); KVApp.afterRestore(); KVApp.refresh(true); }, blob);
  await settle();
  assert.equal(await page.evaluate(() => MET.liege.dir), -1, "Wiederherstellung bringt die Wertung zurück");
  ok("Speicher leeren setzt zurück, Wiederherstellen bringt die Wahl zurück");

  assert.deepEqual(errors, [], "Fehler im Browser:\n" + errors.join("\n"));
  ok("keine Fehler in der Browser-Konsole");
} finally { await browser.close(); }
console.log("\nBewertung: alles bestanden");
