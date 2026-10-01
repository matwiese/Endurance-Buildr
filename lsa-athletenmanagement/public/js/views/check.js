// Tages-Check der Athlet:in (30–60 Sekunden) und Session-RPE
import { esc, fmt, wd, fmtS } from '../util.js';
import { get, post, put } from '../api.js';
import { forms, toast, head } from '../ui.js';
import { state, registerView, registerNav, can } from '../state.js';

registerView('check', {
  title: 'Tages-Check',
  guard: (s) => s.permissions.features['checkin.self'] && s.user.role === 'athlet',
  async render() {
    const d = await get('/api/checkin');
    const e = d.entry;
    const scale = ([k, l, hint]) => `<div class="qrow"><div><b>${esc(l)}</b><div class="small muted">${esc(hint)}</div></div><div class="scale" role="radiogroup" aria-label="${esc(l)}">${[1, 2, 3, 4, 5].map((v) => `<label><input type="radio" name="${k}" value="${v}" ${e && e[k] === v ? 'checked' : ''} required><span>${v}</span></label>`).join('')}</div></div>`;
    const rpe = d.pendingRpe.length ? `<div class="panel" style="max-width:820px;margin-bottom:14px"><h3>Wie anstrengend war dein Training?</h3><p class="small muted">Session-RPE: 0 = Ruhe, 10 = maximal anstrengend. Du gibst sie nach der Einheit selbst an.</p>
      ${d.pendingRpe.map((s) => `<form class="row" data-form="rpe" data-id="${s.id}" style="margin:6px 0"><span style="min-width:170px">${wd(s.date)} ${fmtS(s.date)} · ${esc(s.title)}</span><input type="number" name="rpe" min="0" max="10" step="0.5" required style="width:90px" aria-label="Session-RPE"><button class="btn sm primary">Speichern</button></form>`).join('')}</div>` : '';
    return head('Tages-Check', 'Dauert 30 bis 60 Sekunden. Beantworte ehrlich – deine Angaben dienen der Trainingssteuerung, nicht der Bewertung.', e ? '<span class="pill ok-pill">Heute bereits ausgefüllt – du kannst ändern</span>' : '') + rpe + `
    <form class="panel" data-form="check" style="max-width:820px">
      ${d.items.map(scale).join('')}
      <div class="fgrid c3" style="margin-top:12px"><div class="f"><label for="sh">Schlafdauer (Stunden)</label><input id="sh" type="number" name="sleepH" min="0" max="16" step="0.5" value="${e && e.sleepH != null ? e.sleepH : ''}"></div>
      <div class="f"><label>Akute Schmerzen</label><select name="pain"><option value="">nein</option><option value="1" ${e && e.pain ? 'selected' : ''}>ja</option></select></div>
      <div class="f"><label>Krankheitssymptome</label><select name="symptoms"><option value="">nein</option><option value="1" ${e && e.symptoms ? 'selected' : ''}>ja</option></select></div></div>
      <div class="f"><label>Kommentar (optional)</label><input type="text" name="comment" maxlength="300" value="${esc(e ? e.comment : '')}"></div>
      <label class="chk"><input type="checkbox" name="contact"> Ich möchte ein vertrauliches Gespräch mit der Sportpsychologie. (Geht nur an die Sportpsychologie.)</label>
      <div class="err" data-err></div>
      <button class="btn primary">Tages-Check speichern</button>
      <div class="note bad" style="margin-top:14px"><b>Monitoring ist kein Notfallweg.</b> Bei akuten Beschwerden oder Verletzung sofort Trainer oder Sportmedizin informieren. Bei akuter Gefahr: Notruf 144.</div></form>`;
  },
});

forms.check = async (f, v) => {
  const r = await post('/api/checkin', { sleepQ: v.sleepQ, recovery: v.recovery, soreness: v.soreness, fatigue: v.fatigue, stress: v.stress, ready: v.ready,
    sleepH: v.sleepH, pain: v.pain === '1', symptoms: v.symptoms === '1', comment: v.comment, contact: !!v.contact });
  toast('Tages-Check gespeichert.' + (r.alertsCreated ? ` ${r.alertsCreated} Hinweis(e) zur menschlichen Prüfung erzeugt.` : ''));
  window.__lsa.go('start');
};
forms.rpe = async (f, v) => { await put(`/api/training/${f.dataset.id}/rpe`, { rpe: v.rpe }); toast('Danke, gespeichert.'); await window.__lsa.rerender(); };

registerNav({ id: 'check', label: 'Tages-Check', view: 'check', order: 20, show: (s) => s.user.role === 'athlet' && s.permissions.features['checkin.self'] });
