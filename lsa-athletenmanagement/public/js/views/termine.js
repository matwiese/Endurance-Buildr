// Termine: Wettkämpfe, Reisen, Tests (gemeinsamer Kalender)
import { esc, fmt, wd, TODAY, dayDiff } from '../util.js';
import { get, post, put, del } from '../api.js';
import { actions, forms, toast, head, options, confirmDialog } from '../ui.js';
import { registerView, registerNav, state } from '../state.js';

let editId = null;

registerView('termine', {
  title: 'Termine',
  async render() {
    const d = await get('/api/events');
    const types = d.types;
    const sportOpts = [...(d.allSports ? [['', 'alle Sportarten']] : []), ...d.sports.map((s) => [s, s])];
    const e = editId ? d.events.find((x) => x.id === editId) : null;
    const byMonth = {};
    for (const ev of d.events) (byMonth[ev.date.slice(0, 7)] ||= []).push(ev);
    const form = d.canManage ? `<form class="panel" data-form="event-save" style="margin-bottom:14px"><h3>${e ? 'Termin ändern' : 'Termin anlegen'}</h3>
      <div class="fgrid c4"><div class="f"><label>Datum</label><input type="date" name="date" required value="${esc(e?.date || '')}"></div>
      <div class="f"><label>Titel</label><input name="title" required maxlength="150" value="${esc(e?.title || '')}" placeholder="z. B. Hallenmeeting Linz"></div>
      <div class="f"><label>Art</label><select name="type">${options(types, e?.type || 'Wettkampf')}</select></div>
      <div class="f"><label>Sportart</label><select name="sport">${options(sportOpts, e ? e.sport : sportOpts[0]?.[0])}</select></div></div>
      <div class="f"><label>Notiz</label><input name="note" maxlength="500" value="${esc(e?.note || '')}"></div>
      <div class="err" data-err></div><div class="row"><button class="btn primary">${e ? 'Speichern' : 'Termin anlegen'}</button>${e ? '<button type="button" class="btn" data-act="event-cancel">Abbrechen</button>' : ''}</div></form>` : '';
    return head('Termine', 'Wettkämpfe, Reisen, Tests und andere Termine für Ihre Sportarten. Schulische Prüfungen kommen aus dem Reiter „Schule“.') + form + `
      <div class="panel">${d.events.length ? Object.entries(byMonth).map(([m, evs]) => `<h3 style="margin:10px 0 4px">${new Date(m + '-01').toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })}</h3><table>
        ${evs.map((ev) => `<tr><td style="width:100px" class="nowrap">${wd(ev.date)} ${fmt(ev.date).slice(0, 6)}</td><td><b>${esc(ev.title)}</b>${ev.note ? `<div class="small muted">${esc(ev.note)}</div>` : ''}</td><td><span class="pill">${esc(ev.type)}</span></td><td class="small">${esc(ev.sport || 'alle Sportarten')}</td>
        <td class="small ${dayDiff(ev.date) < 0 ? 'muted' : ''}">${dayDiff(ev.date) === 0 ? 'heute' : dayDiff(ev.date) > 0 ? 'in ' + dayDiff(ev.date) + ' Tagen' : 'vorbei'}</td>
        <td class="nowrap">${d.canManage ? `<button class="btn sm" data-act="event-edit" data-id="${ev.id}">Bearbeiten</button> <button class="btn sm" data-act="event-del" data-id="${ev.id}">Löschen</button>` : ''}</td></tr>`).join('')}</table>`).join('') : '<div class="empty">Keine Termine in den nächsten Monaten.</div>'}</div>`;
  },
});
forms['event-save'] = async (f, v) => {
  const body = { date: v.date, title: v.title, type: v.type, sport: v.sport, note: v.note };
  if (editId) await put(`/api/events/${editId}`, body); else await post('/api/events', body);
  editId = null; toast('Gespeichert.'); await window.__lsa.rerender();
};
actions['event-edit'] = async (el) => { editId = Number(el.dataset.id); await window.__lsa.rerender(); window.scrollTo(0, 0); };
actions['event-cancel'] = async () => { editId = null; await window.__lsa.rerender(); };
actions['event-del'] = async (el) => {
  if (!(await confirmDialog('Diesen Termin löschen?', { ok: 'Löschen', danger: true }))) return;
  await del(`/api/events/${el.dataset.id}`); await window.__lsa.rerender();
};

registerNav({ id: 'termine', label: 'Termine', view: 'termine', order: 40, show: (s) => s.user.role !== 'athlet' && (s.permissions.tabs.overview !== 'none' || s.permissions.features['events.manage']) });

// Kleine Terminliste für Cockpits
export function termineHtml(core, { types, athletesForExams } = {}) {
  const ev = core.events.filter((e) => dayDiff(e.date, core.today) >= 0 && dayDiff(e.date, core.today) <= 14 && (!types || types.includes(e.type)));
  const items = [...ev.map((e) => ({ date: e.date, title: e.title, type: e.type }))].sort((a, b) => a.date.localeCompare(b.date));
  return items.length ? `<table>${items.map((e) => `<tr><td style="width:90px">${wd(e.date)} ${fmt(e.date).slice(0, 6)}</td><td>${esc(e.title)}</td><td><span class="pill">${esc(e.type)}</span></td></tr>`).join('')}</table>` : '<p class="muted">Keine Termine.</p>';
}
