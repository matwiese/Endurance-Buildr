// Datenqualität: markierte Werte, Vollständigkeit, Datenwörterbuch, Data Owner
import { esc, fmt, pct } from '../util.js';
import { get, post } from '../api.js';
import { actions, forms, toast, head, kpi, showModal, closeModal } from '../ui.js';
import { registerView, registerNav, can } from '../state.js';
import { cockpits } from './start.js';

export async function qualitaetHtml() {
  const d = await get('/api/quality');
  const k = d.kpi;
  return head('Datenqualität', 'Vollständig, richtig, aktuell, nachvollziehbar, zweckgeeignet. Auffällige Werte werden markiert, nicht gelöscht.') + `
  <div class="grid g4">${kpi(pct(k.completeness), 'Tages-Check-Vollständigkeit (14 Tage)')}${kpi(k.missingRpe, 'Einheiten ohne Session-RPE')}${kpi(k.deviationsNoReason, 'Abweichungen ohne Grund')}${kpi(k.openFlags, 'ungeklärte markierte Werte', 'Ziel: < 5 % ungeklärte Datensätze')}</div>
  <div class="panel scroll" style="margin-top:14px"><h3>Markierte Werte</h3><table><tr><th>Athleten-ID</th><th>Variable</th><th>Wert</th><th>Regel</th><th>Quelle</th><th>Datum</th><th>Status</th><th></th></tr>
  ${d.flags.map((f) => `<tr><td class="small">${esc(f.aid || '–')}</td><td>${esc(f.variable)}</td><td>${esc(f.value)}</td><td class="small">${esc(f.rule)}</td><td class="small">${esc(f.source)}</td><td class="small">${fmt(f.ts)}</td><td><span class="pill ${f.status === 'markiert' ? 'warn-pill' : 'ok-pill'}">${esc(f.status)}</span>${f.resolvedBy ? `<div class="small muted">${esc(f.resolvedBy)}</div>` : ''}${f.note ? `<div class="small muted">${esc(f.note)}</div>` : ''}</td>
  <td class="nowrap">${f.status === 'markiert' && d.canResolve ? `<button class="btn sm" data-act="flag-ok" data-id="${f.id}">Wert bestätigen</button> <button class="btn sm" data-act="flag-fix" data-id="${f.id}" data-var="${esc(f.variable)}">Korrigieren</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Keine markierten Werte.</td></tr>'}</table>
  <p class="small muted">Nur der Data Owner korrigiert. Jede Korrektur wird mit Zeitpunkt und verantwortlicher Person protokolliert; der Rohwert bleibt erhalten.</p></div>
  <div class="grid g2" style="margin-top:14px"><div class="panel scroll"><h3>Datenwörterbuch</h3><table><tr><th>Variable</th><th>Definition</th><th>Einheit</th><th>Quelle</th><th>Erlaubt</th></tr>
   ${d.dictionary.map((r) => `<tr><td class="small"><b>${esc(r.variable)}</b></td><td class="small">${esc(r.def)}</td><td class="small">${esc(r.unit)}</td><td class="small">${esc(r.source)}</td><td class="small">${esc(r.allowed)}</td></tr>`).join('')}</table></div>
  <div class="panel"><h3>Data Owner</h3><table>${d.owners.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>
  <h3 style="margin-top:14px">Vollständigkeit je Athlet:in (14 Tage)</h3>${d.perAthlete.map((a) => `<div class="row small" style="margin:4px 0"><span style="width:80px">${esc(a.id)}</span><div class="bar" style="flex:1"><i style="width:${Math.round(a.completeness * 100)}%"></i></div><span style="width:40px;text-align:right">${pct(a.completeness)}</span></div>`).join('') || '<p class="muted">Keine Athlet:innen.</p>'}</div></div>`;
}

registerView('qualitaet', { title: 'Datenqualität', guard: () => can('quality.view'), render: qualitaetHtml });
registerNav({ id: 'qualitaet', label: 'Datenqualität', view: 'qualitaet', order: 60, show: () => can('quality.view') });

actions['flag-ok'] = async (el) => { await post(`/api/quality/flags/${el.dataset.id}`, { status: 'bestätigt' }); toast('Wert bestätigt.'); await window.__lsa.rerender(); };
actions['flag-fix'] = (el) => showModal(`<h2>Wert korrigieren</h2><p><b>${esc(el.dataset.var)}</b> – der ursprüngliche Rohwert bleibt erhalten.</p>
  <form data-form="flag-fix" data-id="${el.dataset.id}"><div class="f"><label>Korrigierter Wert (nur Zahl)</label><input name="value" inputmode="decimal" required></div><div class="f"><label>Begründung</label><input name="note" maxlength="300" placeholder="z. B. Tippfehler, Gerät neu kalibriert"></div>
  <div class="err" data-err></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="dlg-cancel">Abbrechen</button><button class="btn primary">Korrigieren</button></div></form>`);
forms['flag-fix'] = async (f, v) => { await post(`/api/quality/flags/${f.dataset.id}`, { status: 'korrigiert', value: v.value, note: v.note }); closeModal(); toast('Wert korrigiert und protokolliert.'); await window.__lsa.rerender(); };

// Rolle "Performance Data": Startseite = Datenqualität
cockpits.push({ match: (s) => s.user.role === 'data', render: () => qualitaetHtml() });
