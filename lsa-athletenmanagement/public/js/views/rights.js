// "Meine Rechte": was die angemeldete Person sehen und tun darf – und warum
import { esc } from '../util.js';
import { state, registerView, ensureMeta } from '../state.js';
import { head } from '../ui.js';

export function scopeText(scope, assignedCount = 0, role) {
  if (role === 'athlet') return 'nur die eigene Akte';
  const parts = [];
  if (scope.all) parts.push('alle Athlet:innen');
  else if (scope.sports?.length) parts.push('Sportart(en): ' + scope.sports.join(', '));
  if (assignedCount) parts.push(`${assignedCount} einzeln zugeordnete Akte(n)`);
  if (!parts.length) return 'nur einzeln zugeordnete Akten (Betreuungsteam)';
  if (!scope.all && !scope.sports?.length) return parts.join(' + ');
  return parts.join(' + ') + (scope.all ? '' : ' + einzeln zugeordnete Akten');
}

registerView('rechte', {
  title: 'Meine Rechte',
  async render() {
    const meta = await ensureMeta();
    const s = state.session, u = s.user, p = s.permissions;
    const role = meta.roles.find((r) => r.key === u.role);
    const feats = meta.features.filter((f) => p.features[f.key]);
    return head('Meine Rechte', 'Was Sie in diesem System sehen und tun dürfen. Der Server erzwingt diese Rechte bei jeder Anfrage; jeder Zugriff wird protokolliert.') + `
    <div class="grid g2">
      <div class="panel"><h3>Person und Rolle</h3><dl class="kv"><dt>Name</dt><dd>${esc(u.displayName)}</dd><dt>Benutzername</dt><dd>${esc(u.username)}</dd><dt>Rolle</dt><dd><b>${esc(role.label)}</b></dd>
        <dt>Rollenbeschreibung</dt><dd>${esc(role.desc)}</dd><dt>Athletenbereich</dt><dd>${esc(scopeText(u.scope, 0, u.role))}</dd>
        <dt>Einzelrechte</dt><dd>${p.overridden ? `<b>${p.overrideCount} Abweichung(en)</b> von der Rollenvorlage (von der Systemadministration vergeben)` : 'keine – es gilt die Rollenvorlage'}</dd></dl></div>
      <div class="panel"><h3>Funktionen</h3>${feats.length ? `<ul style="margin:0;padding-left:18px">${feats.map((f) => `<li><b>${esc(f.label)}</b><div class="small muted">${esc(f.desc)}</div></li>`).join('')}</ul>` : '<p class="muted">Keine besonderen Funktionen.</p>'}</div>
    </div>
    <div class="panel" style="margin-top:14px"><h3>Zugriff auf die Reiter einer Athlet:innen-Akte</h3>
     <div class="scroll"><table><tr><th>Reiter</th><th>Stufe</th><th>Bedeutung</th></tr>
     ${meta.tabs.map((t) => { const l = p.tabs[t.key]; const base = role.defaults.tabs[t.key]; return `<tr><td><b>${esc(t.label)}</b></td><td><span class="pill">${l === 'none' ? '🔒 ' : ''}${esc(meta.levelLabels[l])}</span>${l !== base ? ' <span class="small warn">(abweichend von der Rollenvorlage)</span>' : ''}</td><td class="small muted">${esc(meta.levelHints[t.key]?.[l] || (l === 'own' ? 'Nur die eigene Akte' : ''))}</td></tr>`; }).join('')}</table></div></div>`;
  },
});
