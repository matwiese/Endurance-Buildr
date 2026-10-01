// Trainingserfassung (Trainer:in): Einheiten planen und erfassen – Anwesenheit, Dauer, Session-RPE, Abweichungsgrund
import { esc, fmt, TODAY, addDays } from '../util.js';
import { get, post, del } from '../api.js';
import { actions, forms, changes, toast, head, options, confirmDialog } from '../ui.js';
import { registerView, registerNav, can } from '../state.js';

let day = TODAY;

registerView('training', {
  title: 'Trainingserfassung',
  guard: () => can('training.record'),
  async render() {
    const d = await get(`/api/training?date=${day}`);
    const list = d.athletes.filter((a) => a.sessions.length);
    return head('Trainingserfassung', 'Anwesenheit, Dauer und Abweichungen je Einheit. Die Session-RPE gibt normalerweise die Athlet:in nach der Einheit selbst an.',
      `<label class="small muted" for="td">Datum</label><input id="td" type="date" value="${esc(day)}" data-change="train-date" style="width:auto"><button class="btn sm" data-act="train-day" data-n="-1">‹</button><button class="btn sm" data-act="train-day" data-n="1">›</button><button class="btn sm" data-act="train-day" data-n="0">Heute</button>`) + `
    <details class="panel" ${list.length ? '' : 'open'} style="margin-bottom:14px"><summary>＋ Einheit planen oder nachtragen (${fmt(day)})</summary>
      <form data-form="train-plan" style="margin-top:10px"><div class="fgrid c3">
        <div class="f"><label>Titel</label><input name="title" value="Training" maxlength="100" required></div>
        <div class="f"><label>Geplante Dauer (min)</label><input name="plannedMin" type="number" min="0" max="300" value="90"></div>
        <div class="f"><label>Datum</label><input name="date" type="date" value="${esc(day)}" required></div></div>
        <div class="f"><label>Für wen?</label><div class="chk-grid">${d.athletes.map((a) => `<label class="chk"><input type="checkbox" name="athleteIds" value="${esc(a.id)}" checked> ${esc(a.name)} <span class="small muted">${esc(a.discipline)}</span></label>`).join('') || '<span class="muted">Keine Athlet:innen in Ihrem Bereich.</span>'}</div></div>
        <div class="err" data-err></div><button class="btn primary" ${d.athletes.length ? '' : 'disabled'}>Einheit anlegen</button></form></details>
    ${list.length ? `<form class="panel scroll" data-form="train-save"><table><tr><th>Athlet:in</th><th>Status der Einheit</th><th>Dauer (min)</th><th>Session-RPE (0–10)</th><th>Grund der Abweichung</th><th></th></tr>
    ${list.flatMap((a) => a.sessions.map((s) => `<tr><td><b>${esc(a.name)}</b><div class="small muted">${esc(s.title)}${s.plannedMin ? ' · geplant ' + s.plannedMin + ' min' : ''}</div></td>
      <td><select name="st_${s.id}">${options(d.statuses, s.status)}</select></td>
      <td><input type="number" name="du_${s.id}" min="0" max="300" value="${s.duration ?? ''}" style="width:80px"></td>
      <td><input type="number" name="rp_${s.id}" min="0" max="10" step="0.5" value="${s.rpe ?? ''}" style="width:70px"></td>
      <td><input type="text" name="re_${s.id}" maxlength="300" value="${esc(s.reason)}" placeholder="Pflicht bei Abweichung"></td>
      <td>${s.status === 'geplant' && s.duration == null && s.rpe == null ? `<button type="button" class="btn sm" data-act="train-del" data-id="${s.id}" title="Geplante Einheit löschen">✕</button>` : ''}</td></tr>`)).join('')}</table>
    <div class="err" data-err></div>
    <div class="row" style="margin-top:12px"><button class="btn primary">Einheiten speichern</button><span class="small muted">Leere Felder bleiben leer und werden nicht als 0 gespeichert.</span></div></form>`
    : '<div class="panel"><p class="muted">An diesem Tag ist keine Einheit geplant. Mit „Einheit planen“ legen Sie eine an.</p></div>'}`;
  },
});

changes['train-date'] = (el) => { if (el.value) { day = el.value; window.__lsa.rerender(); } };
actions['train-day'] = (el) => { const n = Number(el.dataset.n); day = n === 0 ? TODAY : addDays(n, day); window.__lsa.rerender(); };
forms['train-plan'] = async (f, v) => {
  const ids = [].concat(v.athleteIds || []);
  const r = await post('/api/training/plan', { date: v.date, title: v.title, plannedMin: v.plannedMin, athleteIds: ids });
  day = v.date;
  toast(`${r.created} Einheit(en) angelegt${r.skipped ? `, ${r.skipped} gab es schon` : ''}.`);
  await window.__lsa.rerender();
};
forms['train-save'] = async (f, v) => {
  const ids = [...f.querySelectorAll('select[name^=st_]')].map((s) => s.name.slice(3));
  const rows = ids.map((id) => ({ id: Number(id), status: v['st_' + id], duration: v['du_' + id], rpe: v['rp_' + id], reason: v['re_' + id] }));
  const r = await post('/api/training/day', { date: day, rows });
  toast(r.missingReason ? `${r.missingReason} Abweichung(en) ohne Grund gespeichert – bitte Grund ergänzen.` : `Gespeichert.${r.alertsCreated ? ` ${r.alertsCreated} Hinweis(e) zur menschlichen Prüfung erzeugt.` : ''}`, r.missingReason ? 'error' : '');
  await window.__lsa.rerender();
};
actions['train-del'] = async (el) => {
  if (!(await confirmDialog('Diese geplante Einheit löschen?', { ok: 'Löschen', danger: true }))) return;
  await del(`/api/training/${el.dataset.id}`);
  await window.__lsa.rerender();
};

registerNav({ id: 'training', label: 'Trainingserfassung', view: 'training', order: 20, show: () => can('training.record') });
