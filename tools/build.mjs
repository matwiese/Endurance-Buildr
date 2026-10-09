#!/usr/bin/env node
/* Baut die fertige Einzeldatei: Segeln-Auswertung + Sprungspeicher/Parameter/VALD-Import.
   Aufruf: node tools/build.mjs   →   kaderauswertung_segeln_vald.html (im Hauptordner) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const MODULES = ["src/engine.js", "src/letterhead.js", "src/jump-core.js", "src/templates.js", "src/csv-import.js", "src/jump-store.js", "src/sync.js", "src/methods.js", "src/app.js", "src/tab-sprung.js", "src/tab-param.js", "src/tab-templates.js"];

function script(name, code) {
  if (/<\/script/i.test(code)) throw new Error(name + " enthält </script");
  return `<script>\n/* ---- ${name} ---- */\n${code.replace(/\s+$/, "")}\n</script>`;
}

let html = read("src/segeln-base.html");
const mark = (m) => { if (html.split(m).length !== 2) throw new Error("Platzhalter fehlt oder doppelt: " + m); };
mark("/*@KV_CSS@*/"); mark("<!--@KV_MODULES@-->");
html = html.replace("/*@KV_CSS@*/", () => read("src/jump-ui.css").trim());
const mods = MODULES.map(f => script(f, read(f))).concat(script("start", "KVApp.init();")).join("\n");
html = html.replace("<!--@KV_MODULES@-->", () => mods);
const out = path.join(root, "kaderauswertung_segeln_vald.html");
fs.writeFileSync(out, html);
console.log("geschrieben:", path.relative(root, out), (html.length / 1024).toFixed(0) + " KB");
