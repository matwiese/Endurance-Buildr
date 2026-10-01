// Personen & Rechte: Benutzer anlegen, Rolle wählen, Athletenbereich und Einzelrechte festlegen
import { esc, fmtTs, slugUsername } from '../util.js';
import { get, post, put } from '../api.js';
import { actions, forms, changes, inputs, toast, showModal, closeModal, confirmDialog, head, options, asArray } from '../ui.js';
import { state, registerView, registerNav, can, ensureMeta } from '../state.js';
import { scopeText } from './rights.js';

const filter = { q: '', role: '', inactive: false };
let draft = null;      // Bearbeitungsstand des Formulars
let current = null;    // Person vom Server (beim Bearbeiten)

const roleDefaults = (role) => state.meta.roles.find((r) => r.key === role).defaults;
const defaultScopeFor = (role) => ({ all: roleDefaults(role).scope === 'all', sports: [] });

function effectiveFrom(role, overrides) {
  const d = roleDefaults(role);
  const tabs = { ...d.tabs, ...(overrides?.tabs || {}) };
  const features = {};
  for (const f of state.meta.features) features[f.key] = d.features.includes(f.key);
  Object.assign(features, overrides?.features || {});
  return { tabs, features };
}

function newDraft(role = 'trainer') {
  return { id: null, username: '', usernameTouched: false, displayName: '', email: '', phone: '', functionTitle: '', notes: '', role,
    scope: defaultScopeFor(role), ...effectiveFrom(role), pwMode: 'auto', password: '' };
}
function draftFrom(u) {
  return { id: u.id, username: u.username, displayName: u.displayName, email: u.email, phone: u.phone, functionTitle: u.functionTitle, notes: u.notes,
    role: u.role, scope: { all: !!u.scope.all, sports: [...u.scope.sports] }, ...effectiveFrom(u.role, u.overrides) };
}

function statusPill(u) {
  if (!u.active) return '<span class="pill bad-pill">deaktiviert</span>';
  if (u.locked) return '<span class="pill warn-pill">gesperrt</span>';
  if (u.mustChangePw) return '<span class="pill warn-pill">Passwort offen</span>';
  return '<span class="pill ok-pill">aktiv</span>';
}

// ---------------- Liste ----------------
registerView('users', {
  title: 'Personen & Rechte',
  guard: () => can('users.manage'),
  async render(parts) {
    await ensureMeta();
    if (parts[0] === 'new') { draft = newDraft(); current = null; return editHtml(); }
    if (parts[0]) {
      const { user } = await get('/api/users/' + encodeURIComponent(parts[0]));
      current = user; draft = draftFrom(user);
      return editHtml();
    }
    return listHtml();
  },
});

async function listHtml() {
  const { users } = await get('/api/users');
  const q = filter.q.toLowerCase();
  const rows = users.filter((u) => (filter.inactive || u.active)
    && (!filter.role || u.role === filter.role)
    && (!q || `${u.displayName} ${u.username} ${u.functionTitle} ${u.email}`.toLowerCase().includes(q)));
  const nInactive = users.filter((u) => !u.active).length;
  return head('Personen & Rechte', 'Hier legen Sie die Personen an, die mit dem System arbeiten, und bestimmen, was jede einzelne Person sehen und tun darf.',
    '<button class="btn primary" data-act="nav" data-to="users" data-arg="new">+ Person anlegen</button>') + `
    <div class="note">Jede Person erhält eine <b>Rolle</b> (Vorlage aus dem Berechtigungskonzept). Darüber hinaus lassen sich <b>Einzelrechte</b> je Person anpassen und der <b>Athletenbereich</b> festlegen – also welche Athlet:innen sie überhaupt sieht. Alle Änderungen stehen im Zugriffsprotokoll.</div>
    <div class="panel">
      <div class="toolbar">
        <input type="search" placeholder="Suchen: Name, Benutzername …" value="${esc(filter.q)}" data-input="users-filter-q" style="max-width:300px">
        <select data-change="users-filter-role"><option value="">Alle Rollen</option>${options(state.meta.roles.map((r) => [r.key, r.label]), filter.role)}</select>
        <label class="chk" style="margin:0"><input type="checkbox" data-change="users-filter-inactive" ${filter.inactive ? 'checked' : ''}> deaktivierte anzeigen${nInactive ? ` (${nInactive})` : ''}</label>
        <span class="right small muted">${rows.length} von ${users.length} Personen</span>
      </div>
      ${rows.length ? `<div class="scroll"><table><tr><th>Person</th><th>Rolle</th><th>Athletenbereich</th><th>Rechte</th><th>Letzte Anmeldung</th><th>Status</th><th></th></tr>
      ${rows.map((u) => `<tr class="click" data-act="nav" data-to="users" data-arg="${u.id}"><td><b>${esc(u.displayName)}</b>${u.demo ? ' <span class="pill tag-demo">Demo</span>' : ''}<div class="small muted">${esc(u.username)}${u.functionTitle ? ' · ' + esc(u.functionTitle) : ''}</div></td>
        <td>${esc(u.roleLabel)}</td><td class="small">${esc(scopeText(u.scope, u.assignedCount, u.role))}</td>
        <td class="small">${u.overridden ? `<span class="warn">individuell angepasst (${u.overrideCount})</span>` : '<span class="muted">Rollenvorlage</span>'}</td>
        <td class="small">${u.lastLoginAt ? fmtTs(u.lastLoginAt) : '<span class="muted">noch nie</span>'}</td><td>${statusPill(u)}</td>
        <td class="nowrap"><button class="btn sm" data-act="nav" data-to="users" data-arg="${u.id}">Bearbeiten</button></td></tr>`).join('')}</table></div>` : '<div class="empty">Keine Personen gefunden.</div>'}
    </div>`;
}
inputs['users-filter-q'] = (el) => { filter.q = el.value; const pos = el.selectionStart; window.__lsa.rerender().then(() => { const n = document.querySelector('[data-input=users-filter-q]'); n?.focus(); n?.setSelectionRange(pos, pos); }); };
changes['users-filter-role'] = (el) => { filter.role = el.value; window.__lsa.rerender(); };
changes['users-filter-inactive'] = (el) => { filter.inactive = el.checked; window.__lsa.rerender(); };

// ---------------- Formular ----------------
function readDom() {
  const f = document.querySelector('form[data-form=user-save]');
  if (!f) return;
  const v = (n) => f.elements[n]?.value ?? '';
  draft.displayName = v('displayName');
  if (!current) draft.username = v('username');
  draft.email = v('email'); draft.phone = v('phone'); draft.functionTitle = v('functionTitle'); draft.notes = v('notes');
  if (!current) { draft.pwMode = f.elements.pwMode?.value || 'auto'; draft.password = v('password'); }
  if (draft.role !== 'athlet') {
    draft.scope.all = !!f.elements.scopeAll?.checked;
    draft.scope.sports = [...f.querySelectorAll('input[name=sport]:checked')].map((x) => x.value);
    for (const t of state.meta.tabs) { const el = f.elements['tab_' + t.key]; if (el) draft.tabs[t.key] = el.value; }
    for (const ft of state.meta.features) { const el = f.elements['feat_' + ft.key]; if (el) draft.features[ft.key] = el.checked; }
  }
}

function rightsHtml() {
  const meta = state.meta, def = roleDefaults(draft.role);
  const rows = meta.tabs.map((t) => {
    const lv = t.levels.filter((l) => l !== 'own');
    const cur = draft.tabs[t.key];
    const changed = cur !== def.tabs[t.key];
    return `<tr data-tabrow="${t.key}" class="${changed ? 'changed' : ''}"><td><b>${esc(t.label)}</b></td>
      <td class="small muted">${esc(meta.levelLabels[def.tabs[t.key]])}</td>
      <td><select name="tab_${t.key}" data-change="user-rights" aria-label="${esc(t.label)}">${lv.map((l) => `<option value="${l}" ${l === cur ? 'selected' : ''}>${esc(meta.levelLabels[l])}${l === def.tabs[t.key] ? ' (Vorlage)' : ''}</option>`).join('')}</select><span class="tag" ${changed ? '' : 'hidden'}>geändert</span></td>
      <td class="small muted" data-hint>${esc(meta.levelHints[t.key]?.[cur] || '')}</td></tr>`;
  }).join('');
  const groups = [...new Set(meta.features.map((f) => f.group))];
  const feats = groups.map((g) => `<div class="feat-group">${esc(g)}</div>${meta.features.filter((f) => f.group === g && !['checkin.self', 'safeguarding.report'].includes(f.key)).map((f) => {
    const changed = draft.features[f.key] !== def.features.includes(f.key);
    return `<label class="chk ${changed ? 'changed' : ''}" data-featrow="${f.key}"><input type="checkbox" name="feat_${f.key}" data-change="user-rights" ${draft.features[f.key] ? 'checked' : ''}><span><b>${esc(f.label)}</b>${changed ? ' <span class="tag">geändert</span>' : ''}<span class="d">${esc(f.desc)}</span></span></label>`;
  }).join('')}`).join('');
  return `<div class="panel" style="margin-top:14px"><h3>Zugriff auf die Reiter einer Akte</h3>
      <p class="small muted">Gilt nur für Akten im Athletenbereich dieser Person. Standard ist die Vorlage der Rolle; Abweichungen werden orange markiert und protokolliert.</p>
      <div class="scroll"><table class="rights"><tr><th>Reiter</th><th>Vorlage der Rolle</th><th>Zugriff dieser Person</th><th>Bedeutung</th></tr>${rows}</table></div></div>
    <div class="panel" style="margin-top:14px"><h3>Funktionen</h3>${feats}</div>`;
}

function scopeHtml(sports) {
  if (draft.role === 'athlet') return '';
  const assigned = current?.assignedCount || 0;
  return `<div class="panel" style="margin-top:14px"><h3>Athletenbereich: welche Athlet:innen sieht die Person?</h3>
    <p class="small muted">Ohne Zugriff auf eine Akte nützt auch ein weitgehendes Reiter-Recht nichts. Die Bereiche addieren sich.</p>
    <label class="chk"><input type="checkbox" name="scopeAll" data-change="user-scope" ${draft.scope.all ? 'checked' : ''}><span><b>Alle Athlet:innen</b><span class="d">auch später angelegte</span></span></label>
    <div id="sportsBox" style="${draft.scope.all ? 'opacity:.45' : ''}"><div class="small muted" style="margin:8px 0 2px">…oder alle Athlet:innen dieser Sportarten:</div>
      <div class="chk-grid">${sports.map((s) => `<label class="chk"><input type="checkbox" name="sport" value="${esc(s)}" ${draft.scope.sports.includes(s) ? 'checked' : ''} ${draft.scope.all ? 'disabled' : ''}> ${esc(s)}</label>`).join('')}</div></div>
    <div class="note" style="margin-bottom:0">Zusätzlich erhält die Person Zugriff auf Akten, in deren <b>Betreuungsteam</b> sie eingetragen ist${current ? ` (aktuell <b>${assigned}</b>)` : ''}. Das lässt sich in der jeweiligen Akte setzen.</div></div>`;
}

function editHtml() {
  const meta = state.meta, sports = state.session.sports, isNew = !current;
  const roleOpts = meta.roles.filter((r) => r.key !== 'athlet' || draft.role === 'athlet').map((r) => [r.key, r.label]);
  const roleDef = meta.roles.find((r) => r.key === draft.role);
  const isAthlete = draft.role === 'athlet';
  const body = `<div class="panel"><h3>Person</h3>
      <div class="fgrid c2">
        <div class="f"><label for="u_name">Name</label><input id="u_name" name="displayName" type="text" required value="${esc(draft.displayName)}" ${isNew ? 'data-input="user-name"' : ''} autocomplete="off"></div>
        <div class="f"><label for="u_user">Benutzername (für die Anmeldung)</label><input id="u_user" name="username" type="text" required pattern="[a-z0-9._\\-]{3,40}" value="${esc(draft.username)}" ${isNew ? '' : 'readonly'} autocomplete="off"><span class="hint">${isNew ? 'wird aus dem Namen vorgeschlagen' : 'kann nicht geändert werden'}</span></div>
        <div class="f"><label>E-Mail</label><input name="email" type="email" value="${esc(draft.email)}"></div>
        <div class="f"><label>Telefon</label><input name="phone" type="tel" value="${esc(draft.phone)}"></div>
        <div class="f"><label>Funktion / Bezeichnung</label><input name="functionTitle" type="text" value="${esc(draft.functionTitle)}" placeholder="z. B. Cheftrainer Sprint"></div>
        <div class="f"><label for="u_role">Rolle</label><select id="u_role" name="role" data-change="user-role" ${isAthlete ? 'disabled' : ''}>${options(roleOpts, draft.role)}</select></div>
      </div>
      <div class="role-desc" id="roleDesc">${esc(roleDef.desc)}</div>
      <div class="f"><label>Interne Notiz</label><input name="notes" type="text" value="${esc(draft.notes)}"></div>
    </div>
    ${isNew ? `<div class="panel" style="margin-top:14px"><h3>Anfangspasswort</h3>
      <label class="chk"><input type="radio" name="pwMode" value="auto" ${draft.pwMode === 'auto' ? 'checked' : ''} data-change="user-pwmode"><span><b>Automatisch erzeugen</b><span class="d">wird Ihnen nach dem Anlegen einmalig angezeigt</span></span></label>
      <label class="chk"><input type="radio" name="pwMode" value="manual" ${draft.pwMode === 'manual' ? 'checked' : ''} data-change="user-pwmode"><span><b>Selbst festlegen</b></span></label>
      <div class="f" id="pwManual" style="max-width:340px;${draft.pwMode === 'manual' ? '' : 'display:none'}"><input name="password" type="text" minlength="10" value="${esc(draft.password)}" placeholder="mindestens 10 Zeichen" autocomplete="off"></div>
      <p class="small muted" style="margin-bottom:0">Die Person muss das Passwort bei der ersten Anmeldung ändern.</p></div>` : ''}
    ${isAthlete ? `<div class="note" style="margin-top:14px">Dies ist der Zugang einer Athlet:in. Er sieht ausschließlich die eigene Akte; die Rechte sind durch die Rolle fest vorgegeben.</div>` : scopeHtml(sports) + `<div id="rightsBox">${rightsHtml()}</div>`}
    <div class="err" data-err role="alert" style="margin-top:10px"></div>
    <div class="row" style="margin-top:12px"><button class="btn primary">${isNew ? 'Person anlegen' : 'Änderungen speichern'}</button><button type="button" class="btn" data-act="nav" data-to="users">Abbrechen</button></div>`;

  const side = isNew ? '' : `<div class="panel" style="margin-top:14px"><h3>Konto</h3>
      <dl class="kv"><dt>Status</dt><dd>${statusPill(current)}</dd><dt>Angelegt</dt><dd>${fmtTs(current.createdAt)} von ${esc(current.createdBy || '–')}</dd>
      <dt>Letzte Anmeldung</dt><dd>${current.lastLoginAt ? fmtTs(current.lastLoginAt) : 'noch nie'}</dd><dt>Passwort geändert</dt><dd>${current.pwChangedAt ? fmtTs(current.pwChangedAt) : '–'}</dd></dl>
      <div class="row" style="margin-top:12px">
        <button class="btn" data-act="user-reset" data-id="${current.id}">Passwort zurücksetzen</button>
        ${current.locked ? `<button class="btn" data-act="user-unlock" data-id="${current.id}">Sperre aufheben</button>` : ''}
        ${current.active ? `<button class="btn danger" data-act="user-deactivate" data-id="${current.id}">Konto deaktivieren</button>` : `<button class="btn primary" data-act="user-activate" data-id="${current.id}">Konto wieder aktivieren</button>`}
        ${current.active && state.session.testMode ? `<button class="btn signal" data-act="user-impersonate" data-id="${current.id}" title="Die Anwendung mit genau den Rechten dieser Person ansehen">Testansicht als diese Person</button>` : ''}
      </div></div>`;

  return head(isNew ? 'Person anlegen' : esc(current.displayName), isNew ? 'Rolle wählen, Athletenbereich und bei Bedarf Einzelrechte festlegen.' : `${esc(current.username)} · ${esc(current.roleLabel)}`,
    '<button class="btn sm" data-act="nav" data-to="users">← Alle Personen</button>') +
    `<form data-form="user-save" autocomplete="off" style="max-width:1000px">${body}</form>${side}`;
}

changes['user-role'] = (el) => {
  readDom();
  draft.role = el.value;
  draft.scope = defaultScopeFor(draft.role);
  Object.assign(draft, effectiveFrom(draft.role));
  rerenderForm();
  toast('Rolle gewechselt – Rechte und Athletenbereich entsprechen jetzt der Vorlage dieser Rolle.');
};
changes['user-scope'] = () => { readDom(); rerenderForm(); };
changes['user-pwmode'] = (el) => { document.getElementById('pwManual').style.display = el.value === 'manual' ? '' : 'none'; };
inputs['user-name'] = (el) => {
  const u = el.form.elements.username;
  if (u && !u.dataset.touched) u.value = slugUsername(el.value);
};
changes['user-rights'] = () => {
  readDom();
  const def = roleDefaults(draft.role), meta = state.meta;
  document.querySelectorAll('[data-tabrow]').forEach((tr) => {
    const k = tr.dataset.tabrow, ch = draft.tabs[k] !== def.tabs[k];
    tr.classList.toggle('changed', ch);
    tr.querySelector('.tag').hidden = !ch;
    tr.querySelector('[data-hint]').textContent = meta.levelHints[k]?.[draft.tabs[k]] || '';
  });
  document.querySelectorAll('[data-featrow]').forEach((l) => {
    const k = l.dataset.featrow, ch = draft.features[k] !== def.features.includes(k);
    l.classList.toggle('changed', ch);
    l.querySelector('.tag')?.remove();
    if (ch) l.querySelector('b').insertAdjacentHTML('afterend', ' <span class="tag">geändert</span>');
  });
};
function rerenderForm() {
  const main = document.getElementById('main');
  const keepScroll = window.scrollY;
  main.innerHTML = editHtml();
  window.scrollTo(0, keepScroll);
}

forms['user-save'] = async (f) => {
  readDom();
  const payload = {
    displayName: draft.displayName, email: draft.email, phone: draft.phone, functionTitle: draft.functionTitle, notes: draft.notes,
    role: draft.role, scope: draft.scope, overrides: { tabs: draft.tabs, features: draft.features },
  };
  if (draft.role === 'athlet') { delete payload.scope; delete payload.overrides; }
  if (!current) {
    payload.username = draft.username;
    if (draft.pwMode === 'manual') payload.password = draft.password;
    const r = await post('/api/users', payload);
    credentialsModal({ title: 'Person angelegt', name: r.user.displayName, username: r.user.username, password: r.temporaryPassword || draft.password, generated: !!r.temporaryPassword });
    window.__lsa.go('users/' + r.user.id);
  } else {
    const r = await put('/api/users/' + current.id, payload);
    current = r.user; draft = draftFrom(r.user);
    const self = (state.session.realUser || state.session.user).id === r.user.id;
    toast(self ? 'Gespeichert. Ihre eigenen Rechte gelten ab sofort.' : 'Gespeichert.');
    if (self) await window.__lsa.refresh(); else rerenderForm();
  }
};

export function credentialsModal({ title, name, username, password, generated }) {
  showModal(`<h2>${esc(title)}</h2>
    <p><b>${esc(name)}</b> meldet sich so an:</p>
    <dl class="kv"><dt>Benutzername</dt><dd><code>${esc(username)}</code></dd><dt>${generated ? 'Vorläufiges Passwort' : 'Passwort'}</dt><dd></dd></dl>
    <div class="pwbox" id="pwShown">${esc(password)}</div>
    <div class="note warn" style="margin-top:12px">${generated ? 'Dieses Passwort wird <b>nur jetzt</b> angezeigt und ist danach nicht mehr abrufbar. ' : ''}Bitte der Person auf sicherem Weg mitteilen. Bei der ersten Anmeldung muss sie ein eigenes Passwort wählen.</div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="copy-pw">In die Zwischenablage kopieren</button><button class="btn primary" data-act="dlg-cancel">Fertig</button></div>`);
}
actions['copy-pw'] = async (el) => {
  const t = document.getElementById('pwShown').textContent;
  try { await navigator.clipboard.writeText(t); el.textContent = 'Kopiert ✓'; } catch { toast('Kopieren nicht möglich – bitte das Passwort markieren und mit Strg+C kopieren.', 'error'); }
};

actions['user-reset'] = async (el) => {
  if (!(await confirmDialog(`Für ${current.displayName} ein neues vorläufiges Passwort erzeugen? Bestehende Anmeldungen der Person werden beendet.`, { ok: 'Zurücksetzen' }))) return;
  const r = await post(`/api/users/${el.dataset.id}/reset-password`, {});
  credentialsModal({ title: 'Passwort zurückgesetzt', name: current.displayName, username: current.username, password: r.temporaryPassword, generated: true });
  window.__lsa.rerender();
};
actions['user-unlock'] = async (el) => { await post(`/api/users/${el.dataset.id}/unlock`); toast('Sperre aufgehoben.'); window.__lsa.rerender(); };
actions['user-deactivate'] = async (el) => {
  if (!(await confirmDialog(`${current.displayName} deaktivieren? Die Person kann sich nicht mehr anmelden, laufende Sitzungen enden sofort. Die Daten bleiben erhalten.`, { ok: 'Deaktivieren', danger: true }))) return;
  await post(`/api/users/${el.dataset.id}/active`, { active: false }); toast('Konto deaktiviert.'); window.__lsa.rerender();
};
actions['user-activate'] = async (el) => { await post(`/api/users/${el.dataset.id}/active`, { active: true }); toast('Konto aktiviert.'); window.__lsa.rerender(); };
actions['user-impersonate'] = async (el) => {
  await post('/api/impersonate', { userId: Number(el.dataset.id) });
  await window.__lsa.switchSession('start');
  toast('Testansicht aktiv. Oben sehen Sie, wie Sie zurückkehren.');
};

registerNav({ id: 'users', label: 'Personen & Rechte', view: 'users', order: 80, show: () => can('users.manage') });
