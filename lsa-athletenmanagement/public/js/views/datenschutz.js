// Datenschutz & Audit: Umsetzungsstand (DSFA), Rechteprüfung, Aufbewahrung, Anfragen, Zugriffsprotokoll
import { esc, fmt, fmtTs, dayDiff } from '../util.js';
import { get, post, put } from '../api.js';
import { actions, forms, changes, toast, head } from '../ui.js';
import { state, registerView, registerNav, can } from '../state.js';
import { auditPanel } from './audit.js';
import { cockpits } from './start.js';

export async function datenschutzHtml() {
  const d = await get('/api/privacy/overview');
  const m = d.canManage;
  return head('Datenschutz & Audit', 'Prüfung und Audit über alle Bereiche – ohne Einsicht in Inhalte.') + `
  <div class="grid g2"><div class="panel"><h3>Umsetzungsstand</h3>${d.dpia.map((x) => `<label class="chk"><input type="checkbox" data-change="dpia-toggle" data-id="${x.id}" ${x.done ? 'checked' : ''} ${m ? '' : 'disabled'}> ${esc(x.item)}</label>`).join('')}
   <div class="note warn" style="margin-bottom:0">Bei umfangreicher Verarbeitung von Gesundheits- und Leistungsdaten Minderjähriger frühzeitig prüfen, ob eine Datenschutz-Folgenabschätzung nach Art. 35 DSGVO erforderlich ist.</div></div>
  <div class="panel scroll"><h3>Rechteprüfung je Rolle</h3><p class="small muted">Mindestens jährlich sowie bei Funktionswechsel, Austritt und längerer Abwesenheit.</p>
   <table><tr><th>Rolle</th><th>Aktive Personen</th><th>Zuletzt geprüft</th><th>Fällig</th><th></th></tr>${d.rights.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.activeUsers}</td><td class="small">${r.last ? fmt(r.last) + (r.by ? '<div class="muted">' + esc(r.by) + '</div>' : '') : '<span class="warn">noch nie</span>'}</td><td class="small ${r.next && dayDiff(r.next) < 30 ? 'warn' : ''}">${fmt(r.next)}</td><td>${m ? `<button class="btn sm" data-act="rights-review" data-role="${r.role}">Heute geprüft</button>` : ''}</td></tr>`).join('')}</table>
   ${d.withOverrides.length ? `<div class="note" style="margin-bottom:0"><b>Personen mit individuell angepassten Rechten (${d.withOverrides.length}):</b> ${d.withOverrides.map((u) => `${esc(u.name)} (${esc(u.roleLabel)}, ${u.n} Abweichung(en))`).join('; ')}. Diese bei der Rechteprüfung gezielt ansehen.</div>` : ''}</div></div>
  <div class="panel scroll" style="margin-top:14px"><h3>Anfragen der Athlet:innen</h3>${d.requests.length ? `<table><tr><th>Eingang</th><th>Athlet:in</th><th>Art</th><th>Text</th><th>Status</th><th></th></tr>${d.requests.map((r) => `<tr><td class="small nowrap">${fmtTs(r.createdAt)}</td><td>${esc(r.name)} <span class="small muted">${esc(r.aid)}</span></td><td>${esc(r.type)}</td><td class="small">${esc(r.text) || '–'}</td><td><span class="pill ${r.status === 'offen' ? 'warn-pill' : 'ok-pill'}">${esc(r.status)}</span>${r.handledBy ? `<div class="small muted">${esc(r.handledBy)}</div>` : ''}</td><td>${m && r.status === 'offen' ? `<button class="btn sm" data-act="req-done" data-id="${r.id}">Erledigt</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="muted">Keine Anfragen.</p>'}
   <p class="small muted">Auskunft: Athlet:innen können ihre Daten selbst in der Akte (Reiter „Daten &amp; Einwilligungen“) herunterladen.</p></div>
  <div class="panel scroll" style="margin-top:14px"><h3>Aufbewahrung und Löschung je Kategorie</h3><p class="small muted">Keine unbegrenzte Athletenakte. Die Fristen legt die DSB mit Medizin, Rechtsberatung und Trägern fest. Gelöscht wird in der Akte unter „Akte löschen“.</p>
   <form data-form="retention"><table><tr><th>Kategorie</th><th>Frist</th><th>Festlegung durch</th></tr>${d.retention.map((r, i) => `<tr><td>${esc(r.cat)}</td><td><input type="text" name="r${i}" data-cat="${esc(r.cat)}" value="${esc(r.period)}" placeholder="noch festzulegen" maxlength="100" ${m ? '' : 'readonly'}></td><td class="small">${esc(r.owner)}</td></tr>`).join('')}</table>${m ? '<button class="btn sm primary" style="margin-top:8px">Fristen speichern</button>' : ''}</form></div>
  <h2 style="margin:22px 0 8px">Zugriffsprotokoll</h2>` + await auditPanel();
}

registerView('datenschutz', { title: 'Datenschutz & Audit', guard: () => can('privacy.manage') || can('audit.view'), render: datenschutzHtml });
registerNav({ id: 'datenschutz', label: 'Datenschutz & Audit', view: 'datenschutz', order: 70, show: () => can('privacy.manage') });
cockpits.push({ match: (s) => s.user.role === 'datenschutz', render: () => datenschutzHtml() });

changes['dpia-toggle'] = async (el) => { await put(`/api/privacy/dpia/${el.dataset.id}`, { done: el.checked }); toast('Gespeichert.'); };
actions['rights-review'] = async (el) => { await post(`/api/privacy/rights-review/${el.dataset.role}`, {}); toast('Rechteprüfung festgehalten.'); await window.__lsa.rerender(); };
actions['req-done'] = async (el) => { await put(`/api/privacy/requests/${el.dataset.id}`, {}); toast('Als erledigt markiert.'); await window.__lsa.rerender(); };
forms.retention = async (f) => {
  const periods = {};
  f.querySelectorAll('input[data-cat]').forEach((i) => { periods[i.dataset.cat] = i.value; });
  await put('/api/privacy/retention', { periods });
  toast('Fristen gespeichert.');
  await window.__lsa.rerender();
};
