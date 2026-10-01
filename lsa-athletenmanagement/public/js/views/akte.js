// Athlet:innen-Akte mit Reitern. Welche Reiter und Inhalte sichtbar sind, bestimmt der Server (levels).
import { esc, fmt, fmtTs, ageOf, dayDiff, TODAY } from '../util.js';
import { get, post, put, del } from '../api.js';
import { actions, forms, changes, toast, showModal, closeModal, confirmDialog, locked, options, asArray } from '../ui.js';
import { state, can } from '../state.js';
import { statusPill, athleteFormFields, athletePayload, ampel } from './athlete-common.js';
import { entriesPanel } from './entries.js';
import { credentialsModal } from './users.js';

// Spätere Phasen hängen hier den Inhalt eines Reiters ein: tabContent.plan = async (cur) => html
export const tabContent = {};
export const cur = { id: null, tab: 'overview', data: null, edit: false };

const LOCK_REASON = {
  plan: 'Der Entwicklungsplan ist für diese Rolle nicht freigegeben.',
  monitoring: 'Monitoring-Daten sind für diese Rolle nicht erforderlich.',
  health: 'Gesundheitsdaten liegen in der medizinischen Akte. Diese Rolle erhält keinen Zugriff (DSGVO Art. 9, Datenminimierung).',
  psych: 'Psychologische Inhalte liegen im geschützten Beratungsbereich. Weitergegeben werden nur Handlungsempfehlungen, die die Athlet:in freigegeben hat.',
  school: 'Schulische Daten sind für diese Rolle nicht erforderlich.',
  decisions: 'Das Entscheidungsprotokoll ist für diese Rolle nicht freigegeben.',
  privacy: 'Einwilligungen und Zugriffsprotokolle sehen die Athlet:in, die Koordination und der Datenschutz.',
  overview: 'Die Stammdaten dieser Akte sind für diese Rolle nicht freigegeben.',
};
const TAB_CATEGORY = { overview: 'allgemein', plan: 'plan', monitoring: 'training', health: 'medizin', psych: 'psychologie', school: 'schule', privacy: 'datenschutz' };
const PHASE_OF = {};

const baseOf = () => (state.session.user.role === 'athlet' ? 'meine-akte' : `athleten/${cur.id}`);
export const levelPill = (tab) => {
  const l = cur.data.levels[tab];
  return `<span class="pill" title="Ihre Zugriffsstufe für diesen Reiter">${esc(state.meta.levelLabels[l] || l)}</span>`;
};

export async function renderAkte(id, tab) {
  tab = tab || 'overview';
  if (cur.id !== id) cur.edit = false;
  const d = await get('/api/athletes/' + encodeURIComponent(id));
  Object.assign(cur, { id, tab, data: d });
  const a = d.athlete, isAth = state.session.user.role === 'athlet';
  const tabs = [...state.meta.tabs.map((t) => [t.key, t.label]), ['docs', 'Dokumente & Notizen']];
  const content = await tabHtml(tab);
  return `<div class="head"><div>${isAth ? '' : '<button class="btn sm" data-act="nav" data-to="athleten">← Zurück zur Liste</button>'}
      <h1 style="margin-top:8px">${esc(a.name)}</h1>
      <p>${esc(a.id)} · ${esc(a.sport)}${a.discipline ? ', ' + esc(a.discipline) : ''}${a.group ? ' · ' + esc(a.group) : ''}${a.kader ? ' · ' + esc(a.kader) : ''} · ${ageOf(a.born)} Jahre</p></div>
      <div class="row">${a.demo ? '<span class="pill tag-demo">Demo</span>' : ''}${d.loadStatus ? ampel(d.loadStatus) : ''}${statusPill(a.status)}</div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => {
      const lockedTab = k !== 'docs' && d.levels[k] === 'none';
      return `<button role="tab" aria-selected="${tab === k}" data-act="akte-tab" data-t="${k}">${esc(l)}${lockedTab ? ' <span class="lock" aria-label="gesperrt">🔒</span>' : ''}</button>`;
    }).join('')}</div>${content}`;
}
export function mountAkte() { /* Platz für spätere Phasen (Diagramme o. Ä.) */ }

actions['akte-tab'] = (el) => window.__lsa.go(`${baseOf()}/${el.dataset.t}`);

async function tabHtml(tab) {
  const d = cur.data;
  if (tab === 'docs') {
    return await entriesPanel(cur.id, { title: 'Alle Dokumente und Notizen dieser Akte', hint: 'Sie sehen hier nur Kategorien, für die Sie berechtigt sind. Zum Filtern und Hinzufügen nutzen Sie den jeweiligen Reiter oder dieses Formular.' });
  }
  if (!state.meta.tabs.some((t) => t.key === tab)) { tab = 'overview'; cur.tab = tab; }
  if (d.levels[tab] === 'none') {
    const msg = locked(`Kein Zugriff für ${state.session.user.roleLabel}`, LOCK_REASON[tab] || 'Für diese Rolle nicht freigegeben.');
    return msg + '<p class="small muted" style="text-align:center;margin-top:8px">Der Zugriffsversuch wurde protokolliert.</p>';
  }
  if (tab === 'overview') return await tabOverview();
  if (tab === 'privacy') return await tabPrivacy();
  let h = '';
  if (tabContent[tab]) h += await tabContent[tab](cur);
  else h += `<div class="note"><b>${esc(state.meta.tabs.find((t) => t.key === tab).label)}</b> – Ihre Zugriffsstufe: ${levelPill(tab)}<br>Die fachlichen Funktionen dieses Reiters folgen in <b>Phase ${PHASE_OF[tab] || '?'}</b>. Dokumente und Notizen können Sie hier schon ablegen.</div>`;
  if (TAB_CATEGORY[tab]) h += await entriesPanel(cur.id, { category: TAB_CATEGORY[tab], title: 'Dokumente & Notizen – ' + state.meta.catalog.docCategories[TAB_CATEGORY[tab]].label });
  return h;
}

// ---------------- Überblick ----------------
async function tabOverview() {
  const d = cur.data, a = d.athlete, can_ = d.can;
  const trainers = d.team.filter((t) => t.function === 'Trainer:in').map((t) => esc(t.name)).join(', ');
  const coord = d.team.filter((t) => t.function === 'Koordination').map((t) => esc(t.name)).join(', ');
  const overdue = a.reviewDate && dayDiff(a.reviewDate) < 0;
  const stamm = cur.edit && can_.edit
    ? `<form data-form="athlete-edit" class="panel" style="grid-column:1/-1"><h3>Stammdaten bearbeiten</h3>${athleteFormFields(a, { forEdit: true })}
        <div class="err" data-err></div><div class="row" style="margin-top:8px"><button class="btn primary">Speichern</button><button type="button" class="btn" data-act="akte-edit-toggle">Abbrechen</button></div></form>`
    : `<div class="panel"><div class="row" style="justify-content:space-between"><h3>Stammdatenblatt</h3>${can_.edit ? '<button class="btn sm" data-act="akte-edit-toggle">Bearbeiten</button>' : ''}</div><dl class="kv">
        <dt>Athleten-ID</dt><dd>${esc(a.id)}</dd><dt>Geburtsdatum</dt><dd>${fmt(a.born)} (${ageOf(a.born)} Jahre)</dd><dt>Geschlecht</dt><dd>${esc(state.meta.catalog.sex.find(([k]) => k === a.sex)?.[1] || a.sex)}</dd>
        <dt>Sportart, Disziplin</dt><dd>${esc(a.sport)}${a.discipline ? ', ' + esc(a.discipline) : ''}</dd><dt>Trainingsgruppe</dt><dd>${esc(a.group) || '–'}</dd>
        <dt>Verein, Verband</dt><dd>${esc(a.club) || '–'}${a.federation ? ', ' + esc(a.federation) : ''}</dd><dt>Kader</dt><dd>${esc(a.kader) || '–'}</dd>
        <dt>Schule, Klasse</dt><dd>${esc(a.school) || '–'}${a.schoolClass ? ', ' + esc(a.schoolClass) : ''}</dd><dt>Bildungsziel</dt><dd>${esc(a.eduGoal) || '–'}</dd><dt>Internat</dt><dd>${a.boarding ? 'ja' : 'nein'}</dd>
        <dt>Gesetzl. Vertretung</dt><dd>${esc(a.guardian) || '<span class="warn">noch zu erfassen</span>'}</dd><dt>Notfallkontakt</dt><dd>${esc(a.emergency) || '<span class="warn">noch zu erfassen</span>'}</dd>
        <dt>Eintritt</dt><dd>${fmt(a.entryDate)}</dd><dt>Überprüfung</dt><dd>${fmt(a.reviewDate)}${overdue ? ' <span class="bad">überfällig</span>' : ''}</dd><dt>Status</dt><dd>${statusPill(a.status)}</dd></dl></div>`;

  const team = `<div class="panel"><div class="row" style="justify-content:space-between"><h3>Betreuungsteam</h3>${can_.team ? '<button class="btn sm" data-act="team-edit">Team bearbeiten</button>' : ''}</div>
    ${d.team.length ? `<dl class="kv">${d.team.map((t) => `<dt>${esc(t.function)}</dt><dd>${esc(t.name)}${t.active ? '' : ' <span class="pill bad-pill">Konto deaktiviert</span>'}</dd>`).join('')}</dl>` : '<p class="muted">Noch niemand zugeordnet.</p>'}
    <div class="note" style="margin-bottom:0">Zugeordnete Personen sehen diese Akte im Rahmen ihrer Rolle – auch wenn die Akte nicht zu ihrer Sportart gehört.</div></div>`;

  const exit = a.status === 'ausgetreten' ? `<div class="note warn"><b>Austritt-Checkliste</b>${state.meta.catalog.exitChecklist.map((t, i) => `<label class="chk"><input type="checkbox" data-change="exit-check" data-i="${i}" ${a.exitChecklist[i] ? 'checked' : ''} ${can_.lifecycle ? '' : 'disabled'}> ${esc(t)}</label>`).join('')}</div>` : '';
  const life = can_.lifecycle ? `<div class="panel" style="margin-top:14px"><h3>Status und Lebenszyklus</h3><div class="row">${state.meta.catalog.lifecycle.map((s) => `<button class="btn sm ${a.status === s ? 'primary' : ''}" data-act="life-set" data-s="${s}">${s}</button>`).join('')}</div>
    <p class="small muted" style="margin-bottom:0">Bei „ausgetreten“ wird der Zugang der Athlet:in beendet und die Akte ist nur noch für die Koordination sichtbar.</p>${exit}</div>` : '';

  const lg = d.login;
  const login = can_.login || lg ? `<div class="panel" style="margin-top:14px"><h3>Zugang der Athlet:in (Tages-Check, eigene Akte)</h3>
    ${lg ? `<dl class="kv"><dt>Benutzername</dt><dd><code>${esc(lg.username)}</code></dd><dt>Status</dt><dd>${lg.active ? '<span class="pill ok-pill">aktiv</span>' : '<span class="pill bad-pill">deaktiviert</span>'}${lg.mustChangePw ? ' <span class="pill warn-pill">Passwort offen</span>' : ''}</dd><dt>Letzte Anmeldung</dt><dd>${lg.lastLoginAt ? fmtTs(lg.lastLoginAt) : 'noch nie'}</dd></dl>`
      : '<p class="muted">Noch kein Zugang angelegt. Die Athlet:in kann die Anwendung dann mit eigenem Login nutzen und sieht ausschließlich die eigene Akte.</p>'}
    ${can_.login ? `<div class="row">${lg ? `<button class="btn" data-act="login-reset">Passwort zurücksetzen</button><button class="btn" data-act="login-active" data-a="${lg.active ? 0 : 1}">${lg.active ? 'Zugang deaktivieren' : 'Zugang aktivieren'}</button>` : '<button class="btn primary" data-act="login-create">Zugang anlegen</button>'}</div>` : ''}</div>` : '';

  const danger = can_.delete ? `<div class="panel" style="margin-top:14px;border-color:var(--red)"><h3>Akte löschen</h3><p class="small muted">Entfernt die Akte mit allen Einträgen, Einwilligungen und Dokumenten endgültig (Löschung nach Frist oder auf Verlangen). Das lässt sich nicht rückgängig machen; die Löschung wird protokolliert. Vorher ggf. eine Sicherung erstellen.</p><button class="btn danger" data-act="athlete-delete">Akte endgültig löschen …</button></div>` : '';

  const docs = await entriesPanel(cur.id, { category: 'allgemein', title: 'Dokumente & Notizen – Allgemein', hint: 'Verträge, Vereinbarungen, Fotos, sonstige Unterlagen zur Person.' });
  return `<div class="grid g2">${stamm}${cur.edit ? '' : team}</div>${cur.edit ? team : ''}${life}${login}${docs}${danger}`;
}

actions['akte-edit-toggle'] = async () => { cur.edit = !cur.edit; await window.__lsa.rerender(); };
forms['athlete-edit'] = async (f, v) => {
  await put('/api/athletes/' + cur.id, athletePayload(v));
  cur.edit = false;
  toast('Stammdaten gespeichert.');
  await window.__lsa.rerender();
};

actions['life-set'] = async (el) => {
  const s = el.dataset.s;
  if (s === cur.data.athlete.status) return;
  if (s === 'ausgetreten' && !(await confirmDialog('Austritt festhalten? Der Zugang der Athlet:in wird beendet, die Akte ist danach nur noch für die Koordination sichtbar.', { ok: 'Austritt festhalten', danger: true }))) return;
  await post(`/api/athletes/${cur.id}/lifecycle`, { status: s });
  toast(`Status: ${s}`);
  await window.__lsa.rerender();
};
changes['exit-check'] = async (el) => { await post(`/api/athletes/${cur.id}/exit-check`, { index: Number(el.dataset.i), checked: el.checked }); toast('Gespeichert.'); };

// ---- Betreuungsteam ----
const teamRow = (people, userId, fn) => `<div class="row team-row" style="margin-bottom:6px">
  <select name="person" aria-label="Person" style="flex:2;min-width:180px">${people.map((p) => `<option value="${p.id}" data-def="${esc(p.defaultFunction)}" ${p.id === userId ? 'selected' : ''}>${esc(p.name)} (${esc(p.roleLabel)})</option>`).join('')}</select>
  <select name="fn" aria-label="Funktion" style="flex:1;min-width:140px">${options(state.meta.catalog.teamFunctions, fn)}</select>
  <button type="button" class="btn sm" data-act="team-del" aria-label="Entfernen">✕</button></div>`;
let dirPeople = [];
actions['team-edit'] = async () => {
  dirPeople = (await get('/api/directory')).people;
  const rows = cur.data.team.map((t) => teamRow(dirPeople, t.userId, t.function)).join('');
  showModal(`<h2>Betreuungsteam</h2><p class="small muted">Wer zur Akte gehört, sieht sie im Rahmen der eigenen Rolle.</p>
    <form data-form="team-save"><div id="teamRows">${rows}</div>
    <button type="button" class="btn sm" data-act="team-add">＋ Person hinzufügen</button>
    <div class="err" data-err></div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button type="button" class="btn" data-act="dlg-cancel">Abbrechen</button><button class="btn primary">Speichern</button></div></form>`, { wide: true });
};
actions['team-add'] = () => {
  if (!dirPeople.length) return;
  const p = dirPeople[0];
  document.getElementById('teamRows').insertAdjacentHTML('beforeend', teamRow(dirPeople, p.id, p.defaultFunction));
};
actions['team-del'] = (el) => el.closest('.team-row').remove();
document.addEventListener('change', (e) => {
  if (e.target.matches('.team-row select[name=person]')) {
    const def = e.target.selectedOptions[0]?.dataset.def;
    const fn = e.target.closest('.team-row').querySelector('select[name=fn]');
    if (def && fn) fn.value = def;
  }
});
forms['team-save'] = async (f, v) => {
  const persons = asArray(v.person), fns = asArray(v.fn);
  await put(`/api/athletes/${cur.id}/team`, { team: persons.map((p, i) => ({ userId: Number(p), function: fns[i] })) });
  closeModal();
  toast('Betreuungsteam gespeichert.');
  await window.__lsa.rerender();
};

// ---- Zugang der Athlet:in ----
actions['login-create'] = async () => {
  const r = await post(`/api/athletes/${cur.id}/login`, {});
  credentialsModal({ title: 'Zugang angelegt', name: cur.data.athlete.name, username: r.login.username, password: r.temporaryPassword, generated: true });
  await window.__lsa.rerender();
};
actions['login-reset'] = async () => {
  if (!(await confirmDialog('Neues vorläufiges Passwort erzeugen? Eine bestehende Anmeldung der Athlet:in wird beendet.', { ok: 'Zurücksetzen' }))) return;
  const r = await post(`/api/athletes/${cur.id}/login/reset`, {});
  credentialsModal({ title: 'Passwort zurückgesetzt', name: cur.data.athlete.name, username: r.login.username, password: r.temporaryPassword, generated: true });
  await window.__lsa.rerender();
};
actions['login-active'] = async (el) => { await post(`/api/athletes/${cur.id}/login/active`, { active: el.dataset.a === '1' }); toast('Gespeichert.'); await window.__lsa.rerender(); };

// ---- Löschen ----
actions['athlete-delete'] = () => {
  const a = cur.data.athlete;
  showModal(`<h2>Akte endgültig löschen</h2><p><b>${esc(a.name)}</b> (${esc(a.id)}) wird mit allen Einträgen, Einwilligungen und Dokumenten unwiderruflich entfernt.</p>
    <form data-form="athlete-delete"><div class="f"><label>Zur Bestätigung die Athleten-ID eingeben: <b>${esc(a.id)}</b></label><input name="confirm" autocomplete="off" required></div>
    <div class="err" data-err></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="dlg-cancel">Abbrechen</button><button class="btn danger">Endgültig löschen</button></div></form>`);
};
forms['athlete-delete'] = async (f, v) => {
  await del(`/api/athletes/${encodeURIComponent(cur.id)}`, { confirm: v.confirm });
  closeModal();
  toast('Akte gelöscht.');
  window.__lsa.go('athleten');
};

// ---------------- Einwilligungen & Zugriffsprotokoll ----------------
const consentPill = (s) => `<span class="pill ${s === 'erteilt' ? 'ok-pill' : s === 'widerrufen' || s === 'nicht erteilt' ? 'warn-pill' : ''}">${esc(s)}</span>`;
async function tabPrivacy() {
  const p = await get(`/api/athletes/${encodeURIComponent(cur.id)}/privacy`);
  cur.privacy = p;
  const own = p.level === 'own';
  return `${p.minor ? '<div class="note warn"><b>Minderjährige Athlet:in.</b> Für freiwillige Zwecke ist die Zustimmung der Erziehungsberechtigten erforderlich und hier zu dokumentieren („Ändern …“ → „durch“).</div>' : ''}
  <div class="grid g2"><div class="panel"><h3>Einwilligungen und Rechtsgrundlagen</h3><p class="small muted">Kein Pauschalformular: jeder Zweck einzeln, freiwillige Zwecke jederzeit widerrufbar.</p>
    <table><tr><th>Zweck</th><th>Grundlage</th><th>Status</th></tr>
    ${p.consents.map((c) => `<tr><td>${esc(c.purpose)}</td><td class="small">${esc(c.basis)}</td><td>${consentPill(c.status)}${c.givenBy ? `<div class="small muted">durch ${esc(c.givenBy)}</div>` : ''}${c.note ? `<div class="small muted">${esc(c.note)}</div>` : ''}
      ${c.status !== 'entfällt' && ((own && c.voluntary) || !own) ? `<div style="margin-top:4px">${own ? `<button class="btn sm" data-act="consent-own" data-k="${c.key}" data-s="${c.status === 'erteilt' ? 'widerrufen' : 'erteilt'}">${c.status === 'erteilt' ? 'Widerrufen' : 'Erteilen'}</button>` : `<button class="btn sm" data-act="consent-edit" data-k="${c.key}">Ändern …</button>`}</div>` : ''}</td></tr>`).join('')}</table></div>
  <div class="panel"><h3>Wer hat auf ${own ? 'meine' : 'diese'} Daten zugegriffen?</h3><div class="scroll"><table><tr><th>Zeit</th><th>Rolle</th><th>Bereich</th><th>Aktion</th><th>Ergebnis</th></tr>
    ${p.log.map((l) => `<tr><td class="small nowrap">${fmtTs(l.ts)}</td><td class="small">${esc(state.meta.roles.find((r) => r.key === l.role)?.label || l.role || '–')}</td><td class="small">${esc(l.area)}</td><td class="small">${esc(l.action)}</td><td class="small ${l.result === 'verweigert' ? 'bad' : ''}">${esc(l.result)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Keine Einträge.</td></tr>'}</table></div></div></div>`;
}
actions['consent-own'] = async (el) => { await put(`/api/athletes/${cur.id}/consents/${el.dataset.k}`, { status: el.dataset.s }); toast('Gespeichert.'); await window.__lsa.rerender(); };
actions['consent-edit'] = (el) => {
  const c = cur.privacy.consents.find((x) => x.key === el.dataset.k);
  const cat = state.meta.catalog;
  showModal(`<h2>Einwilligung dokumentieren</h2><p><b>${esc(c.purpose)}</b></p>
    <form data-form="consent-save" data-k="${c.key}">
      <div class="f"><label>Status</label><select name="status">${options(cat.consentStatus.filter((s) => s !== 'entfällt'), c.status)}</select></div>
      <div class="f"><label>Durch wen</label><select name="givenBy"><option value="">–</option>${options(cat.consentGivenBy, c.givenBy)}</select></div>
      <div class="f"><label>Notiz (z. B. Formular, Datum)</label><input name="note" maxlength="300" value="${esc(c.note)}"></div>
      <div class="err" data-err></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="dlg-cancel">Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
};
forms['consent-save'] = async (f, v) => {
  await put(`/api/athletes/${cur.id}/consents/${f.dataset.k}`, { status: v.status, givenBy: v.givenBy, note: v.note });
  closeModal(); toast('Gespeichert.'); await window.__lsa.rerender();
};
