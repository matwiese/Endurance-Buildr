#!/usr/bin/env node
/* Test-Bridge: spricht dasselbe Protokoll wie die lokale VALD-Bridge (vald-bridge.mjs), liefert aber erfundene Sprünge.
   Zum Ausprobieren des VALD-Imports ohne VALD-Zugang und für die automatischen Tests. Es wird NICHTS mit VALD verbunden.

   Start:   node tools/mock-bridge.mjs [--port 8787]
   Dann:    kaderauswertung_segeln_vald.html öffnen → Tab „Sprungdaten“ → „Verbinden“.
   Die Seite wird unter http://127.0.0.1:8787/ auch direkt ausgeliefert.

   Endpunkte (wie in der App erwartet):
     GET /api/status                                           → {mock, region}
     GET /api/tenants                                          → {tenants:[{id,name}]}
     GET /api/groups?tenantId                                  → {groups:[{id,name}]}
     GET /api/profiles?tenantId[&groupId]                      → {profiles:[{id,name}]}
     GET /api/tests?tenantId&from&to[&groupId&profileId&testType=CMJ,SJ,SLJ]
                                                               → {tests:[{testId,profileId,athlete,testType,recordedDateUtc,recordedDateOffset,notes}]}
     GET /api/import?tenantId&testId&profileId&from            → {files:[{name,text}]}  (je Versuch eine ForceDecks-CSV) */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CMJ = new Function(fs.readFileSync(path.join(root, "src/engine.js"), "utf8") + ";return CMJ;")();

const port = +(process.argv[process.argv.indexOf("--port") + 1] || 8787) || 8787;
const ROSTER = [
  ["Sophie Wende", "kader"], ["Paul Luv", "kader"], ["Hannah Schot", "kader"], ["Felix Pinne", "kader"], ["Moritz Kiel", "kader"],
  ["Jakob Brise", "kader"], ["Marie Lee", "kader"], ["Laura Mast", "kader"], ["Lena Anker", "kader"],
  ["Jonas Segel", "nach"], ["Clara Heck", "nach"], ["Tobias Bug", "nach"], ["Gast Tester", "nach"]
];
const GROUPS = [{ id: "g-kader", key: "kader", name: "Segeln Kader" }, { id: "g-nach", key: "nach", name: "Nachwuchs" }];
const DATES = ["2026-01-20", "2026-04-21"];   /* Testtage; 21.04.2026 gibt es auch in den Beispieldaten der Auswertung */

const profiles = ROSTER.map(([name, grp], i) => ({ id: "P" + (i + 1), name, grp, idx: i }));
const tests = [];
profiles.forEach(p => DATES.forEach((d, di) => {
  if (di === 0 && p.idx % 3 === 0) return;               /* nicht alle waren im Januar dabei */
  const base = { profileId: p.id, athlete: p.name, recordedDateOffset: 120 };
  const t = (type, extra, min) => tests.push({ ...base, testId: `T-${p.id}-${d}-${type}${extra.tag}`, testType: type, notes: extra.note, recordedDateUtc: `${d}T0${6 + (p.idx % 3)}:${String(min).padStart(2, "0")}:00.000Z`, _d: d, _di: di, _side: extra.side });
  t("CMJ", { tag: "", note: "", side: null }, 5);
  t("SJ", { tag: "", note: "", side: null }, 12);
  t("SLJ", { tag: "-L", note: "links", side: "L" }, 20);
  t("SLJ", { tag: "-R", note: "rechts", side: "R" }, 26);
}));

function files(t) {
  const p = profiles.find(x => x.id === t.profileId), gl = (t._di ? 0.07 : 0) + p.idx * 0.025, files = [];
  const date = t._d.replace(/-/g, ".");
  for (let n = 1; n <= 3; n++) {
    const common = { athlete: t.athlete, date, trial: n, seed: p.idx * 7 + n + (t._di ? 40 : 0), mass: 62 + p.idx * 1.6 };
    let f, label;
    if (t.testType === "CMJ") { f = CMJ.synth({ ...common, v0: 2.1 + gl + n * 0.03, unw: 4.6 + (p.idx % 4) * 0.3, tP: 0.42 - (p.idx % 5) * 0.004 }); label = "CMJ"; }
    else if (t.testType === "SJ") { f = CMJ.synthSJ({ ...common, v0: 1.9 + gl + n * 0.02 }); label = "SJ"; }
    else { f = CMJ.synth({ ...common, single: t._side, v0: 1.75 + gl + (t._side === "R" ? 0.05 : 0) + n * 0.02, mass: common.mass }); label = "SLJ"; }
    let text = f.text.replace(/^Test,.*$/m, "Test," + label);
    if (t.testType === "SLJ") text = text.replace(/^Trial,.*$/m, `Trial,Trial ${n} (${t._side === "L" ? "Left" : "Right"})`);
    else text = text.replace(/^Trial,.*$/m, `Trial,Trial ${n}`);
    files.push({ name: `${t.athlete.replace(/ /g, "_")}-${label}${t._side ? "_" + t._side : ""}_${t._d.replace(/-/g, "_")}_Trial${n}.csv`, text });
  }
  return files;
}

function send(res, code, body, type) {
  res.writeHead(code, { "Content-Type": type || "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost"), q = u.searchParams;
  try {
    if (u.pathname === "/" || u.pathname === "/index.html") return send(res, 200, fs.readFileSync(path.join(root, "kaderauswertung_segeln_vald.html")), "text/html; charset=utf-8");
    if (u.pathname === "/api/status") return send(res, 200, { mock: true, region: "mock" });
    if (u.pathname === "/api/tenants") return send(res, 200, { tenants: [{ id: "mock-tenant", name: "Mock-Tenant (Testdaten)" }] });
    if (u.pathname === "/api/groups") return send(res, 200, { groups: GROUPS.map(({ id, name }) => ({ id, name })) });
    if (u.pathname === "/api/profiles") {
      const g = GROUPS.find(x => x.id === q.get("groupId"));
      return send(res, 200, { profiles: profiles.filter(p => !g || p.grp === g.key).map(({ id, name }) => ({ id, name })) });
    }
    if (u.pathname === "/api/tests") {
      const g = GROUPS.find(x => x.id === q.get("groupId")), types = (q.get("testType") || "").split(",").filter(Boolean), from = q.get("from") || "0000", to = q.get("to") || "9999";
      const list = tests.filter(t => (!g || profiles.find(p => p.id === t.profileId).grp === g.key) && (!q.get("profileId") || t.profileId === q.get("profileId")) &&
        (!types.length || types.includes(t.testType)) && t._d >= from && t._d <= to).map(({ _d, _di, _side, ...t }) => t);
      return send(res, 200, { tests: list });
    }
    if (u.pathname === "/api/import") {
      const t = tests.find(x => x.testId === q.get("testId"));
      if (!t) return send(res, 404, { error: "Test nicht gefunden: " + q.get("testId") });
      return send(res, 200, { files: files(t) });
    }
    send(res, 404, { error: "unbekannt" });
  } catch (e) { send(res, 500, { error: e.message }); }
}).listen(port, "127.0.0.1", () => console.log(`Test-Bridge läuft auf http://127.0.0.1:${port}/  (${profiles.length} Athlet:innen, ${tests.length} Tests, erfundene Daten)`));
