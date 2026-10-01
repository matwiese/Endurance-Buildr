// Verletzungsregister (Medizin/Physio) und Wochenbesprechung
import { esc, fmt, fmtS, dayDiff, wd, TODAY } from '../util.js';
import { get } from '../api.js';
import { actions, changes, head, options } from '../ui.js';
import { state, registerView, registerNav, can, isRole } from '../state.js';
import { getCore, openMeasures } from '../calc.js';
import { injuryFormHtml } from './akte-clinical.js';
import { ampel } from './athlete-common.js';
import { decisionForm } from './akte-performance.js';
import { alertList } from './hinweise.js';

// ------------------------------------------------------------ Verletzungsregister
registerView('verletzungen', {
  title: 'Verletzungsregister',
  guard: () => can('injuries.view'),
  async render() {
    const d = await get('/api/injuries');
    return head('Verletzungsregister', 'Mindestdatensatz nach IOC-Konsens. Nach außen geht nur der Belastungsstatus.') + `
    <div class="panel scroll"><table><tr><th>Athlet:in</th><th>Datum</th><th>Umfeld</th><th>Region</th><th>Art</th><th>Erst/Wieder</th><th>Beginn</th><th>Diagnose</th><th>Ausfall-/Einschr.-Tage</th><th>Reha-Stufe</th><th>Status</th></tr>
    ${d.injuries.map((i) => `<tr class="click" data-act="nav" data-to="athleten" data-arg="${esc(i.aid)}/health"><td>${esc(i.athleteName)}</td><td class="nowrap">${fmt(i.date)}</td><td>${esc(i.setting)}</td><td>${esc(i.region)}</td><td>${esc(i.type)}</td><td>${esc(i.first)}</td><td>${esc(i.onset)}</td><td>${esc(i.diagnosis)}</td><td>${i.daysLost}</td><td>${i.rtp}/6</td><td>${i.closed ? 'abgeschlossen' : 'offen'}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">Noch keine Einträge.</td></tr>'}</table></div>
    ${d.canWrite ? (d.athletes.length ? injuryFormHtml({ athletes: d.athletes }) : '') : '<div class="note" style="margin-top:14px">Die Physiotherapie sieht die fachlich erforderlichen Angaben und kann die Reha-Stufe fortschreiben. Neue Diagnosen erfasst die Sportmedizin.</div>'}`;
  },
});
registerNav({ id: 'verletzungen', label: 'Verletzungsregister', view: 'verletzungen', order: 35, show: () => can('injuries.view') });

// ------------------------------------------------------------ Wochenbesprechung
let cluster = null, decideFor = null;

registerView('besprechung', {
  title: 'Wochenbesprechung',
  guard: () => can('meeting.view'),
  async render() {
    const core = await getCore();
    const sports = [...new Set(core.athletes.map((a) => a.sport))];
    if (!cluster || !sports.includes(cluster)) cluster = sports[0] || '';
    const cl = cluster;
    const sc = core.athletes.filter((a) => a.sport === cl && a.status !== 'ausgetreten');
    const ids = new Set(sc.map((a) => a.id));
    const T = core.today;
    const hasStatus = sc.some((a) => core.status[a.id]);
    const changed = sc.filter((a) => core.status[a.id]?.updated && dayDiff(core.status[a.id].updated, T) >= -7 && core.status[a.id].color !== undefined && core.status[a.id].by);
    const newAl = core.alerts.filter((al) => !al.confidential && al.cat !== 'well' && ids.has(al.athleteId) && dayDiff(al.created, T) >= -7);
    const restr = sc.filter((a) => core.status[a.id] && core.status[a.id].color !== 'gruen');
    const nextLoad = sc.map((a) => ({ a, n: core.sessions.filter((s) => s.aid === a.id && dayDiff(s.date, T) >= 0 && dayDiff(s.date, T) <= 6).length }));
    const ev = core.events.filter((e) => (!e.sport || e.sport === cl) && dayDiff(e.date, T) >= 0 && dayDiff(e.date, T) <= 14);
    const ex = core.exams.filter((x) => ids.has(x.aid) && dayDiff(x.date, T) >= 0 && dayDiff(x.date, T) <= 14);
    const meas = sc.flatMap((a) => openMeasures(core, a.id).filter((m) => m.review && dayDiff(m.review, T) <= 14).map((m) => ({ a, m })));
    const nm = (id) => core.athletes.find((a) => a.id === id)?.name || id;
    const need = [...new Set([...changed.map((a) => a.id), ...restr.map((a) => a.id), ...newAl.map((x) => x.athleteId), ...meas.filter((x) => dayDiff(x.m.review, T) <= 0).map((x) => x.a.id)])];
    const sec = (n, t, body) => `<div class="panel" style="margin-bottom:12px"><h3>${n}. ${t}</h3>${body}</div>`;
    const canDecide = (id) => core.athletes.find((a) => a.id === id)?.levels.decisions === 'full';
    return head(`Wochenbesprechung ${esc(cl)}`, 'Die Agenda entsteht aus den Daten. Besprochen werden nur Fälle mit Entscheidungsbedarf.',
      sports.length > 1 ? `<select data-change="meeting-cluster" style="width:auto">${options(sports, cl)}</select>` : '')
    + `<div class="note sig">Fälle mit Entscheidungsbedarf: ${need.map((id) => (canDecide(id) ? `<button class="btn sm" data-act="decide" data-id="${esc(id)}">${esc(nm(id))} – Beschluss</button>` : `<span class="pill">${esc(nm(id))}</span>`)).join(' ') || 'keine'}</div>`
    + (decideFor && ids.has(decideFor) ? decisionForm(decideFor, `Wochenbesprechung ${cl} ${fmt(T)}`) : '')
    + sec(1, 'Veränderungen seit der Vorwoche', (changed.length || newAl.length) ? `<ul>${changed.map((a) => `<li>${esc(a.name)}: Belastungsstatus ${esc(state.meta.catalog.status[core.status[a.id].color])} seit ${fmt(core.status[a.id].updated)}</li>`).join('')}${newAl.map((al) => `<li>${esc(nm(al.athleteId))}: ${esc(al.trigger)}</li>`).join('')}</ul>` : '<p class="muted">Keine.</p>')
    + sec(2, 'Gesundheitliche Einschränkungen', !hasStatus ? '<p class="muted">Für Ihre Rolle ist der Belastungsstatus nicht freigegeben.</p>' : restr.length ? `<table><tr><th>Athlet:in</th><th>Status</th><th>Erlaubt</th><th>Nicht erlaubt</th><th>Kontrolle</th></tr>${restr.map((a) => { const s = core.status[a.id]; return `<tr><td>${esc(a.name)}</td><td>${ampel(s.color)}</td><td class="small">${esc(s.allowed) || '–'}</td><td class="small">${esc(s.restricted)}</td><td>${fmt(s.next)}</td></tr>`; }).join('')}</table>` : '<p class="muted">Keine.</p>')
    + sec(3, 'Belastung der kommenden Woche', `<table><tr><th>Athlet:in</th><th>Geplante Einheiten</th><th>Hinweis</th></tr>${nextLoad.map(({ a, n }) => `<tr><td>${esc(a.name)}</td><td>${n}</td><td class="small">${core.status[a.id] && core.status[a.id].color !== 'gruen' ? 'Planung an Belastungsstatus anpassen' : ''}${(core.released[a.id] || []).length ? ' · freigegebener Hinweis beachten' : ''}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Keine Athlet:innen.</td></tr>'}</table>`)
    + sec(4, 'Schul- und Reisetermine', (ev.length || ex.length) ? `<ul>${ev.map((e) => `<li>${fmt(e.date)} ${esc(e.title)} (${esc(e.type)})</li>`).join('')}${ex.map((x) => `<li>${fmt(x.date)} ${esc(nm(x.aid))}: ${esc(x.subject)}</li>`).join('')}</ul>` : '<p class="muted">Keine.</p>')
    + sec(5, 'Offene Maßnahmen', meas.length ? `<table><tr><th>Athlet:in</th><th>Maßnahme</th><th>Prüfung</th></tr>${meas.map(({ a, m }) => `<tr><td>${esc(a.name)}</td><td>${esc(m.text)}</td><td>${fmt(m.review)}${dayDiff(m.review, T) < 0 ? ' <span class="bad">überfällig</span>' : ''}</td></tr>`).join('')}</table>` : '<p class="muted">Keine fälligen Maßnahmen.</p>')
    + sec(6, 'Verantwortliche und Fristen', meas.length ? `<ul>${meas.map(({ a, m }) => `<li>${esc(m.resp)}: ${esc(m.text)} (${esc(a.name)}) bis ${fmt(m.review)}</li>`).join('')}</ul>` : '<p class="muted">–</p>');
  },
});
changes['meeting-cluster'] = (el) => { cluster = el.value; decideFor = null; window.__lsa.rerender(); };
actions.decide = async (el) => { decideFor = el.dataset.id; await window.__lsa.rerender(); document.querySelector('form[data-form=decision-add]')?.scrollIntoView({ block: 'center' }); };

registerNav({ id: 'besprechung', label: 'Wochenbesprechung', view: 'besprechung', order: 32, show: () => can('meeting.view') });
