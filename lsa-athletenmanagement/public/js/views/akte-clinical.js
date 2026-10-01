// Akten-Reiter "Gesundheit", "Wohlbefinden & Psychologie" und "Schule"
import { esc, fmt, fmtS, wd, dayDiff, TODAY, nl2br, fmtTs } from '../util.js';
import { get, post, put, del } from '../api.js';
import { actions, forms, changes, toast, showModal, closeModal, confirmDialog, options } from '../ui.js';
import { state } from '../state.js';
import { tabContent, cur, levelPill } from './akte.js';
import { ampel, statusCard, rtpStepper } from './athlete-common.js';

const cat = () => state.meta.catalog;
const aidQ = () => encodeURIComponent(cur.id);

// ============================================================ Gesundheit
export function injuryFormHtml({ athletes = null, aid = '' } = {}) {
  const o = cat().injuryOptions, st = cat().status;
  return `<form class="panel" data-form="injury-add" style="margin-top:14px"><h3>Neue Verletzung oder Erkrankung erfassen</h3>
    <div class="fgrid c4">
      ${athletes ? `<div class="f"><label>Athlet:in</label><select name="aid">${options(athletes.map((a) => [a.id, a.name]), aid)}</select></div>` : ''}
      <div class="f"><label>Datum des Auftretens</label><input type="date" name="date" value="${TODAY}" max="${TODAY}" required></div>
      <div class="f"><label>Art</label><select name="kind">${options(o.kind)}</select></div>
      <div class="f"><label>Training oder Wettkampf</label><select name="setting">${options(o.setting)}</select></div>
      <div class="f"><label>Aktivität</label><input name="activity" maxlength="200"></div>
      <div class="f"><label>Körperregion</label><input name="region" required maxlength="100"></div>
      <div class="f"><label>Art der Beschwerden</label><input name="type" required maxlength="100" placeholder="z. B. Muskelverletzung, Infekt"></div>
      <div class="f"><label>Erstauftreten / Wiederverletzung</label><select name="first">${options(o.first)}</select></div>
      <div class="f"><label>Beginn</label><select name="onset">${options(o.onset)}</select></div>
      <div class="f"><label>Vermuteter Mechanismus</label><input name="mechanism" maxlength="200"></div>
      <div class="f"><label>Medizinische Diagnose</label><input name="diagnosis" required maxlength="300"></div>
      <div class="f"><label>Behandlung</label><input name="treat" maxlength="500"></div>
      <div class="f"><label>Medikation</label><input name="meds" maxlength="300"></div></div>
    <div class="fgrid c4"><div class="f"><label>Belastungsstatus setzen</label><select name="color" data-change="inj-color"><option value="keep">unverändert lassen</option>${['gelb', 'orange', 'rot'].map((k) => `<option value="${k}" ${k === 'orange' ? '' : ''}>${esc(st[k])} – ${esc(cat().statusMean[k])}</option>`).join('')}</select></div>
    <div class="f"><label>Erlaubt</label><input name="allowed" maxlength="300"></div><div class="f"><label>Nicht erlaubt</label><input name="restricted" maxlength="300"></div><div class="f"><label>Kontrolltermin</label><input type="date" name="next"></div></div>
    <div class="err" data-err></div><button class="btn primary">Erfassen</button> <span class="small muted">Bei Gelb/Orange/Rot sind „Nicht erlaubt“ und Kontrolltermin Pflicht. Trainer sehen danach nur den neuen Belastungsstatus.</span></form>`;
}

function injuryBlock(i, h) {
  return `<div style="border-bottom:1px solid var(--line);padding:10px 0">
    <div class="row" style="justify-content:space-between"><b>${esc(i.diagnosis)}</b><span class="pill">${i.closed ? 'abgeschlossen' : 'offen'}</span></div>
    <dl class="kv small" style="margin-top:6px"><dt>Auftreten</dt><dd>${fmt(i.date)}, ${esc(i.setting)}${i.activity ? ', ' + esc(i.activity) : ''}</dd><dt>Region / Art</dt><dd>${esc(i.region)} · ${esc(i.type)} (${esc(i.kind)})</dd>
    <dt>Verlauf</dt><dd>${esc(i.first)}, ${esc(i.onset)}${i.mechanism ? ', Mechanismus: ' + esc(i.mechanism) : ''}</dd><dt>Behandlung</dt><dd>${esc(i.treat) || '–'}</dd>
    ${i.meds !== undefined ? `<dt>Medikation</dt><dd>${esc(i.meds) || '–'}</dd><dt>Labor</dt><dd>${esc(i.labs) || '–'}</dd>` : ''}
    <dt>Ausfall-/Einschränkungstage</dt><dd>${i.daysLost}</dd><dt>Rückkehr ins Training</dt><dd>${fmt(i.returnDate)}</dd><dt>Frühere Leistung erreicht</dt><dd>${fmt(i.fullDate)}</dd></dl>
    ${rtpStepper(i.rtp)}
    ${!i.closed && (h.canRtp || h.canWriteInjury) ? `<div class="row" style="margin-top:8px">${h.canRtp ? `<button class="btn sm" data-act="rtp" data-i="${i.id}" data-d="-1">Stufe zurück</button><button class="btn sm primary" data-act="rtp" data-i="${i.id}" data-d="1">Nächste Stufe</button>` : ''}${h.canWriteInjury ? `<button class="btn sm" data-act="inj-close" data-i="${i.id}">Abschließen (frühere Leistung erreicht)</button>` : ''}</div>` : ''}
    ${h.canWriteInjury ? `<div class="row" style="margin-top:6px"><button class="btn link sm" data-act="inj-edit" data-i="${i.id}">Eintrag bearbeiten</button><button class="btn link sm" data-act="inj-del" data-i="${i.id}">löschen</button></div>` : ''}</div>`;
}

tabContent.health = async (c) => {
  const h = await get(`/api/athletes/${aidQ()}/health`);
  cur.health = h;
  const lvl = h.level;
  let out = `<div class="note">Ihre Zugriffsstufe: ${levelPill('health')}${lvl === 'status' ? ' Diagnosen, Befunde und Medikation bleiben in der medizinischen Akte. Sichtbar sind nur handlungsrelevante Angaben.' : ''}</div>
    <div class="panel"><h3>Belastungsstatus</h3>${statusCard(h.status, { note: ['status'].includes(lvl) ? ' Keine Diagnose sichtbar.' : '' })}</div>`;
  if (h.canSetStatus) {
    const st = h.status;
    out += `<form class="panel" data-form="status-set" style="margin-top:14px"><h3>Belastungsstatus festlegen</h3><div class="fgrid c4">
      <div class="f"><label>Status</label><select name="color">${Object.keys(cat().status).map((k) => `<option value="${k}" ${st.color === k ? 'selected' : ''}>${esc(cat().status[k])} – ${esc(cat().statusMean[k])}</option>`).join('')}</select></div>
      <div class="f"><label>Erlaubte Belastungen</label><input name="allowed" maxlength="300" value="${esc(st.allowed)}"></div><div class="f"><label>Nicht erlaubt</label><input name="restricted" maxlength="300" value="${esc(st.restricted)}"></div><div class="f"><label>Nächste Kontrolle</label><input type="date" name="next" value="${esc(st.next)}"></div></div>
      <div class="err" data-err></div><button class="btn primary">Status speichern</button> <span class="small muted">Bei Gelb, Orange und Rot sind Verbotenes und Kontrolltermin Pflicht.</span>
      ${h.history?.length ? `<details style="margin-top:10px"><summary>Verlauf der letzten Änderungen</summary><table class="small"><tr><th>Zeit</th><th>Status</th><th>Nicht erlaubt</th><th>Kontrolle</th><th>Von</th></tr>${h.history.map((x) => `<tr><td>${fmtTs(x.ts)}</td><td>${ampel(x.color)}</td><td>${esc(x.restricted) || '–'}</td><td>${fmt(x.next)}</td><td>${esc(x.by)}</td></tr>`).join('')}</table></details>` : ''}</form>`;
  }
  if (h.injuries) {
    out += `<div class="panel" style="margin-top:14px"><h3>${lvl === 'own' ? 'Meine Verletzungen und Erkrankungen' : 'Verletzungen und Erkrankungen'}</h3>${h.injuries.length ? h.injuries.map((i) => injuryBlock(i, h)).join('') : '<p class="muted">Keine Einträge.</p>'}
      <p class="small muted">Das Abschlussdatum ist nicht der Tag der medizinischen Freigabe. Dokumentiert wird zusätzlich, wann die frühere Leistungsfähigkeit wieder erreicht ist.</p></div>`;
  }
  if (h.cycle) {
    out += `<div class="panel" style="margin-top:14px"><h3>Athletinnengesundheit (freiwillig)</h3>${h.cycle.consent ? (lvl === 'full'
      ? `<form data-form="cycle-save"><textarea name="note" maxlength="1000">${esc(h.cycle.note)}</textarea><button class="btn sm primary" style="margin-top:6px">Speichern</button></form>` : `<p>${nl2br(h.cycle.note) || '<span class="muted">Keine Notiz.</span>'}</p>`)
      : '<p class="muted">Keine Einwilligung erteilt. Es werden keine Zyklusdaten erfasst.</p>'}
    <div class="note warn" style="margin-bottom:0">Zyklusdaten werden nie verwendet für Kaderselektion, Vertragsentscheidungen, Leistungsrankings, Gruppenvergleiche oder die direkte Interpretation durch ungeschulte Trainer.</div></div>`;
  }
  if (h.canWriteInjury) out += injuryFormHtml();
  return out;
};
changes['inj-color'] = () => {};
forms['status-set'] = async (f, v) => { await post(`/api/athletes/${aidQ()}/status`, { color: v.color, allowed: v.allowed, restricted: v.restricted, next: v.next }); toast('Belastungsstatus gespeichert. Trainer sehen nur Status, Erlaubtes, Verbotenes und Kontrolltermin.'); await window.__lsa.rerender(); };
forms['cycle-save'] = async (f, v) => { await put(`/api/athletes/${aidQ()}/cycle`, { note: v.note }); toast('Gespeichert.'); await window.__lsa.rerender(); };
forms['injury-add'] = async (f, v) => {
  const aid = v.aid || cur.id;
  await post(`/api/athletes/${encodeURIComponent(aid)}/injuries`, { ...v, aid: undefined });
  toast('Erfasst. Trainer sehen nur den neuen Belastungsstatus.');
  f.reset();
  await window.__lsa.rerender();
};
actions.rtp = async (el) => { await put(`/api/injuries/${el.dataset.i}/rtp`, { delta: Number(el.dataset.d) }); await window.__lsa.rerender(); };
actions['inj-close'] = async (el) => {
  if (!(await confirmDialog('Fall abschließen („frühere Leistungsfähigkeit wieder erreicht“)? Der Belastungsstatus wird dabei nicht automatisch geändert.', { ok: 'Abschließen' }))) return;
  await post(`/api/injuries/${el.dataset.i}/close`, {}); toast('Abgeschlossen. Belastungsstatus bitte separat prüfen.'); await window.__lsa.rerender();
};
actions['inj-del'] = async (el) => {
  if (!(await confirmDialog('Diesen Verletzungseintrag löschen?', { ok: 'Löschen', danger: true }))) return;
  await del(`/api/injuries/${el.dataset.i}`); await window.__lsa.rerender();
};
actions['inj-edit'] = (el) => {
  const i = cur.health.injuries.find((x) => x.id === Number(el.dataset.i)), o = cat().injuryOptions;
  showModal(`<h2>Eintrag bearbeiten</h2><form data-form="inj-save" data-i="${i.id}"><div class="fgrid c2">
    <div class="f"><label>Datum</label><input type="date" name="date" value="${esc(i.date)}" max="${TODAY}" required></div><div class="f"><label>Art</label><select name="kind">${options(o.kind, i.kind)}</select></div>
    <div class="f"><label>Umfeld</label><select name="setting">${options(o.setting, i.setting)}</select></div><div class="f"><label>Aktivität</label><input name="activity" value="${esc(i.activity)}"></div>
    <div class="f"><label>Körperregion</label><input name="region" value="${esc(i.region)}" required></div><div class="f"><label>Art der Beschwerden</label><input name="type" value="${esc(i.type)}" required></div>
    <div class="f"><label>Erst/Wieder</label><select name="first">${options(o.first, i.first)}</select></div><div class="f"><label>Beginn</label><select name="onset">${options(o.onset, i.onset)}</select></div>
    <div class="f"><label>Mechanismus</label><input name="mechanism" value="${esc(i.mechanism)}"></div><div class="f"><label>Diagnose</label><input name="diagnosis" value="${esc(i.diagnosis)}" required></div>
    <div class="f"><label>Behandlung</label><input name="treat" value="${esc(i.treat)}"></div><div class="f"><label>Medikation</label><input name="meds" value="${esc(i.meds || '')}"></div></div>
    <div class="f"><label>Labor / Befunde</label><input name="labs" value="${esc(i.labs || '')}"></div>
    <div class="err" data-err></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="dlg-cancel">Abbrechen</button><button class="btn primary">Speichern</button></div></form>`, { wide: true });
};
forms['inj-save'] = async (f, v) => { await put(`/api/injuries/${f.dataset.i}`, v); closeModal(); toast('Gespeichert.'); await window.__lsa.rerender(); };

// ============================================================ Psychologie
tabContent.psych = async (c) => {
  const p = await get(`/api/athletes/${aidQ()}/psych`);
  const lvl = p.level;
  const rel = p.released.length ? p.released.map((x) => `<div class="note">${esc(x.text)}<div class="small muted">freigegeben von der Athlet:in, übermittelt ${fmt(x.date)} durch ${esc(x.by)}${lvl === 'full' ? ` <button class="btn link sm" data-act="hint-del" data-id="${x.id}">zurückziehen</button>` : ''}</div></div>`).join('') : '<p class="muted">Keine freigegebenen Handlungshinweise.</p>';
  if (lvl === 'released') return `<div class="panel"><h3>Freigegebene Handlungshinweise</h3>${rel}</div><div class="note">Ihre Zugriffsstufe: ${levelPill('psych')} Diagnosen, Gesprächsinhalte und private Hintergründe sind für diese Rolle nicht sichtbar.</div>`;
  if (lvl === 'own') {
    return `<div class="panel"><h3>Hinweise, die du freigegeben hast</h3>${rel}</div>
      <div class="panel" style="margin-top:14px"><h3>Vertrauliches Gespräch</h3><p>Die Anfrage geht nur an die Sportpsychologie. Trainer und Koordination sehen sie nicht.</p>
      ${p.openRequest ? '<p class="pill ok-pill">Deine Anfrage ist bei der Sportpsychologie eingegangen.</p>' : '<button class="btn primary" data-act="contact-req">Gespräch anfragen</button>'}
      <div class="note bad">Bei akuter Gefahr: Notruf 144. Das Monitoring ersetzt keine Notfallhilfe.</div></div>`;
  }
  return `<div class="note sig">Geschützter Beratungsbereich. Inhalte verlassen diesen Bereich nur als Handlungshinweis mit Freigabe der Athlet:in.</div>
  <div class="grid g2"><div class="panel"><h3>Gesprächsnotizen (vertraulich)</h3>${p.notes.map((n) => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="small muted">${fmt(n.date)} · ${esc(n.author)} <button class="btn link sm" data-act="note-del" data-id="${n.id}">löschen</button></div>${nl2br(n.text)}</div>`).join('') || '<p class="muted">Keine Notizen.</p>'}
    <form data-form="psych-note" style="margin-top:10px"><textarea name="text" required maxlength="5000" placeholder="Neue Notiz"></textarea><div class="err" data-err></div><button class="btn sm primary">Notiz speichern</button></form></div>
  <div class="panel"><h3>Handlungshinweis an Trainer und Koordination</h3>${rel}
    <form data-form="psych-hint" style="margin-top:10px"><div class="f"><label>Hinweis (ohne Diagnose, ohne Gesprächsinhalt)</label><textarea name="text" required maxlength="500" placeholder="z. B. Aktuell keine zusätzlichen Abendtermine."></textarea></div>
    <label class="chk"><input type="checkbox" name="consent" required> Die Athlet:in hat der Weitergabe dieses Hinweises zugestimmt.</label><div class="err" data-err></div><div><button class="btn sm primary" style="margin-top:6px">Hinweis freigeben</button></div></form></div></div>`;
};
forms['psych-note'] = async (f, v) => { await post(`/api/athletes/${aidQ()}/psych/notes`, { text: v.text }); toast('Notiz gespeichert.'); await window.__lsa.rerender(); };
forms['psych-hint'] = async (f, v) => { await post(`/api/athletes/${aidQ()}/psych/hints`, { text: v.text, consent: !!v.consent }); toast('Hinweis freigegeben. Trainer und Koordination sehen nur diesen Text.'); await window.__lsa.rerender(); };
actions['note-del'] = async (el) => { if (!(await confirmDialog('Diese Notiz löschen?', { ok: 'Löschen', danger: true }))) return; await del(`/api/psych/notes/${el.dataset.id}`); await window.__lsa.rerender(); };
actions['hint-del'] = async (el) => { if (!(await confirmDialog('Diesen Hinweis zurückziehen? Trainer und Koordination sehen ihn danach nicht mehr.', { ok: 'Zurückziehen' }))) return; await del(`/api/psych/hints/${el.dataset.id}`); await window.__lsa.rerender(); };
actions['contact-req'] = async () => { await post(`/api/athletes/${aidQ()}/contact-request`, {}); toast('Anfrage an die Sportpsychologie gesendet. Nur sie sieht die Anfrage.'); await window.__lsa.rerender(); };

// ============================================================ Schule
tabContent.school = async (c) => {
  const s = await get(`/api/athletes/${aidQ()}/school`);
  const a = c.data.athlete;
  const rows = [...s.exams.map((x) => ({ date: x.date, t: 'Schule: ' + x.subject, id: x.id })), ...s.events.map((e) => ({ date: e.date, t: e.type + ': ' + e.title }))].sort((x, y) => x.date.localeCompare(y.date));
  let h = `<div class="grid g2"><div class="panel"><h3>Prüfungen und Sporttermine</h3>${rows.length ? `<table>${rows.map((x) => `<tr><td class="nowrap">${wd(x.date)} ${fmtS(x.date)}</td><td>${esc(x.t)}</td><td>${x.id && s.canWrite ? `<button class="btn sm" data-act="exam-del" data-id="${x.id}">✕</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="muted">Keine Termine.</p>'}
    ${s.conflicts.length ? `<div class="note warn">Schulische und sportliche Spitze liegen eng beieinander: ${s.conflicts.map((k) => `${esc(k.exam.subject)} am ${fmtS(k.exam.date)} (${esc(k.event.title)} am ${fmtS(k.event.date)})`).join('; ')}.</div>` : ''}</div>`;
  if (s.level === 'planning') return h + `<div class="panel"><h3>Planungsdaten</h3><p class="muted">Ihre Zugriffsstufe: ${levelPill('school')} Diese Rolle sieht nur Termine, keine Noten oder Fehlstunden.</p></div></div>`;
  h += `<div class="panel"><h3>Schulstatus</h3><dl class="kv"><dt>Schule, Klasse</dt><dd>${esc(a.school) || '–'}${a.schoolClass ? ', ' + esc(a.schoolClass) : ''}</dd><dt>Bildungsziel</dt><dd>${esc(a.eduGoal) || '–'}</dd>
    <dt>Fehlstunden (Semester)</dt><dd>${s.status.absences}</dd><dt>Notentrend</dt><dd class="${s.status.trend === 'fallend' ? 'warn' : ''}">${esc(s.status.trend)}</dd></dl>
    ${s.canWrite ? `<form data-form="school-save" class="fgrid c3" style="margin-top:12px"><div class="f"><label>Fehlstunden</label><input type="number" name="absences" min="0" value="${s.status.absences}" required></div><div class="f"><label>Notentrend</label><select name="trend">${options(cat().schoolTrends, s.status.trend)}</select></div><div class="f"><label>&nbsp;</label><button class="btn sm primary">Schulstatus speichern</button></div></form>
      <form data-form="exam-add" class="fgrid c3" style="margin-top:8px"><div class="f"><label>Prüfung / Fach</label><input name="subject" required maxlength="100"></div><div class="f"><label>Datum</label><input type="date" name="date" required></div><div class="f"><label>&nbsp;</label><button class="btn sm primary">Prüfung eintragen</button></div><div class="err" data-err style="grid-column:1/-1"></div></form>` : ''}</div></div>`;
  return h;
};
forms['school-save'] = async (f, v) => { await put(`/api/athletes/${aidQ()}/school`, { absences: Number(v.absences), trend: v.trend }); toast('Gespeichert.'); await window.__lsa.rerender(); };
forms['exam-add'] = async (f, v) => { await post(`/api/athletes/${aidQ()}/exams`, { subject: v.subject, date: v.date }); toast('Prüfung eingetragen.'); await window.__lsa.rerender(); };
actions['exam-del'] = async (el) => { await del(`/api/exams/${el.dataset.id}`); await window.__lsa.rerender(); };
