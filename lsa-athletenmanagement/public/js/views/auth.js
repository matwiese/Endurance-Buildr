// Anmeldung, Ersteinrichtung, Passwortwechsel
import { esc, slugUsername } from '../util.js';
import { post } from '../api.js';
import { forms, actions, inputs, toast } from '../ui.js';
import { state, loadSession, registerView } from '../state.js';

const brand = (org) => `<div class="brand"><b>LSA</b><span>Athletenmanagement<small>${esc(org || 'Prototyp')}</small></span></div>`;

export function renderLogin(s) {
  return `<div class="auth-wrap"><div class="auth-card">${brand(s.orgName)}
    <h1>Anmelden</h1><p class="muted small">Die Daten liegen ausschließlich auf diesem Rechner.</p>
    <form data-form="login" autocomplete="on">
      <div class="f"><label for="lu">Benutzername</label><input id="lu" name="username" type="text" autocomplete="username" required autofocus></div>
      <div class="f"><label for="lp">Passwort</label><input id="lp" name="password" type="password" autocomplete="current-password" required></div>
      <div class="err" data-err role="alert"></div>
      <button class="btn primary wide">Anmelden</button>
    </form>
    <p class="small muted" style="margin-top:14px">Passwort vergessen? Die Systemadministration kann ein neues vergeben.</p></div></div>`;
}

export function renderSetup(s) {
  return `<div class="auth-wrap"><div class="auth-card">${brand('Ersteinrichtung')}
    <h1>Willkommen</h1>
    <p>Dies ist die erste Anmeldung an dieser Installation. Legen Sie jetzt das Konto der <b>Systemadministration</b> an. Damit können Sie danach Trainer:innen, Ärzt:innen und alle weiteren Personen anlegen und ihre Rechte festlegen.</p>
    <form data-form="setup" autocomplete="off">
      <div class="f"><label>Name der Organisation</label><input name="orgName" type="text" value="LSA Südstadt" required></div>
      <div class="f"><label>Ihr Name</label><input name="displayName" type="text" required data-input="setup-name" autofocus></div>
      <div class="f"><label>Benutzername</label><input name="username" type="text" required pattern="[a-z0-9._\\-]{3,40}" autocomplete="username"><span class="hint">Kleinbuchstaben, Ziffern, Punkt, Unterstrich, Bindestrich</span></div>
      <div class="fgrid c2"><div class="f"><label>Passwort</label><input name="password" type="password" minlength="10" required autocomplete="new-password"></div>
      <div class="f"><label>Passwort wiederholen</label><input name="password2" type="password" minlength="10" required autocomplete="new-password"></div></div>
      <p class="small muted">Mindestens 10 Zeichen. Es gibt kein Standardpasswort – bitte gut merken, es kann nicht ausgelesen werden.</p>
      <div class="err" data-err role="alert"></div>
      <button class="btn primary wide">Einrichtung abschließen</button>
    </form></div></div>`;
}

export function renderPwChange(s, forced = true) {
  return `<div class="auth-wrap"><div class="auth-card">${brand(s.orgName)}
    <h1>Neues Passwort festlegen</h1>
    <p>${forced ? 'Sie haben ein vorläufiges Passwort erhalten. Bitte wählen Sie jetzt Ihr eigenes.' : ''}</p>
    <form data-form="pwchange" autocomplete="off">
      <div class="f"><label>Aktuelles (vorläufiges) Passwort</label><input name="current" type="password" required autocomplete="current-password" autofocus></div>
      <div class="f"><label>Neues Passwort</label><input name="next" type="password" minlength="10" required autocomplete="new-password"><span class="hint">Mindestens 10 Zeichen, nicht nur Ziffern, ohne Ihren Benutzernamen.</span></div>
      <div class="f"><label>Neues Passwort wiederholen</label><input name="next2" type="password" minlength="10" required autocomplete="new-password"></div>
      <div class="err" data-err role="alert"></div>
      <div class="row"><button class="btn primary">Passwort speichern</button><button type="button" class="btn" data-act="logout">Abmelden</button></div>
    </form></div></div>`;
}

forms.login = async (f, v) => {
  await post('/api/login', { username: v.username, password: v.password });
  await window.__lsa.switchSession('start');
};
forms.setup = async (f, v) => {
  if (v.password !== v.password2) throw new Error('Die beiden Passwörter stimmen nicht überein.');
  await post('/api/setup', { orgName: v.orgName, displayName: v.displayName, username: v.username, password: v.password });
  await window.__lsa.switchSession('start');
  toast('Einrichtung abgeschlossen. Willkommen!');
};
forms.pwchange = async (f, v) => {
  if (v.next !== v.next2) throw new Error('Die beiden neuen Passwörter stimmen nicht überein.');
  await post('/api/password', { current: v.current, next: v.next });
  toast('Passwort gespeichert.');
  await window.__lsa.switchSession('start');
};
inputs['setup-name'] = (el) => {
  const u = el.form.querySelector('[name=username]');
  if (u && !u.dataset.touched) u.value = slugUsername(el.value);
};
document.addEventListener('input', (e) => { if (e.target.name === 'username') e.target.dataset.touched = '1'; });

// Konto-Seite: Passwort ändern (freiwillig)
registerView('konto', {
  title: 'Mein Konto',
  render: () => `<div class="head"><div><h1>Mein Konto</h1><p>Passwort ändern.</p></div></div>
    <form class="panel" data-form="pwchange-inline" style="max-width:480px" autocomplete="off">
      <div class="f"><label>Aktuelles Passwort</label><input name="current" type="password" required autocomplete="current-password"></div>
      <div class="f"><label>Neues Passwort</label><input name="next" type="password" minlength="10" required autocomplete="new-password"></div>
      <div class="f"><label>Neues Passwort wiederholen</label><input name="next2" type="password" minlength="10" required autocomplete="new-password"></div>
      <div class="err" data-err role="alert"></div>
      <button class="btn primary">Passwort ändern</button></form>`,
});
forms['pwchange-inline'] = async (f, v) => {
  if (v.next !== v.next2) throw new Error('Die beiden neuen Passwörter stimmen nicht überein.');
  await post('/api/password', { current: v.current, next: v.next });
  f.reset();
  toast('Passwort geändert.');
};
