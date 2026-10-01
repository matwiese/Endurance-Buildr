// Startseite / Cockpit
import { esc, fmt, TODAY } from '../util.js';
import { get } from '../api.js';
import { head } from '../ui.js';
import { state, registerView, registerNav, can, isRole } from '../state.js';

// Weitere Phasen hängen hier rollenspezifische Cockpits ein: cockpits.push({ match(session), render(session) })
export const cockpits = [];

async function adminSteps() {
  const { users } = await get('/api/users');
  const sys = await get('/api/system');
  const others = users.filter((u) => u.id !== state.session.user.id);
  const steps = [
    ['Personen anlegen', `Trainer:innen, Ärzt:innen, Koordination … mit Rolle und Athletenbereich. Aktuell: <b>${others.length}</b> weitere Person(en).`, 'users/new', others.length > 0],
    ['Rechte prüfen', 'In „Personen &amp; Rechte“ die Einzelrechte je Person ansehen und bei Bedarf anpassen.', 'users', users.some((u) => u.overridden)],
    ['Testansicht ausprobieren', 'Mit „Testansicht als diese Person“ sehen, was jemand tatsächlich sieht – ohne sich abzumelden.', 'users', false],
    ['Sicherung erstellen', `Datenordner: <code>${esc(sys.dataDir)}</code>`, 'system', sys.backups.some((b) => b.label === 'manuell')],
  ];
  return `<div class="panel"><h3>Erste Schritte (Administration)</h3><ol class="steps-list">${steps.map(([t, d, to, done]) => `<li><b><a href="#/${to}">${t}</a></b> ${done ? '<span class="pill ok-pill">erledigt</span>' : ''}<div class="small muted">${d}</div></li>`).join('')}</ol></div>`;
}

registerView('start', {
  title: 'Start',
  async render() {
    const s = state.session, u = s.user;
    for (const c of cockpits) if (c.match(s)) return await c.render(s);
    let h = head(`Guten Tag, ${esc(u.displayName)}`, `${esc(u.roleLabel)} · ${fmt(TODAY)}`);
    if (can('users.manage')) h += await adminSteps();
    h += `<div class="panel" style="margin-top:14px"><h3>Ihre Rolle: ${esc(u.roleLabel)}</h3><p>Was Sie sehen und tun dürfen, finden Sie unter <a href="#/rechte">Meine Rechte</a>. Das <a href="#/konzept">Systemkonzept</a> erklärt den Aufbau.</p>
      ${s.permissions.overridden ? `<div class="note warn">Für Sie gelten ${s.permissions.overrideCount} Einzelrechte, die von der Rollenvorlage abweichen.</div>` : ''}</div>`;
    return h;
  },
});
registerNav({ id: 'start', label: 'Start', view: 'start', order: 1 });
