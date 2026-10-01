// Gemeinsame Bausteine für Athletenliste und Akte
import { esc, fmt, dayDiff } from '../util.js';
import { options } from '../ui.js';
import { state } from '../state.js';

export const statusPill = (s) => `<span class="pill ${s === 'aktiv' ? 'ok-pill' : s === 'ausgetreten' ? 'bad-pill' : 'warn-pill'}">${esc(s)}</span>`;

export function athleteFormFields(a = {}, { forEdit = false } = {}) {
  const c = state.meta.catalog, sports = state.session.sports;
  const v = (k) => esc(a[k] ?? '');
  return `
    <div class="fgrid c3">
      <div class="f"><label>Name</label><input name="name" required maxlength="100" value="${v('name')}"></div>
      <div class="f"><label>Geburtsdatum</label><input name="born" type="date" required value="${v('born')}"></div>
      <div class="f"><label>Geschlecht</label><select name="sex">${options(c.sex, a.sex || '–')}</select></div>
      <div class="f"><label>Sportart</label><select name="sport">${options(sports, a.sport || sports[0])}</select></div>
      <div class="f"><label>Disziplin</label><input name="discipline" maxlength="100" value="${v('discipline')}" placeholder="z. B. Sprint, Freistil"></div>
      <div class="f"><label>Trainingsgruppe</label><input name="group" maxlength="100" value="${v('group')}" placeholder="z. B. Sprint U18"></div>
      <div class="f"><label>Verein</label><input name="club" maxlength="100" value="${v('club')}"></div>
      <div class="f"><label>Verband</label><input name="federation" maxlength="60" value="${v('federation')}" placeholder="z. B. ÖLV, OSV"></div>
      <div class="f"><label>Kader</label><input name="kader" maxlength="100" value="${v('kader')}" placeholder="z. B. Nachwuchskader"></div>
      <div class="f"><label>Schule</label><input name="school" maxlength="150" value="${v('school')}"></div>
      <div class="f"><label>Klasse</label><input name="schoolClass" maxlength="30" value="${v('schoolClass')}"></div>
      <div class="f"><label>Bildungsziel</label><input name="eduGoal" maxlength="150" value="${v('eduGoal')}" placeholder="z. B. Matura 2027"></div>
      <div class="f"><label>Internat</label><select name="boarding">${options([['', 'nein'], ['1', 'ja']], a.boarding ? '1' : '')}</select></div>
      <div class="f"><label>Gesetzliche Vertretung</label><input name="guardian" maxlength="300" value="${v('guardian')}" placeholder="Name, Telefon"></div>
      <div class="f"><label>Notfallkontakt</label><input name="emergency" maxlength="300" value="${v('emergency')}" placeholder="Name, Telefon"></div>
      <div class="f"><label>Eintritt</label><input name="entryDate" type="date" value="${v('entryDate') || new Date().toISOString().slice(0, 10)}"></div>
      <div class="f"><label>Überprüfungstermin</label><input name="reviewDate" type="date" value="${v('reviewDate')}"></div>
    </div>`;
}
export function athletePayload(v) {
  return { name: v.name, born: v.born, sex: v.sex, sport: v.sport, discipline: v.discipline, group: v.group, club: v.club, federation: v.federation, kader: v.kader,
    school: v.school, schoolClass: v.schoolClass, eduGoal: v.eduGoal, boarding: v.boarding === '1', guardian: v.guardian, emergency: v.emergency, entryDate: v.entryDate, reviewDate: v.reviewDate };
}


export const ampel = (color) => `<span class="pill"><span class="dot s-${esc(color)}"></span>${esc(state.meta.catalog.status[color] || color)}</span>`;
export function statusCard(st, { detail = true, note = '' } = {}) {
  const cat = state.meta.catalog;
  return `<div class="status-card"><div class="status-big s-${esc(st.color)}" style="${st.color === 'gelb' ? 'color:#2A2200' : ''}">${esc(cat.status[st.color])}</div>
  <div><b>${esc(cat.statusMean[st.color])}</b>
  ${detail && st.color !== 'gruen' ? `<dl class="kv" style="margin-top:6px">${st.allowed ? `<dt>Erlaubt</dt><dd>${esc(st.allowed)}</dd>` : ''}<dt>Nicht erlaubt</dt><dd>${esc(st.restricted || '–')}</dd>
    <dt>Nächste Kontrolle</dt><dd>${fmt(st.next)}${st.next && dayDiff(st.next) < 0 ? ' <span class="bad">überfällig</span>' : ''}</dd></dl>` : ''}
  <div class="small muted" style="margin-top:6px">${st.by ? `Gesetzt von ${esc(st.by)} am ${fmt(st.updated)}.` : 'Noch kein Status gesetzt – es gilt Grün.'}${note}</div></div></div>`;
}
export function rtpStepper(n) {
  return `<div class="stepper" style="margin-top:6px">${state.meta.catalog.rtp.map((t, i) => `<div class="${i + 1 < n ? 'done' : i + 1 === n ? 'now' : ''}">${i + 1}. ${esc(t)}</div>`).join('')}</div>`;
}
