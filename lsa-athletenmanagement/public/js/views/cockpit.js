// Rollenspezifische Cockpits (Startseite)
import { esc, fmt, fmtS, wd, pct, dayDiff, TODAY } from '../util.js';
import { head, kpi } from '../ui.js';
import { state } from '../state.js';
import { cockpits } from './start.js';
import { getCore, completeness, loadChange, weekLoad, openMeasures, planComplete, readinessToday, upcoming } from '../calc.js';
import { alertList } from './hinweise.js';
import { termineHtml } from './termine.js';

const cat = () => state.meta.catalog;
const nameOf = (core, id) => core.athletes.find((a) => a.id === id)?.name || id;
const alertsWithNames = (core) => core.alerts.map((a) => ({ ...a, athleteName: nameOf(core, a.athleteId) }));
const link = (id, tab) => `data-act="nav" data-to="athleten" data-arg="${esc(id)}${tab ? '/' + tab : ''}"`;
const lowItems = (e) => (e ? cat().readinessItems.filter(([k]) => e[k] != null && e[k] <= 2).map(([k, l]) => `${l} ${e[k]}`) : null);

// Beschreibt die Messung der Tagesform in einer Zeile für Trainer-Tabellen
function readinessCell(e) {
  if (!e) return '<span class="muted">noch nicht ausgefüllt</span>';
  const low = lowItems(e);
  return `${e.pain ? '<span class="pill tag-health">Schmerz gemeldet</span> ' : ''}${e.symptoms ? '<span class="pill tag-health">Symptome</span> ' : ''}${low.length ? esc(low.join(', ')) : (e.pain || e.symptoms ? '' : '<span class="ok">unauffällig</span>')}`;
}

function trainerCockpit(core, s) {
  const sc = core.athletes.filter((a) => a.status !== 'ausgetreten' && a.levels.monitoring === 'full');
  const al = core.alerts;
  return head(`Guten Tag, ${esc(s.user.displayName)}`, `Cockpit ${esc(s.user.roleLabel)} · ${fmt(core.today)}`)
    + `<div class="grid g4">${kpi(sc.length, 'Athlet:innen in der Gruppe')}${kpi(sc.filter((a) => readinessToday(core, a.id)).length + ' / ' + sc.length, 'Tages-Check heute ausgefüllt')}${kpi(al.length, 'offene Hinweise')}${kpi(sc.reduce((n, a) => n + openMeasures(core, a.id).length, 0), 'offene Maßnahmen')}</div>`
    + `<div class="panel" style="margin-top:14px"><h3>Trainingsgruppe heute</h3>${sc.length ? `<div class="scroll"><table><tr><th>Athlet:in</th><th>Tagesform heute (auffällige Werte)</th><th>Einheiten heute</th><th>Offene Maßnahmen</th></tr>
      ${sc.map((a) => { const t = core.sessions.filter((x) => x.aid === a.id && x.date === core.today); return `<tr class="click" ${link(a.id)}><td><b>${esc(a.name)}</b><div class="small muted">${esc(a.discipline)}</div></td><td class="small">${readinessCell(readinessToday(core, a.id))}</td>
        <td class="small">${t.length ? t.map((x) => `${esc(x.title)} <span class="pill">${esc(x.status)}</span>`).join('<br>') : '<span class="muted">–</span>'}</td><td>${openMeasures(core, a.id).length}</td></tr>`; }).join('')}</table></div>` : '<p class="muted">Noch keine Athlet:innen in Ihrem Bereich. Die Koordination ordnet Sie einer Akte zu oder legt Ihre Sportart im Athletenbereich fest.</p>'}</div>`
    + `<div class="grid g2" style="margin-top:14px"><div class="panel"><h3>Termine der nächsten 14 Tage</h3>${termineHtml(core)}</div><div class="panel"><h3>Hinweise</h3>${alertList(alertsWithNames(core).slice(0, 5), { compact: true })}</div></div>`;
}

function koordCockpit(core, s) {
  const sc = core.athletes;
  const due = sc.flatMap((a) => openMeasures(core, a.id).filter((m) => m.review && dayDiff(m.review, core.today) <= 7).map((m) => ({ a, m }))).sort((x, y) => x.m.review.localeCompare(y.m.review));
  const complete = sc.filter((a) => a.status !== 'ausgetreten' && planComplete(core.plans[a.id])).length;
  const act = sc.filter((a) => a.status !== 'ausgetreten');
  return head(`Guten Tag, ${esc(s.user.displayName)}`, `Cockpit ${esc(s.user.roleLabel)} · ${fmt(core.today)}`)
    + `<div class="grid g4">${kpi(act.filter((a) => a.status === 'aktiv').length, 'aktive Athlet:innen in der Betreuung', 'Ziel: 40–50 je Koordinator:in')}${kpi(core.alerts.length, 'offene Hinweise')}${kpi(due.length, 'Maßnahmen mit Prüftermin ≤ 7 Tage')}${kpi(pct(act.length ? complete / act.length : null), 'vollständige Entwicklungspläne', 'Ziel > 95 %')}</div>`
    + `<div class="grid g2" style="margin-top:14px"><div class="panel"><h3>Fällige Wirkungskontrollen</h3>${due.length ? `<table><tr><th>Athlet:in</th><th>Maßnahme</th><th>Prüftermin</th></tr>${due.map(({ a, m }) => `<tr class="click" ${link(a.id, 'plan')}><td>${esc(a.name)}</td><td>${esc(m.text)}</td><td>${fmt(m.review)}${dayDiff(m.review, core.today) < 0 ? ' <span class="bad">überfällig</span>' : ''}</td></tr>`).join('')}</table>` : '<p class="muted">Keine fälligen Kontrollen.</p>'}</div>
      <div class="panel"><h3>Offene Hinweise</h3>${alertList(alertsWithNames(core).slice(0, 6), { compact: true })}</div></div>`
    + `<div class="panel" style="margin-top:14px"><h3>Entwicklungspläne mit Lücken</h3>${act.filter((a) => !planComplete(core.plans[a.id])).map((a) => `<button class="btn sm" ${link(a.id, 'plan')}>${esc(a.name)}</button>`).join(' ') || '<p class="muted">Alle Pläne vollständig.</p>'}</div>`
    + `<div class="panel" style="margin-top:14px"><h3>Termine der nächsten 14 Tage</h3>${termineHtml(core)}</div>`;
}

function sportwissCockpit(core, s) {
  const sc = core.athletes.filter((a) => a.status !== 'ausgetreten' && a.levels.monitoring !== 'none' && a.levels.monitoring !== 'wellbeing');
  return head(`Guten Tag, ${esc(s.user.displayName)}`, `Cockpit ${esc(s.user.roleLabel)} · ${fmt(core.today)}`)
    + `<div class="panel"><h3>Belastung: diese Woche gegenüber Vorwoche</h3><p class="small muted">Summe aus Dauer × Session-RPE. Transparente Einzelwerte statt eines Gesamtscores. Über +30 % entsteht ein Prüfauftrag.</p>
      <div class="scroll"><table><tr><th>Athlet:in</th><th>Vorwoche</th><th>Diese Woche</th><th>Veränderung</th></tr>
      ${sc.map((a) => { const w0 = weekLoad(core, a.id, 0), w1 = weekLoad(core, a.id, 1), c = loadChange(core, a.id); return `<tr class="click" ${link(a.id, 'monitoring')}><td>${esc(a.name)}</td><td>${w1} AU</td><td>${w0} AU</td><td class="${c > 0.3 ? 'bad' : c < -0.3 ? 'warn' : ''}">${c == null ? '–' : (c > 0 ? '+' : '') + Math.round(c * 100) + ' %'}</td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">Keine Daten.</td></tr>'}</table></div></div>
    <div class="grid g2" style="margin-top:14px"><div class="panel"><h3>Geplante Tests</h3>${termineHtml(core, { types: ['Test'] })}</div><div class="panel"><h3>Hinweise</h3>${alertList(alertsWithNames(core).slice(0, 6), { compact: true })}</div></div>`;
}

// Fachrollen mit eigenen Inhalten in Phase 4 (Medizin, Psychologie, Schule): hier zunächst Hinweise und Termine
function genericCockpit(core, s) {
  return head(`Guten Tag, ${esc(s.user.displayName)}`, `Cockpit ${esc(s.user.roleLabel)} · ${fmt(core.today)}`)
    + `<div class="grid g3">${kpi(core.athletes.length, 'Athlet:innen in Ihrem Bereich')}${kpi(core.alerts.length, 'offene Hinweise für Ihre Rolle')}${kpi(core.events.filter((e) => dayDiff(e.date, core.today) <= 14).length, 'Termine in 14 Tagen')}</div>`
    + `<div class="grid g2" style="margin-top:14px"><div class="panel"><h3>Hinweise</h3>${alertList(alertsWithNames(core).slice(0, 6), { compact: true })}</div><div class="panel"><h3>Termine der nächsten 14 Tage</h3>${termineHtml(core)}</div></div>`;
}

function athleteCockpit(core, s) {
  const a = core.athletes[0];
  if (!a) return head(`Hallo ${esc(s.user.displayName)}`, 'Dir ist noch keine Akte zugeordnet.');
  const e = readinessToday(core, a.id), plan = core.plans[a.id];
  const first = a.name.split(' ')[0];
  const next = upcoming(core, a.id, 6);
  const events = core.events.filter((ev) => dayDiff(ev.date, core.today) >= 0 && dayDiff(ev.date, core.today) <= 14);
  return head(`Hallo ${esc(first)}`, `Dein Überblick für heute, ${fmt(core.today)}.`, e ? '<span class="pill ok-pill">✓ Tages-Check erledigt</span>' : '<button class="btn signal" data-act="nav" data-to="check">Tages-Check ausfüllen</button>')
    + `<div class="grid g2"><div class="panel"><h3>Diese Woche</h3>${next.length || events.length ? `<table>${next.map((x) => `<tr><td>${wd(x.date)} ${fmtS(x.date)}</td><td>${esc(x.title)}</td></tr>`).join('')}${events.map((ev) => `<tr><td>${wd(ev.date)} ${fmtS(ev.date)}</td><td><b>${esc(ev.title)}</b> (${esc(ev.type)})</td></tr>`).join('')}</table>` : '<p class="muted">Keine Einheiten oder Termine eingetragen.</p>'}</div>
      <div class="panel"><h3>Meine Ansprechpersonen</h3><dl class="kv">${a.team.map((t) => `<dt>${esc(t.function)}</dt><dd>${esc(t.name)}</dd>`).join('') || '<dt>Team</dt><dd class="muted">noch niemand zugeordnet</dd>'}</dl>
      <div class="note" style="margin-bottom:0">Ehrliche Angaben führen nicht zu Nachteilen bei Kader oder Nominierung. Sie helfen, dein Training passend zu steuern.</div></div></div>
      <div class="panel" style="margin-top:14px"><h3>Meine Ziele und Maßnahmen</h3>${plan && plan.goals.length ? plan.goals.map((g) => `<div style="margin-bottom:8px"><b>${esc(g.text)}</b> <span class="small muted">${esc(g.area)}</span><div class="small">${plan.measures.filter((m) => m.goal === g.id).map((m) => esc(m.text) + ' · Prüfung ' + fmtS(m.review)).join('<br>')}</div></div>`).join('') : '<p class="muted">Dein Entwicklungsplan ist noch in Arbeit.</p>'}</div>`;
}

cockpits.push({
  match: (s) => s.user.role !== 'admin' && s.permissions.tabs.overview !== 'none',
  async render(s) {
    const core = await getCore();
    const r = s.user.role;
    if (r === 'athlet') return athleteCockpit(core, s);
    if (r === 'trainer') return trainerCockpit(core, s);
    if (r === 'koordinator') return koordCockpit(core, s);
    if (r === 'sportwiss') return sportwissCockpit(core, s);
    return genericCockpit(core, s);
  },
});
