// Akten-Reiter "Monitoring", "Entwicklungsplan" und "Entscheidungen"
import { esc, fmt, fmtS, wd, pct, dayDiff, addDays, TODAY, nl2br, fmtTs } from '../util.js';
import { get, post, put, del } from '../api.js';
import { actions, forms, changes, toast, showModal, closeModal, confirmDialog, options, kpi } from '../ui.js';
import { state, can } from '../state.js';
import { tabContent, cur, levelPill } from './akte.js';
import { getCore, completeness, availability, weekLoad, loadChange, days14 } from '../calc.js';

const cat = () => state.meta.catalog;

// ---------------------------------------------------------------- Monitoring
function heatmap(core, aid, items, { extra = true } = {}) {
  const days = days14(core);
  const R = core.readiness[aid] || {};
  return `<div class="scroll"><table class="heat"><tr><th>Item (5 = bestmöglich)</th>${days.map((d) => `<th>${wd(d)}<br>${fmtS(d).slice(0, 5)}</th>`).join('')}</tr>
  ${items.map(([k, l]) => `<tr><td>${esc(l)}</td>${days.map((d) => { const e = R[d]; return e && e[k] != null ? `<td class="h${e[k]}">${e[k]}</td>` : '<td class="hmiss" title="keine Eingabe">–</td>'; }).join('')}</tr>`).join('')}
  <tr><td>Schlafdauer (h)</td>${days.map((d) => (R[d] && R[d].sleepH != null ? `<td>${R[d].sleepH}</td>` : '<td class="hmiss">–</td>')).join('')}</tr>
  ${extra ? `<tr><td>Schmerz / Symptome</td>${days.map((d) => (R[d] ? `<td>${R[d].pain ? '<b class="bad" title="Schmerz">S</b>' : ''}${R[d].symptoms ? '<b class="bad" title="Krankheitssymptome">K</b>' : ''}${!R[d].pain && !R[d].symptoms ? '·' : ''}</td>` : '<td class="hmiss">–</td>')).join('')}</tr>` : ''}</table></div>
  <p class="small muted">Fehlende Tage bleiben als Lücke sichtbar und werden nicht als Null gerechnet. Kein Gesamtscore: auffällige Einzelwerte und Verläufe sagen mehr.</p>`;
}

function loadChart(core, aid) {
  const ss = core.sessions.filter((s) => s.aid === aid && dayDiff(s.date, core.today) >= -13 && dayDiff(s.date, core.today) < 0);
  const max = Math.max(1, ...ss.map((s) => (s.duration || 0) * (s.rpe || 0)));
  const W = 700, H = 170, bw = W / 14;
  const days = []; for (let i = -13; i < 0; i++) days.push(addDays(i, core.today));
  const bars = days.map((d, i) => {
    const s = ss.find((x) => x.date === d), x = i * bw + 6;
    if (!s) return `<text x="${x + bw / 2 - 6}" y="${H - 4}" font-size="10" fill="currentColor" opacity=".6" text-anchor="middle">${wd(d)}</text>`;
    if (s.rpe == null || s.duration == null) return `<rect x="${x}" y="${H - 60}" width="${bw - 12}" height="40" fill="url(#hatch)" stroke="var(--muted)"/><text x="${x + bw / 2 - 6}" y="${H - 4}" font-size="10" fill="currentColor" text-anchor="middle">${wd(d)}</text><text x="${x + bw / 2 - 6}" y="${H - 64}" font-size="9" fill="currentColor" text-anchor="middle">${s.status === 'nicht teilgenommen' ? 'n. t.' : 'fehlt'}</text>`;
    const v = s.duration * s.rpe, h = (H - 40) * v / max, col = s.status === 'angepasst' ? 'var(--amber)' : 'var(--petrol)';
    return `<rect x="${x}" y="${H - 20 - h}" width="${bw - 12}" height="${h}" rx="3" fill="${col}"><title>${fmt(d)}: ${s.duration} min × RPE ${s.rpe} = ${v} AU (${esc(s.status)})</title></rect><text x="${x + bw / 2 - 6}" y="${H - 4}" font-size="10" fill="currentColor" text-anchor="middle">${wd(d)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Trainingsbelastung der letzten 13 Tage" style="color:var(--ink);max-width:100%"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="var(--line)"/></pattern></defs>${bars}</svg>
  <div class="row small"><span><span class="dot" style="background:var(--petrol)"></span> vollständig</span><span><span class="dot" style="background:var(--amber)"></span> angepasst</span><span>schraffiert = Wert fehlt</span></div>`;
}

function spark(values) {
  if (values.length < 2) return '';
  const W = 120, H = 28, min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (W - 6) + 3},${H - 4 - ((v - min) / rng) * (H - 8)}`).join(' ');
  const last = pts.split(' ').pop().split(',');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--petrol)" stroke-width="1.6"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="var(--signal)"/></svg>`;
}

async function measurementsPanel(aid) {
  const d = await get(`/api/athletes/${encodeURIComponent(aid)}/measurements`);
  const vars = cat().variables;
  const byVar = {};
  for (const m of [...d.measurements].reverse()) (byVar[m.variable] ||= []).push(m);
  const summary = Object.entries(byVar).map(([k, list]) => {
    const good = list.filter((m) => m.status !== 'markiert'), last = good[good.length - 1], prev = good[good.length - 2];
    const ch = last && prev && prev.value ? ((last.value - prev.value) / prev.value) * 100 : null;
    return `<tr><td><b>${esc(k)}</b></td><td>${last ? `${last.value} ${esc(last.unit)}` : '<span class="warn">nur markierte Werte</span>'}<div class="small muted">${last ? fmt(last.date) : ''}</div></td><td class="small ${ch != null && Math.abs(ch) > 10 ? 'warn' : ''}">${ch == null ? '–' : (ch > 0 ? '+' : '') + ch.toFixed(1) + ' %'}</td><td>${spark(good.slice(-12).map((m) => m.value))}</td><td class="small muted">${list.length} Wert(e)${list.some((m) => m.status === 'markiert') ? ' · <span class="warn">markiert</span>' : ''}</td></tr>`;
  }).join('');
  const form = d.canWrite ? `<details style="margin-top:12px"><summary>＋ Messwert erfassen</summary><form data-form="meas-add" style="margin-top:10px">
      <div class="fgrid c4"><div class="f"><label>Datum</label><input type="date" name="date" value="${TODAY}" required></div>
      <div class="f"><label>Messgröße</label><select name="variable" data-change="meas-var">${vars.map((v) => `<option value="${esc(v.key)}" data-unit="${esc(v.unit)}" data-source="${esc(v.source)}">${esc(v.key)} (${esc(v.unit)})</option>`).join('')}<option value="__custom">Eigene Messgröße …</option></select></div>
      <div class="f"><label>Wert</label><input name="value" inputmode="decimal" required placeholder="z. B. 1,91"></div>
      <div class="f"><label>Einheit</label><input name="unit" value="${esc(vars[0].unit)}" readonly maxlength="20"></div></div>
      <div class="f" id="customVar" hidden><label>Name der eigenen Messgröße</label><input name="customName" maxlength="60"></div>
      <div class="fgrid c2"><div class="f"><label>Quelle</label><input name="source" maxlength="60" value="${esc(vars[0].source)}"></div><div class="f"><label>Notiz</label><input name="note" maxlength="300"></div></div>
      <p class="small muted">Werte außerhalb der Plausibilitätsgrenzen, Duplikate, Zukunftsdaten und Sprünge &gt; 10 % werden <b>markiert, nicht gelöscht</b> und erscheinen in der Datenqualität.</p>
      <div class="err" data-err></div><button class="btn primary">Messwert speichern</button></form></details>` : '';
  return `<div class="panel" style="margin-top:14px"><h3>Tests und Messwerte</h3>${d.measurements.length ? `<div class="scroll"><table><tr><th>Messgröße</th><th>Letzter Wert</th><th>Veränderung</th><th>Verlauf</th><th></th></tr>${summary}</table></div>
    <details style="margin-top:10px"><summary>Alle Einzelwerte (${d.measurements.length})</summary><div class="scroll"><table><tr><th>Datum</th><th>Messgröße</th><th>Wert</th><th>Quelle</th><th>Notiz</th><th>Status</th><th></th></tr>
    ${d.measurements.map((m) => `<tr><td class="small nowrap">${fmt(m.date)}</td><td>${esc(m.variable)}</td><td>${m.value} ${esc(m.unit)}</td><td class="small">${esc(m.source)}</td><td class="small">${esc(m.note)}</td><td>${m.status === 'ok' ? '' : `<span class="pill warn-pill">${esc(m.status)}</span>`}</td><td>${d.canWrite ? `<button class="btn sm" data-act="meas-del" data-id="${m.id}">✕</button>` : ''}</td></tr>`).join('')}</table></div></details>` : '<p class="muted">Noch keine Messwerte erfasst.</p>'}${form}</div>`;
}

tabContent.monitoring = async (c) => {
  const core = await getCore(cur.id);
  const aid = cur.id, lv = c.data.levels.monitoring;
  const items = cat().readinessItems.map(([k, l]) => [k, l]);
  if (lv === 'wellbeing') {
    return `<div class="note">Ihre Zugriffsstufe: ${levelPill('monitoring')} Sie sehen aus dem Performance-System nur die allgemeinen Wohlbefindens-Angaben.</div><div class="panel">${heatmap(core, aid, items.filter(([k]) => ['sleepQ', 'stress', 'fatigue'].includes(k)), { extra: false })}</div>`;
  }
  const ch = loadChange(core, aid);
  const ss = core.sessions.filter((s) => s.aid === aid && dayDiff(s.date, core.today) >= -13 && dayDiff(s.date, core.today) < 0).sort((a, b) => a.date.localeCompare(b.date));
  return `<div class="grid g3">${kpi(pct(completeness(core, aid)), 'Tages-Check vollständig (14 Tage)')}${kpi(pct(availability(core, aid)), 'Trainingsverfügbarkeit (vollständig absolviert / geplant)')}${kpi(ch == null ? '–' : (ch > 0 ? '+' : '') + Math.round(ch * 100) + ' %', 'Belastung ggü. Vorwoche', ch > 0.3 ? '<span class="bad">über +30 %: Prüfauftrag</span>' : '')}</div>
  <div class="panel" style="margin-top:14px"><h3>Tagesform – letzte 14 Tage</h3>${heatmap(core, aid, items)}</div>
  <div class="panel" style="margin-top:14px"><h3>Interne Belastung je Einheit (Dauer × Session-RPE)</h3>${loadChart(core, aid)}</div>
  <div class="panel scroll" style="margin-top:14px"><h3>Einheiten und Abweichungen</h3>${ss.length ? `<table><tr><th>Datum</th><th>Einheit</th><th>Status</th><th>Dauer</th><th>RPE</th><th>Grund der Abweichung</th><th>Entscheidung</th></tr>
  ${ss.slice().reverse().map((s) => `<tr><td>${wd(s.date)} ${fmtS(s.date)}</td><td>${esc(s.title)}</td><td><span class="pill">${esc(s.status)}</span></td><td>${s.duration ?? '–'}</td><td>${s.rpe ?? '<span class="warn">fehlt</span>'}</td><td class="small">${esc(s.reason) || (s.status !== 'vollständig' && s.status !== 'geplant' ? '<span class="bad">fehlt</span>' : '–')}</td><td class="small">${esc(s.decidedBy) || '–'}</td></tr>`).join('')}</table>` : '<p class="muted">Noch keine erfassten Einheiten in den letzten 13 Tagen.</p>'}
  ${can('training.record') && lv === 'full' ? '<p class="small muted">Einheiten planen und erfassen: <a href="#/training">Trainingserfassung</a>.</p>' : ''}</div>` + await measurementsPanel(aid);
};

changes['meas-var'] = (el) => {
  const f = el.form, o = el.selectedOptions[0], custom = el.value === '__custom';
  f.elements.unit.readOnly = !custom;
  f.elements.unit.value = custom ? '' : o.dataset.unit;
  f.elements.source.value = custom ? '' : o.dataset.source;
  document.getElementById('customVar').hidden = !custom;
};
forms['meas-add'] = async (f, v) => {
  const custom = v.variable === '__custom';
  const r = await post(`/api/athletes/${encodeURIComponent(cur.id)}/measurements`, { date: v.date, variable: custom ? v.customName : v.variable, value: v.value, unit: v.unit, source: v.source, note: v.note });
  toast(r.flags.length ? `Gespeichert, aber markiert: ${r.flags.join('; ')}` : 'Messwert gespeichert.', r.flags.length ? 'error' : '');
  await window.__lsa.rerender();
};
actions['meas-del'] = async (el) => {
  if (!(await confirmDialog('Diesen Messwert löschen? (Falls er nur falsch ist: besser in der Datenqualität korrigieren – dort bleibt der Rohwert erhalten.)', { ok: 'Löschen', danger: true }))) return;
  await del(`/api/measurements/${el.dataset.id}`); await window.__lsa.rerender();
};

// ---------------------------------------------------------------- Entwicklungsplan
let planEdit = { base: false, lt: false };
tabContent.plan = async (c) => {
  const p = await get(`/api/athletes/${encodeURIComponent(cur.id)}/plan`);
  cur.plan = p;
  const edit = p.canEdit, today = TODAY;
  const resp = [...new Set([...c.data.team.map((t) => t.name), state.session.user.displayName])];
  const textPanel = (key, title, val, formName) => `<div class="panel"><h3>${title}</h3>${edit && planEdit[key] ? `<form data-form="${formName}"><textarea name="v" maxlength="3000">${esc(val)}</textarea><div class="row"><button class="btn sm primary">Speichern</button><button type="button" class="btn sm" data-act="plan-toggle" data-k="${key}">Abbrechen</button></div></form>`
    : `<p>${val ? nl2br(val) : '<span class="warn">fehlt</span>'}</p>${edit ? `<button class="btn sm" data-act="plan-toggle" data-k="${key}">Bearbeiten</button>` : ''}`}</div>`;
  let h = `<div class="note">Der Entwicklungsplan ist das zentrale Dokument: höchstens 4–6 Seiten, keine Rohdaten, je Bereich höchstens zwei bis drei Ziele. Ihre Zugriffsstufe: ${levelPill('plan')}</div>
  <div class="grid g2">${textPanel('base', 'Ausgangslage', p.baseline, 'plan-base')}${textPanel('lt', 'Langfristiges Ziel', p.longTerm, 'plan-lt')}</div>
  <div class="panel" style="margin-top:14px"><h3>Jahresziele und Maßnahmen</h3>`;
  if (!p.goals.length) h += '<p class="muted">Noch keine Jahresziele.</p>';
  for (const g of p.goals) {
    h += `<div class="row" style="margin:14px 0 4px;justify-content:space-between"><div><b>${esc(g.text)}</b> <span class="pill">${esc(g.area)}</span></div>${edit ? `<button class="btn sm" data-act="goal-del" data-id="${g.id}" title="Ziel mit allen Maßnahmen löschen">Ziel löschen</button>` : ''}</div>
    <div class="scroll"><table><tr><th>Maßnahme</th><th>Verantwortlich</th><th>Start</th><th>Prüfung</th><th>Erfolgskriterium</th><th>Status</th><th>Ergebnis / nächste Entscheidung</th></tr>
    ${p.measures.filter((m) => m.goal === g.id).map((m) => {
      const due = m.review && m.review <= today && m.status !== 'beendet';
      return `<tr><td>${esc(m.text)}${edit ? `<div><button class="btn link sm" data-act="measure-edit" data-id="${m.id}">bearbeiten</button> <button class="btn link sm" data-act="measure-del" data-id="${m.id}">löschen</button></div>` : ''}</td><td class="small">${esc(m.resp) || '<span class="bad">fehlt</span>'}</td><td class="small">${fmtS(m.start)}</td><td class="small">${fmtS(m.review)}${due ? ' <span class="bad">fällig</span>' : ''}</td><td class="small">${esc(m.criterion) || '<span class="bad">fehlt</span>'}</td><td><span class="pill">${esc(m.status)}</span></td>
      <td class="small">${esc(m.result) || '–'}${m.next ? ' → <b>' + esc(m.next) + '</b>' : ''}${edit && due ? `<form data-form="measure-review" data-id="${m.id}" style="margin-top:6px"><input type="text" name="result" placeholder="Ergebnis: Zielgröße verändert? Umgesetzt?" required maxlength="500"><div class="row" style="margin-top:4px"><select name="next"><option>fortführen</option><option>anpassen</option><option>beenden</option></select><button class="btn sm primary">Wirkungskontrolle speichern</button></div></form>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="muted">Noch keine Maßnahme zu diesem Ziel.</td></tr>'}</table></div>`;
  }
  if (edit) {
    h += `<datalist id="respList">${resp.map((r) => `<option value="${esc(r)}">`).join('')}</datalist>
    <details style="margin-top:14px"><summary>＋ Jahresziel hinzufügen</summary><form data-form="goal-add" class="fgrid c3" style="margin-top:8px"><div class="f"><label>Bereich</label><select name="area">${options(cat().goalAreas)}</select></div><div class="f"><label>Ziel</label><input name="text" required maxlength="300"></div><div class="f"><label>&nbsp;</label><button class="btn primary">Ziel hinzufügen</button></div><div class="err" data-err style="grid-column:1/-1"></div></form></details>
    <details style="margin-top:8px"><summary>＋ Maßnahme hinzufügen</summary>${p.goals.length ? `<form data-form="measure-add" style="margin-top:8px"><div class="fgrid c3">
      <div class="f"><label>Zu Ziel</label><select name="goalId">${p.goals.map((g) => `<option value="${g.id}">${esc(g.text)}</option>`).join('')}</select></div>
      <div class="f"><label>Maßnahme</label><input name="text" required maxlength="300"></div><div class="f"><label>Verantwortliche Person</label><input name="resp" required list="respList" maxlength="150"></div>
      <div class="f"><label>Start</label><input type="date" name="start" value="${TODAY}" required></div><div class="f"><label>Überprüfungstermin</label><input type="date" name="review" required></div><div class="f"><label>Erfolgskriterium</label><input name="criterion" required maxlength="300"></div></div>
      <div class="err" data-err></div><button class="btn primary">Maßnahme speichern</button> <span class="small muted">Ohne Verantwortung, Prüftermin und Erfolgskriterium wird nicht gespeichert.</span></form>` : '<p class="muted" style="margin-top:8px">Zuerst ein Jahresziel anlegen.</p>'}</details>`;
  }
  return h + '</div>';
};

actions['plan-toggle'] = async (el) => { planEdit[el.dataset.k] = !planEdit[el.dataset.k]; await window.__lsa.rerender(); };
forms['plan-base'] = async (f, v) => { await put(`/api/athletes/${encodeURIComponent(cur.id)}/plan`, { baseline: v.v }); planEdit.base = false; toast('Gespeichert.'); await window.__lsa.rerender(); };
forms['plan-lt'] = async (f, v) => { await put(`/api/athletes/${encodeURIComponent(cur.id)}/plan`, { longTerm: v.v }); planEdit.lt = false; toast('Gespeichert.'); await window.__lsa.rerender(); };
forms['goal-add'] = async (f, v) => { await post(`/api/athletes/${encodeURIComponent(cur.id)}/goals`, { area: v.area, text: v.text }); toast('Ziel gespeichert.'); await window.__lsa.rerender(); };
forms['measure-add'] = async (f, v) => { await post(`/api/athletes/${encodeURIComponent(cur.id)}/measures`, { goalId: Number(v.goalId), text: v.text, resp: v.resp, start: v.start, review: v.review, criterion: v.criterion }); toast('Maßnahme gespeichert.'); await window.__lsa.rerender(); };
forms['measure-review'] = async (f, v) => { await post(`/api/measures/${f.dataset.id}/review`, { result: v.result, next: v.next }); toast('Wirkungskontrolle gespeichert und im Entscheidungsprotokoll festgehalten.'); await window.__lsa.rerender(); };
actions['goal-del'] = async (el) => {
  if (!(await confirmDialog('Dieses Ziel samt allen zugehörigen Maßnahmen löschen?', { ok: 'Löschen', danger: true }))) return;
  await del(`/api/goals/${el.dataset.id}`); await window.__lsa.rerender();
};
actions['measure-del'] = async (el) => {
  if (!(await confirmDialog('Diese Maßnahme löschen?', { ok: 'Löschen', danger: true }))) return;
  await del(`/api/measures/${el.dataset.id}`); await window.__lsa.rerender();
};
actions['measure-edit'] = (el) => {
  const m = cur.plan.measures.find((x) => x.id === Number(el.dataset.id));
  showModal(`<h2>Maßnahme bearbeiten</h2><form data-form="measure-save" data-id="${m.id}">
    <div class="f"><label>Maßnahme</label><input name="text" value="${esc(m.text)}" required maxlength="300"></div>
    <div class="fgrid c2"><div class="f"><label>Verantwortlich</label><input name="resp" value="${esc(m.resp)}" required maxlength="150"></div><div class="f"><label>Status</label><select name="status">${options(['offen', 'laufend', 'beendet'], m.status)}</select></div>
    <div class="f"><label>Start</label><input type="date" name="start" value="${esc(m.start)}" required></div><div class="f"><label>Überprüfungstermin</label><input type="date" name="review" value="${esc(m.review)}" required></div></div>
    <div class="f"><label>Erfolgskriterium</label><input name="criterion" value="${esc(m.criterion)}" required maxlength="300"></div>
    <div class="err" data-err></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="dlg-cancel">Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
};
forms['measure-save'] = async (f, v) => { await put(`/api/measures/${f.dataset.id}`, { text: v.text, resp: v.resp, status: v.status, start: v.start, review: v.review, criterion: v.criterion }); closeModal(); toast('Gespeichert.'); await window.__lsa.rerender(); };

// ---------------------------------------------------------------- Entscheidungen
export function decisionForm(aid, reason = '') {
  return `<form class="panel" data-form="decision-add" data-aid="${esc(aid)}" style="margin-top:14px"><h3>Entscheidung dokumentieren</h3><div class="fgrid c3">
   <div class="f"><label>Anlass</label><input name="reason" value="${esc(reason)}" required maxlength="300"></div><div class="f"><label>Verwendete Informationen</label><input name="info" required maxlength="300"></div><div class="f"><label>Entscheidung</label><input name="decision" required maxlength="500"></div>
   <div class="f"><label>Verantwortlich</label><input name="resp" value="${esc(state.session.user.displayName)}" required maxlength="150"></div><div class="f"><label>Betroffene Personen</label><input name="affected" maxlength="200"></div><div class="f"><label>Maßnahme</label><input name="measure" maxlength="300"></div>
   <div class="f"><label>Prüftermin</label><input type="date" name="review" required></div></div><div class="err" data-err></div><button class="btn primary">Entscheidung speichern</button></form>`;
}
tabContent.decisions = async (c) => {
  const d = await get(`/api/athletes/${encodeURIComponent(cur.id)}/decisions`);
  return `<div class="panel"><h3>Entscheidungsprotokoll</h3>${d.decisions.length ? d.decisions.map((x) => `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><b>${esc(x.decision)}</b><dl class="kv small" style="margin-top:4px"><dt>Datum</dt><dd>${fmt(x.date)}</dd><dt>Anlass</dt><dd>${esc(x.reason)}</dd><dt>Verwendete Informationen</dt><dd>${esc(x.info)}</dd><dt>Verantwortlich</dt><dd>${esc(x.resp)}</dd><dt>Betroffene</dt><dd>${esc(x.affected) || '–'}</dd><dt>Maßnahme</dt><dd>${esc(x.measure) || '–'}</dd><dt>Prüftermin</dt><dd>${fmt(x.review)}</dd>
      <dt>Ergebnis</dt><dd>${esc(x.result) || (d.canWrite ? `<form data-form="decision-result" data-id="${x.id}" class="row"><input name="result" placeholder="Ergebnis nachtragen" maxlength="500" required style="min-width:240px"><button class="btn sm">Speichern</button></form>` : 'offen')}</dd></dl></div>`).join('') : '<p class="muted">Noch keine Entscheidungen.</p>'}</div>`
    + (d.canWrite ? decisionForm(cur.id) : `<div class="note" style="margin-top:14px">Ihre Zugriffsstufe: ${levelPill('decisions')}</div>`);
};
forms['decision-add'] = async (f, v) => {
  await post(`/api/athletes/${encodeURIComponent(f.dataset.aid || cur.id)}/decisions`, { reason: v.reason, info: v.info, decision: v.decision, resp: v.resp, affected: v.affected, measure: v.measure, review: v.review });
  toast('Entscheidung gespeichert.'); await window.__lsa.rerender();
};
forms['decision-result'] = async (f, v) => { await put(`/api/decisions/${f.dataset.id}`, { result: v.result }); await window.__lsa.rerender(); };
