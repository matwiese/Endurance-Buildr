// Hinweise & Eskalation: Regeln erzeugen Prüfaufträge, keine Diagnosen
import { esc, fmt, dayDiff } from '../util.js';
import { get, put } from '../api.js';
import { forms, toast, head } from '../ui.js';
import { state, registerView, registerNav, can } from '../state.js';

export const catTag = (c) => ({ perf: '<span class="pill tag-perf">Performance</span>', health: '<span class="pill tag-health">Gesundheit</span>', well: '<span class="pill tag-well">Wohlbefinden</span>', school: '<span class="pill tag-school">Schule</span>', conf: '<span class="pill tag-conf">vertraulich</span>' }[c] || '');

// compact: Kurzliste für Cockpits; sonst mit Bearbeitungsformular (alerts.edit)
export function alertList(list, { compact = false, canEdit = false, stages } = {}) {
  if (!list.length) return '<p class="muted">Keine offenen Hinweise.</p>';
  const cat = state.meta.catalog;
  const st = stages || cat.stages;
  return list.map((al) => `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row" style="justify-content:space-between"><div><b>${esc(al.athleteName || al.athleteId)}</b> · ${esc(al.trigger)}</div><div class="row">${catTag(al.cat)}<span class="pill">Stufe ${al.stage}: ${esc(st[al.stage])}</span><span class="pill">${esc(al.status)}</span></div></div>
    <div class="small muted">Erzeugt ${fmt(al.created)} · verantwortlich ${esc(al.resp)} · Kontrolle ${fmt(al.control)}${al.control && dayDiff(al.control) < 0 && al.status !== 'erledigt' ? ' <span class="bad">überfällig</span>' : ''}</div>
    ${al.note ? `<div class="small">Notiz: ${esc(al.note)}</div>` : ''}
    ${!compact && canEdit && al.status !== 'erledigt' ? `<form data-form="alert" data-id="${al.id}" class="fgrid c4" style="margin-top:8px">
      <div class="f"><label>Stufe</label><select name="stage">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${al.stage === n ? 'selected' : ''}>${n} ${esc(st[n])}</option>`).join('')}</select></div>
      <div class="f"><label>Verantwortlich</label><input name="resp" value="${esc(al.resp)}" required maxlength="150"></div>
      <div class="f"><label>Kontrolltermin</label><input type="date" name="control" value="${esc(al.control)}" required></div>
      <div class="f"><label>Notiz</label><input name="note" value="${esc(al.note)}" maxlength="500"></div>
      <div class="row"><button class="btn sm primary" name="do" value="save">Aktualisieren</button><button class="btn sm" name="do" value="close">Abschließen</button></div></form>` : ''}</div>`).join('');
}

registerView('hinweise', {
  title: 'Hinweise & Eskalation',
  guard: () => can('alerts.view'),
  async render() {
    const d = await get('/api/alerts');
    const open = d.alerts.filter((a) => a.status !== 'erledigt'), done = d.alerts.filter((a) => a.status === 'erledigt');
    const acute = open.filter((a) => a.stage === 5);
    const cat = state.meta.catalog;
    return head('Hinweise & Eskalation', 'Automatische Regeln erzeugen keine Diagnosen. Sie lösen eine menschliche Prüfung aus. Jede Eskalation hat eine verantwortliche Person und einen Kontrolltermin.')
      + (acute.length ? `<div class="note bad"><b>Akutprozess aktiv (${acute.length}).</b> Wird außerhalb des Trainer-Dashboards über die Notfallkette bearbeitet.</div>` : '')
      + `<div class="panel" style="margin-bottom:14px"><h3>Eskalationsstufen</h3><div class="stepper">${[1, 2, 3, 4, 5].map((n) => `<div><b>${n} ${esc(cat.stages[n])}</b><br>${esc(cat.stageText[n])}</div>`).join('')}</div>
      <p class="small muted" style="margin-top:8px">Auslöser: akuter Schmerz, Krankheitssymptome, mehrere Tage reduzierte Trainingsbereitschaft, Rückgang Wohlbefinden, wiederholtes Fernbleiben ohne Grund, starke Belastungsänderung (> +30 %), Wunsch nach vertraulichem Gespräch. Welche Hinweise Sie sehen, hängt von Ihrer Rolle ab.</p></div>
      <div class="panel"><h3>Offen (${open.length})</h3>${alertList(open, { canEdit: d.canEdit })}</div>
      <details class="panel" style="margin-top:14px"><summary>Erledigt (${done.length})</summary>${alertList(done, { compact: true })}</details>`;
  },
});

forms.alert = async (f, v, e) => {
  const close = e.submitter?.value === 'close';
  const r = await put(`/api/alerts/${f.dataset.id}`, { stage: v.stage, resp: v.resp, control: v.control, note: v.note, close });
  toast(r.status === 'Akutprozess' ? 'Akutprozess gestartet: Notfallkette außerhalb des Trainer-Dashboards.' : close ? 'Hinweis abgeschlossen.' : 'Hinweis aktualisiert.');
  await window.__lsa.rerender();
};

registerNav({ id: 'hinweise', label: 'Hinweise & Eskalation', view: 'hinweise', order: 30, show: () => can('alerts.view'), badge: () => state.alertCount || '' });
