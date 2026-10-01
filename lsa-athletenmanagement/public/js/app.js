// Start der Oberfläche: Sitzung laden, Rahmen (Navigation, Kopfzeile) und Hash-Router.
import { esc, AREAS, lvl } from './util.js';
import { post, setUnauthorizedHandler } from './api.js';
import { installGlobalHandlers, actions, changes, toast, reportError } from './ui.js';
import { state, views, navItems, loadSession } from './state.js';
import { renderLogin, renderSetup, renderPwChange } from './views/auth.js';
import './views/start.js';
import './views/konzept.js';
import './views/users.js';
import './views/rights.js';
import './views/system.js';
import './views/audit.js';

const root = () => document.getElementById('root');
let shellFor = null;

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...parts] = h.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: name || 'start', parts };
}
export const go = (path) => { location.hash = '#/' + path; };

function allowedNav(s) { return navItems.filter((n) => !n.show || n.show(s)); }

function renderNav(route) {
  const s = state.session;
  const el = document.getElementById('nav');
  if (!el) return;
  el.innerHTML = allowedNav(s).map((n) => {
    const cur = route.name === n.view || (n.match && n.match(route));
    const badge = n.badge ? n.badge(s) : '';
    return `<button data-act="nav" data-to="${n.view}" ${cur ? 'aria-current="page"' : ''}>${esc(n.label)}${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
  }).join('');
}

function renderShell() {
  const s = state.session, u = s.user;
  const initials = u.displayName.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const lens = (s.matrix || []).map((t, i) => `<div class="${lvl(t)}"><strong>${AREAS[i]}</strong>${esc(t)}</div>`).join('');
  root().innerHTML = `<div class="app-shell">
    <aside class="side" aria-label="Navigation">
      <div class="brand"><b>LSA</b><span>Athleten­management<small>${esc(s.orgName)}</small></span></div>
      <nav class="nav" id="nav"></nav>
      <div class="side-foot">Alle Daten liegen lokal auf diesem Rechner.<br><span class="small">Version ${esc(s.version)}</span></div>
    </aside>
    <div class="app-main">
      ${s.realUser ? `<div class="banner" role="status"><span>Testansicht: Sie sehen die Anwendung als <b>${esc(u.displayName)}</b> (${esc(u.roleLabel)}) – mit genau deren Rechten. Alles wird unter Ihrem Namen protokolliert.</span><button class="btn sm" data-act="stop-impersonate">Testansicht beenden</button></div>` : ''}
      <header class="top">
        <div class="userchip"><div class="avatar" aria-hidden="true">${esc(initials)}</div><div class="who"><b>${esc(u.displayName)}</b><span>${esc(u.roleLabel)}${s.permissions.overridden ? ' · individuelle Rechte' : ''}</span></div></div>
        <div class="lens" id="lens" aria-label="Zugriffsrechte der Rolle">${lens}</div>
        <div class="spacer"></div>
        <div class="row"><button class="btn sm" data-act="nav" data-to="rechte">Meine Rechte</button><button class="btn sm" data-act="nav" data-to="konto">Passwort</button><button class="btn sm" data-act="logout">Abmelden</button></div>
      </header>
      <main id="main" tabindex="-1"></main>
    </div></div>`;
  shellFor = u.id + ':' + (s.realUser ? s.realUser.id : '') + ':' + JSON.stringify(s.permissions);
}

let renderSeq = 0;
export async function renderRoute() {
  const seq = ++renderSeq;
  const s = state.session;
  if (!s) return;
  if (s.setupRequired) { root().innerHTML = renderSetup(s); shellFor = null; return; }
  if (!s.authenticated) { root().innerHTML = renderLogin(s); shellFor = null; return; }
  if (s.user.mustChangePw && !s.realUser) { root().innerHTML = renderPwChange(s, true); shellFor = null; return; }

  const route = parseRoute();
  const key = s.user.id + ':' + (s.realUser ? s.realUser.id : '') + ':' + JSON.stringify(s.permissions);
  if (shellFor !== key || !document.getElementById('main')) renderShell();
  let view = views[route.name];
  const navAllowedHere = view && (!view.guard || view.guard(s, route));
  if (!view || !navAllowedHere) { view = views.start; route.name = 'start'; route.parts = []; }
  renderNav(route);
  const main = document.getElementById('main');
  main.innerHTML = '<p class="muted">Lädt …</p>';
  try {
    const html = await view.render(route.parts, route);
    if (seq !== renderSeq) return; // inzwischen woanders hin navigiert
    main.innerHTML = html;
    document.title = `${view.title || 'LSA'} · LSA Athletenmanagement`;
    view.mount?.(main, route.parts);
  } catch (e) {
    if (seq !== renderSeq) return;
    main.innerHTML = `<div class="note bad"><b>Konnte nicht geladen werden.</b><br>${esc(e.message)}</div>`;
  }
}

async function refresh() {
  await loadSession();
  await renderRoute();
}
// Nach Anmeldung, Abmeldung oder Rollenwechsel: erst Sitzung neu laden, dann zur Zielseite (verhindert Anfragen mit alter Ansicht)
async function switchSession(target = '') {
  await loadSession();
  const hash = target ? '#/' + target : '';
  if (location.hash === hash || (!hash && !location.hash)) await renderRoute(); else location.hash = hash;
}
window.__lsa = { refresh, go, rerender: renderRoute, switchSession };

actions.nav = (el) => { const to = el.dataset.to + (el.dataset.arg ? '/' + el.dataset.arg : ''); if (location.hash === '#/' + to) renderRoute(); else go(to); window.scrollTo(0, 0); };
actions.logout = async () => { await post('/api/logout').catch(() => {}); await switchSession(''); };
actions['stop-impersonate'] = async () => { await post('/api/impersonate/stop'); await switchSession('users'); toast('Testansicht beendet.'); };

setUnauthorizedHandler(async () => { if (state.session?.authenticated) { toast('Die Sitzung ist abgelaufen. Bitte neu anmelden.', 'error'); await refresh(); } });
installGlobalHandlers({ onError: reportError });
window.addEventListener('hashchange', renderRoute);

(async () => {
  try { await loadSession(); } catch (e) { root().innerHTML = `<div class="auth-wrap"><div class="auth-card"><h1>Server nicht erreichbar</h1><p>${esc(e.message)}</p></div></div>`; return; }
  await renderRoute();
})();
