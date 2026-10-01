// Safeguarding: unabhängiger Meldeweg (Athlet:in) und eigener Fallbereich (Safeguarding Officer)
import { esc, fmt } from '../util.js';
import { get, post, put } from '../api.js';
import { forms, toast, head, options } from '../ui.js';
import { registerView, registerNav, can } from '../state.js';
import { ampel } from './athlete-common.js';
import { cockpits } from './start.js';

const STATUS = ['neu', 'in Bearbeitung', 'Schutzmaßnahme aktiv', 'an externe Stelle übergeben', 'abgeschlossen'];
let accessed = null;

async function safeguardingHtml() {
  if (can('safeguarding.report') && !can('safeguarding.cases')) {
    return head('Vertrauliche Meldung', 'Unabhängiger Meldeweg. Die Meldung geht nur an den Safeguarding Officer – nicht an Trainer, Koordination oder Leitung.') + `
    <form class="panel" data-form="safe-report" style="max-width:720px"><div class="f"><label>Was möchtest du melden?</label><textarea name="text" required maxlength="5000" style="min-height:120px"></textarea></div>
    <label class="chk"><input type="checkbox" name="anon" checked> Anonym melden (dein Name wird dann weder gespeichert noch protokolliert)</label><div class="err" data-err></div><div style="margin-top:10px"><button class="btn primary">Meldung absenden</button></div>
    <div class="note bad" style="margin-top:12px">Bei akuter Gefahr: Notruf 133 (Polizei) oder 144 (Rettung).</div></form>`;
  }
  const d = await get('/api/safeguarding/cases');
  const a = accessed;
  return head('Safeguarding', 'Eigener Fallbereich. Dokumentation außerhalb des Performance-Systems – im Echtbetrieb ein getrenntes System.') + `
  <div class="panel"><h3>Fälle</h3>${d.cases.map((c) => `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row" style="justify-content:space-between"><b>${esc(c.id)} · ${fmt(c.date)}</b><span class="pill">${esc(c.status)}</span></div><p>${esc(c.text)}</p>
   <div class="small muted">${c.anon ? 'anonyme Meldung' : 'Meldung mit Namen (' + esc(c.from || '–') + ')'} · Schritte: ${esc(c.steps) || '–'}</div>
   <form data-form="safe-update" data-id="${esc(c.id)}" class="fgrid c3" style="margin-top:6px"><div class="f"><label>Status</label><select name="status">${options(STATUS, c.status)}</select></div><div class="f"><label>Nächster Schritt</label><input name="steps" maxlength="2000" value="${esc(c.steps)}"></div><div class="f"><label>&nbsp;</label><button class="btn sm primary">Fall aktualisieren</button></div></form></div>`).join('') || '<p class="muted">Keine Fälle.</p>'}</div>
  <form class="panel" data-form="safe-access" style="margin-top:14px"><h3>Zugriff im Schutzfall</h3><p class="small muted">Auf Akteninformationen nur im Schutzfall, mit Begründung, minimal und protokolliert. Medizinische und psychologische Inhalte bleiben unzugänglich.</p>
   <div class="fgrid c3"><div class="f"><label>Athlet:in</label><select name="athleteId">${options(d.athletes.map((x) => [x.id, `${x.name} (${x.id})`]))}</select></div><div class="f"><label>Fall und Begründung</label><input name="why" required minlength="10" maxlength="300"></div><div class="f"><label>&nbsp;</label><button class="btn">Zugriff protokolliert öffnen</button></div></div><div class="err" data-err></div>
   ${a ? `<div class="note warn"><b>${esc(a.name)}</b> (${esc(a.id)}) · ${esc(a.group) || '–'} · ${esc(a.sport)}<br>Betreuung: ${a.team.map((t) => esc(t.function) + ' ' + esc(t.name)).join(', ') || '–'} · Internat ${a.boarding ? 'ja' : 'nein'}<br>Gesetzl. Vertretung: ${esc(a.guardian) || '–'} · Notfallkontakt: ${esc(a.emergency) || '–'}<br>Belastungsstatus: ${ampel(a.loadStatus)}</div>` : ''}</form>`;
}

registerView('safeguarding', { title: 'Safeguarding', guard: () => can('safeguarding.cases') || can('safeguarding.report'), render: safeguardingHtml });
registerNav({ id: 'safeguarding', label: 'Safeguarding', view: 'safeguarding', order: 75, show: (s) => s.permissions.features['safeguarding.cases'] || s.permissions.features['safeguarding.report'] });
cockpits.push({ match: (s) => s.user.role === 'safeguarding', render: () => safeguardingHtml() });

forms['safe-report'] = async (f, v) => { await post('/api/safeguarding/report', { text: v.text, anon: !!v.anon }); toast('Meldung eingegangen. Nur der Safeguarding Officer sieht sie.'); f.reset(); };
forms['safe-update'] = async (f, v) => { await put(`/api/safeguarding/cases/${encodeURIComponent(f.dataset.id)}`, { status: v.status, steps: v.steps }); toast('Fall aktualisiert.'); await window.__lsa.rerender(); };
forms['safe-access'] = async (f, v) => { accessed = (await post('/api/safeguarding/access', { athleteId: v.athleteId, why: v.why })).athlete; toast('Zugriff protokolliert.'); await window.__lsa.rerender(); };
