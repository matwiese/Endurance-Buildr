// Rollenspezifische Cockpits (Startseite)
import { esc, fmt, fmtS, wd, pct, dayDiff } from '../util.js';
import { get, post } from '../api.js';
import { actions, head, kpi, toast } from '../ui.js';
import { state } from '../state.js';
import { cockpits } from './start.js';
import { getCore, loadChange, weekLoad, openMeasures, planComplete, readinessToday, upcoming } from '../calc.js';
import { alertList } from './hinweise.js';
import { termineHtml } from './termine.js';
import { ampel, statusCard, rtpStepper } from './athlete-common.js';

const cat = () => state.meta.catalog;
const nameOf = (core, id) => core.athletes.find((a) => a.id === id)?.name || id;
const alertsWithNames = (core) => core.alerts.map((a) => ({ ...a, athleteName: nameOf(core, a.athleteId) }));
const link = (id, tab) => `data-act="nav" data-to="athleten" data-arg="${esc(id)}${tab ? '/' + tab : ''}"`;
const greet = (core, s) => head(`Guten Tag, ${esc(s.user.displayName)}`, `Cockpit ${esc(s.user.roleLabel)} · ${fmt(core.today)}`);
const lowItems = (e) => (e ? cat().readinessItems.filter(([k]) => e[k] != null && e[k] <= 2).map(([k, l]) => `${l} ${e[k]}`) : null);

function readinessCell(e) {
  if (!e) return '<span class="muted">noch nicht ausgefüllt</span>';
  const low = lowItems(e);
  return `${e.pain ? '<span class="pill tag-health">Schmerz gemeldet</span> ' : ''}${e.symptoms ? '<span class="pill tag-health">Symptome</span> ' : ''}${low.length ? esc(low.join(', ')) : (e.pain || e.symptoms ? '' : '<span class="ok">unauffällig</span>')}`;
}
const termineMitPruefungen = (core) => {
  const ex = (core.exams || []).filter((x) => dayDiff(x.date, core.today) >= 0 && dayDiff(x.date, core.today) <= 14);
  return termineHtml(core) + (ex.length ? `<h4 style="margin:10px 0 4px">Schulische Prüfungen</h4><table>${ex.map((x) => `<tr><td style="width:90px">${wd(x.date)} ${fmtS(x.date)}</td><td>${esc(nameOf(core, x.aid))}: ${esc(x.subject)}</td></tr>`).join('')}</table>` : '');
};

function trainerCockpit(core, s) {
  const sc = core.athletes.filter((a) => a.status !== 'ausgetreten' && a.levels.monitoring === 'full');
  const restricted = sc.filter((a) => core.status[a.id] && core.status[a.id].color !== 'gruen');
  return greet(core, s)
    + `<div class="grid g4">${kpi(sc.length, 'Athlet:innen in der Gruppe')}${kpi(restricted.length, 'mit Einschränkung', 'Details nur als Status')}${kpi(sc.filter((a) => readinessToday(core, a.id)).length + ' / ' + sc.length, 'Tages-Check heute ausgefüllt')}${kpi(core.alerts.length, 'offene Hinweise')}</div>`
    + `<div class="panel" style="margin-top:14px"><h3>Trainingsgruppe heute</h3>${sc.length ? `<div class="scroll"><table><tr><th>Athlet:in</th><th>Belastungsstatus</th><th>Einschränkung</th><th>Tagesform heute (auffällige Werte)</th><th>Einheiten heute</th><th>Freigegebene Hinweise</th><th>Offene Maßnahmen</th></tr>
      ${sc.map((a) => { const st = core.status[a.id], t = core.sessions.filter((x) => x.aid === a.id && x.date === core.today); return `<tr class="click" ${link(a.id)}><td><b>${esc(a.name)}</b><div class="small muted">${esc(a.discipline)}</div></td>
        <td>${st ? ampel(st.color) : '–'}</td><td class="small">${st && st.color !== 'gruen' ? esc(st.restricted) + (st.next ? `<div class="muted">Kontrolle ${fmtS(st.next)}</div>` : '') : '–'}</td>
        <td class="small">${readinessCell(readinessToday(core, a.id))}</td>
        <td class="small">${t.length ? t.map((x) => `${esc(x.title)} <span class="pill">${esc(x.status)}</span>`).join('<br>') : '<span class="muted">–</span>'}</td>
        <td class="small">${(core.released[a.id] || []).map((h) => esc(h.text)).join('<br>') || '–'}</td><td>${openMeasures(core, a.id).length}</td></tr>`; }).join('')}</table></div>` : '<p class="muted">Noch keine Athlet:innen in Ihrem Bereich. Die Koordination ordnet Sie einer Akte zu oder legt Ihre Sportart im Athletenbereich fest.</p>'}</div>`
    + `<div class="grid g2" style="margin-top:14px"><div class="panel"><h3>Termine der nächsten 14 Tage</h3>${termineMitPruefungen(core)}</div><div class="panel"><h3>Hinweise</h3>${alertList(alertsWithNames(core).slice(0, 5), { compact: true })}</div></div>`;
}

function koordCockpit(core, s) {
  const sc = core.athletes;
  const due = sc.flatMap((a) => openMeasures(core, a.id).filter((m) => m.review && dayDiff(m.review, core.today) <= 7).map((m) => ({ a, m }))).sort((x, y) => x.m.review.localeCompare(y.m.review));
  const act = sc.filter((a) => a.status !== 'ausgetreten');
  const complete = act.filter((a) => planComplete(core.plans[a.id])).length;
  return greet(core, s)
    + `<div class="grid g4">${kpi(act.filter((a) => a.status === 'aktiv').length, 'aktive Athlet:innen in der Betreuung', 'Ziel: 40–50 je Koordinator:in')}${kpi(core.alerts.length, 'offene Hinweise')}${kpi(due.length, 'Maßnahmen mit Prüftermin ≤ 7 Tage')}${kpi(pct(act.length ? complete / act.length : null), 'vollständige Entwicklungspläne', 'Ziel > 95 %')}</div>`
    + `<div class="grid g2" style="margin-top:14px"><div class="panel"><h3>Fällige Wirkungskontrollen</h3>${due.length ? `<table><tr><th>Athlet:in</th><th>Maßnahme</th><th>Prüftermin</th></tr>${due.map(({ a, m }) => `<tr class="click" ${link(a.id, 'plan')}><td>${esc(a.name)}</td><td>${esc(m.text)}</td><td>${fmt(m.review)}${dayDiff(m.review, core.today) < 0 ? ' <span class="bad">überfällig</span>' : ''}</td></tr>`).join('')}</table>` : '<p class="muted">Keine fälligen Kontrollen.</p>'}</div>
      <div class="panel"><h3>Offene Hinweise</h3>${alertList(alertsWithNames(core).slice(0, 6), { compact: true })}</div></div>`
    + `<div class="panel" style="margin-top:14px"><h3>Entwicklungspläne mit Lücken</h3>${act.filter((a) => !planComplete(core.plans[a.id])).map((a) => `<button class="btn sm" ${link(a.id, 'plan')}>${esc(a.name)}</button>`).join(' ') || '<p class="muted">Alle Pläne vollständig.</p>'}</div>`
    + `<div class="panel" style="margin-top:14px"><h3>Aktuell eingeschränkte Athlet:innen</h3>${act.filter((a) => core.status[a.id] && core.status[a.id].color !== 'gruen').map((a) => `<button class="btn sm" ${link(a.id, 'health')}>${esc(a.name)} · ${esc(cat().status[core.status[a.id].color])}</button>`).join(' ') || '<p class="muted">Keine.</p>'}</div>`
    + `<div class="panel" style="margin-top:14px"><h3>Termine der nächsten 14 Tage</h3>${termineMitPruefungen(core)}</div>`;
}

function sportwissCockpit(core, s) {
  const sc = core.athletes.filter((a) => a.status !== 'ausgetreten' && ['read', 'full'].includes(a.levels.monitoring));
  return greet(core, s)
    + `<div class="panel"><h3>Belastung: diese Woche gegenüber Vorwoche</h3><p class="small muted">Summe aus Dauer × Session-RPE. Transparente Einzelwerte statt eines Gesamtscores. Über +30 % entsteht ein Prüfauftrag.</p>
      <div class="scroll"><table><tr><th>Athlet:in</th><th>Vorwoche</th><th>Diese Woche</th><th>Veränderung</th><th>Status</th></tr>
      ${sc.map((a) => { const w0 = weekLoad(core, a.id, 0), w1 = weekLoad(core, a.id, 1), c = loadChange(core, a.id); return `<tr class="click" ${link(a.id, 'monitoring')}><td>${esc(a.name)}</td><td>${w1} AU</td><td>${w0} AU</td><td class="${c > 0.3 ? 'bad' : c < -0.3 ? 'warn' : ''}">${c == null ? '–' : (c > 0 ? '+' : '') + Math.round(c * 100) + ' %'}</td><td>${core.status[a.id] ? ampel(core.status[a.id].color) : '–'}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Keine Daten.</td></tr>'}</table></div></div>
    <div class="grid g2" style="margin-top:14px"><div class="panel"><h3>Geplante Tests</h3>${termineHtml(core, { types: ['Test'] })}</div><div class="panel"><h3>Hinweise</h3>${alertList(alertsWithNames(core).slice(0, 6), { compact: true })}</div></div>`;
}

async function medCockpit(core, s) {
  const reg = await get('/api/injuries');
  const open = reg.injuries.filter((i) => !i.closed);
  const soon = core.athletes.filter((a) => core.status[a.id]?.next && dayDiff(core.status[a.id].next, core.today) <= 3 && core.status[a.id].color !== 'gruen');
  const withDx = s.user.role === 'arzt' || s.user.role === 'physio';
  return greet(core, s)
    + `<div class="grid g4">${kpi(open.length, 'offene Verletzungen und Erkrankungen')}${kpi(soon.length, 'Kontrollen in ≤ 3 Tagen')}${kpi(core.alerts.length, 'offene Gesundheitshinweise')}${kpi(open.reduce((n, i) => n + i.daysLost, 0), 'laufende Ausfall- und Einschränkungstage')}</div>`
    + `<div class="grid g2" style="margin-top:14px"><div class="panel"><h3>Return-to-Performance</h3>${open.map((i) => `<div style="margin-bottom:12px"><b style="cursor:pointer" ${link(i.aid, 'health')}>${esc(i.athleteName)}</b> <span class="small muted">${withDx ? esc(i.diagnosis) : ''}</span>${rtpStepper(i.rtp)}</div>`).join('') || '<p class="muted">Keine offenen Fälle.</p>'}</div>
      <div class="panel"><h3>Gesundheitshinweise</h3>${alertList(alertsWithNames(core), { compact: true })}</div></div>`
    + `<div class="panel" style="margin-top:14px"><h3>Belastungsstatus mit Kontrolle ≤ 3 Tage</h3>${soon.map((a) => `<button class="btn sm" ${link(a.id, 'health')}>${esc(a.name)} · ${esc(cat().status[core.status[a.id].color])} · ${fmt(core.status[a.id].next)}</button>`).join(' ') || '<p class="muted">Keine.</p>'}</div>`;
}

async function psychCockpit(core, s) {
  const ov = await get('/api/psych/overview');
  const open = ov.requests.filter((r) => r.status === 'offen');
  return greet(core, s)
    + `<div class="note sig">Dein Bereich ist vollständig getrennt. Trainer und Koordination sehen nur Hinweise, die die Athlet:in freigibt.</div>
    <div class="grid g3">${kpi(open.length, 'offene Gesprächswünsche')}${kpi(core.alerts.length, 'Hinweise Wohlbefinden und vertraulich')}${kpi(ov.hints, 'freigegebene Handlungshinweise')}</div>
    <div class="grid g2" style="margin-top:14px"><div class="panel"><h3>Gesprächswünsche</h3>${open.length ? `<table>${open.map((r) => `<tr><td><b class="click" style="cursor:pointer" ${link(r.aid, 'psych')}>${esc(r.name)}</b><div class="small muted">${fmt(r.date)}</div></td><td>${esc(r.text)}</td><td><button class="btn sm" data-act="req-close" data-id="${r.id}">als bearbeitet markieren</button></td></tr>`).join('')}</table>` : '<p class="muted">Keine offenen Gesprächswünsche.</p>'}</div>
      <div class="panel"><h3>Hinweise</h3>${alertList(alertsWithNames(core), { compact: true })}</div></div>`;
}
actions['req-close'] = async (el) => { await post(`/api/psych/requests/${el.dataset.id}/close`, {}); toast('Als bearbeitet markiert.'); await window.__lsa.rerender(); };

async function dcCockpit(core, s) {
  const d = await get('/api/school/overview');
  const conf = d.athletes.flatMap((a) => a.conflicts.map((c) => ({ a, c })));
  return greet(core, s)
    + `<div class="panel"><h3>Schulische und sportliche Spitzen gleichzeitig</h3><p class="small muted">Prüfungen innerhalb von zwei Tagen um einen Wettkampf, eine Reise oder einen Test.</p>${conf.length ? `<table><tr><th>Athlet:in</th><th>Prüfung</th><th>Sporttermin</th></tr>${conf.map(({ a, c }) => `<tr class="click" ${link(a.id, 'school')}><td>${esc(a.name)}</td><td>${fmt(c.exam.date)} ${esc(c.exam.subject)}</td><td>${fmt(c.event.date)} ${esc(c.event.title)}</td></tr>`).join('')}</table>` : '<p class="muted">Keine Überschneidungen.</p>'}</div>
    <div class="panel" style="margin-top:14px"><h3>Schulstatus</h3><div class="scroll"><table><tr><th>Athlet:in</th><th>Schule, Klasse</th><th>Bildungsziel</th><th>Fehlstunden</th><th>Notentrend</th></tr>${d.athletes.map((a) => `<tr class="click" ${link(a.id, 'school')}><td>${esc(a.name)}</td><td>${esc(a.school)}${a.schoolClass ? ', ' + esc(a.schoolClass) : ''}</td><td>${esc(a.eduGoal)}</td><td>${a.absences}</td><td class="${a.trend === 'fallend' ? 'warn' : ''}">${esc(a.trend)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Keine Athlet:innen.</td></tr>'}</table></div></div>`;
}

function athleteCockpit(core, s) {
  const a = core.athletes[0];
  if (!a) return head(`Hallo ${esc(s.user.displayName)}`, 'Dir ist noch keine Akte zugeordnet.');
  const e = readinessToday(core, a.id), plan = core.plans[a.id], st = core.status[a.id];
  const first = a.name.split(' ')[0];
  const next = upcoming(core, a.id, 6);
  const events = core.events.filter((ev) => dayDiff(ev.date, core.today) >= 0 && dayDiff(ev.date, core.today) <= 14);
  const exams = (core.exams || []).filter((x) => x.aid === a.id && dayDiff(x.date, core.today) >= 0 && dayDiff(x.date, core.today) <= 14);
  return head(`Hallo ${esc(first)}`, `Dein Überblick für heute, ${fmt(core.today)}.`, e ? '<span class="pill ok-pill">✓ Tages-Check erledigt</span>' : '<button class="btn signal" data-act="nav" data-to="check">Tages-Check ausfüllen</button>')
    + `<div class="grid g2"><div class="panel"><h3>Mein Belastungsstatus</h3>${st ? statusCard(st) : '<p class="muted">–</p>'}</div>
      <div class="panel"><h3>Diese Woche</h3>${next.length || events.length || exams.length ? `<table>${next.map((x) => `<tr><td>${wd(x.date)} ${fmtS(x.date)}</td><td>${esc(x.title)}</td></tr>`).join('')}${events.map((ev) => `<tr><td>${wd(ev.date)} ${fmtS(ev.date)}</td><td><b>${esc(ev.title)}</b> (${esc(ev.type)})</td></tr>`).join('')}${exams.map((x) => `<tr><td>${wd(x.date)} ${fmtS(x.date)}</td><td>Schule: ${esc(x.subject)}</td></tr>`).join('')}</table>` : '<p class="muted">Keine Einheiten oder Termine eingetragen.</p>'}</div></div>
      <div class="grid g2" style="margin-top:14px"><div class="panel"><h3>Meine Ziele und Maßnahmen</h3>${plan && plan.goals.length ? plan.goals.map((g) => `<div style="margin-bottom:8px"><b>${esc(g.text)}</b> <span class="small muted">${esc(g.area)}</span><div class="small">${plan.measures.filter((m) => m.goal === g.id).map((m) => esc(m.text) + ' · Prüfung ' + fmtS(m.review)).join('<br>')}</div></div>`).join('') : '<p class="muted">Dein Entwicklungsplan ist noch in Arbeit.</p>'}</div>
      <div class="panel"><h3>Meine Ansprechpersonen</h3><dl class="kv">${a.team.map((t) => `<dt>${esc(t.function)}</dt><dd>${esc(t.name)}</dd>`).join('') || '<dt>Team</dt><dd class="muted">noch niemand zugeordnet</dd>'}<dt>Sportpsychologie</dt><dd>vertraulich – Anfrage unter „Wohlbefinden &amp; Psychologie“</dd></dl>
      <div class="note" style="margin-bottom:0">Ehrliche Angaben führen nicht zu Nachteilen bei Kader oder Nominierung. Sie helfen, dein Training passend zu steuern.</div></div></div>`;
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
    if (r === 'arzt' || r === 'physio') return await medCockpit(core, s);
    if (r === 'psych') return await psychCockpit(core, s);
    if (r === 'dualcareer') return await dcCockpit(core, s);
    return greet(core, s) + `<div class="panel"><h3>Hinweise</h3>${alertList(alertsWithNames(core).slice(0, 6), { compact: true })}</div>`;
  },
});
