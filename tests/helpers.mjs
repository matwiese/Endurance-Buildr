/* Lädt Engine + Kern in einen Node-Kontext (ohne Browser) und erzeugt synthetische Sprungdateien. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function loadCore() {
  /* bewusst ohne vm-Kontext: dort läuft die Engine ca. 20× langsamer */
  const src = ["src/engine.js", "src/jump-core.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n;\n");
  const { CMJ, KVCore } = new Function(src + "\n;return {CMJ:CMJ,KVCore:KVCore};")();
  return { CMJ, KV: KVCore };
}

/* Synthetische Sprünge im Dateiformat der Bridge (Kopfzeilen Test/Trial wie bei VALD) */
export function makeJump(CMJ, kind, o = {}) {
  const base = { athlete: o.athlete || "Test A", date: o.date || "2026.03.15", trial: o.trial || 1, seed: o.seed || 1 };
  let f;
  if (kind === "SJ") f = CMJ.synthSJ({ ...base, v0: o.v0 ?? 2.05 });
  else if (kind === "SL-L" || kind === "SL-R") f = CMJ.synth({ ...base, single: kind === "SL-L" ? "L" : "R", v0: o.v0 ?? 2.0, mass: o.mass ?? 78 });
  else f = CMJ.synth({ ...base, v0: o.v0 ?? 2.4 });
  let text = f.text;
  if (o.hint !== false) {
    if (kind === "SL-L") text = text.replace("Test,Countermovement Jump", "Test,SLJ").replace(/Trial,(\d+)/, "Trial,Trial $1 (Left)");
    if (kind === "SL-R") text = text.replace("Test,Countermovement Jump", "Test,SLJ").replace(/Trial,(\d+)/, "Trial,Trial $1 (Right)");
    if (kind === "SJ") text = text.replace("Test,Squat Jump", "Test,SJ");
    if (kind === "CMJ") text = text.replace("Test,Countermovement Jump", "Test,CMJ");
  } else text = text.replace(/^Test,.*\n/m, "");
  const name = `${base.athlete.replace(/ /g, "_")}-${kind}_${base.date.replace(/\./g, "_")}_Trial${base.trial}.csv`;
  return { name, text };
}
