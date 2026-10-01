// Zugriffsprotokoll (wer hat wann worauf zugegriffen) – ohne Inhalte
import { esc, fmtTs } from '../util.js';
import { get } from '../api.js';
import { actions, changes, inputs, head, options } from '../ui.js';
import { registerView, registerNav, can } from '../state.js';

const f = { result: 'alle', area: '', q: '', limit: 100 };

export async function auditPanel(extra = {}) {
  const qs = new URLSearchParams({ result: f.result, area: f.area, q: f.q, limit: String(f.limit), ...extra });
  const d = await get('/api/audit?' + qs);
  return `<div class="panel scroll"><div class="toolbar">
      <select data-change="audit-result"><option value="alle">Alle Ergebnisse</option>${options(d.results.map((r) => [r.result, `${r.result} (${r.n})`]), f.result)}</select>
      <select data-change="audit-area"><option value="">Alle Bereiche</option>${options(d.areas, f.area)}</select>
      <input type="search" placeholder="Suchen …" value="${esc(f.q)}" data-input="audit-q" style="max-width:240px">
      <span class="right small muted">${d.rows.length} von ${d.total} Einträgen</span></div>
    ${d.rows.length ? `<table><tr><th>Zeit</th><th>Person</th><th>Rolle</th><th>Athleten-ID</th><th>Bereich</th><th>Aktion</th><th>Ergebnis</th></tr>
    ${d.rows.map((l) => `<tr><td class="small nowrap">${fmtTs(l.ts)}</td><td class="small">${esc(l.user_name || '–')}${l.real_user_name ? `<div class="muted">Testansicht von ${esc(l.real_user_name)}</div>` : ''}</td><td class="small">${esc(l.role)}</td><td class="small">${esc(l.athlete_id || '–')}</td><td class="small">${esc(l.area)}</td><td class="small">${esc(l.action)}${l.detail ? `<div class="muted">${esc(l.detail)}</div>` : ''}</td><td class="small ${l.result === 'verweigert' ? 'bad' : ''}">${esc(l.result)}</td></tr>`).join('')}</table>` : '<div class="empty">Keine Einträge.</div>'}
    ${d.total > d.rows.length ? '<div style="margin-top:10px"><button class="btn" data-act="audit-more">Weitere laden</button></div>' : ''}</div>`;
}

registerView('protokoll', {
  title: 'Zugriffsprotokoll',
  guard: () => can('audit.view'),
  async render() {
    return head('Zugriffsprotokoll', 'Jede Anmeldung, jede Rechteänderung und jeder Zugriff auf geschützte Bereiche wird festgehalten – ohne Inhalte. Verweigerte Zugriffsversuche sind rot markiert.') + await auditPanel();
  },
});
changes['audit-result'] = (el) => { f.result = el.value; f.limit = 100; window.__lsa.rerender(); };
changes['audit-area'] = (el) => { f.area = el.value; f.limit = 100; window.__lsa.rerender(); };
inputs['audit-q'] = (el) => {
  f.q = el.value; f.limit = 100;
  clearTimeout(inputs['audit-q'].t);
  inputs['audit-q'].t = setTimeout(() => window.__lsa.rerender().then(() => { const n = document.querySelector('[data-input=audit-q]'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }), 300);
};
actions['audit-more'] = () => { f.limit += 200; window.__lsa.rerender(); };

registerNav({ id: 'protokoll', label: 'Zugriffsprotokoll', view: 'protokoll', order: 85, show: () => can('audit.view') });
