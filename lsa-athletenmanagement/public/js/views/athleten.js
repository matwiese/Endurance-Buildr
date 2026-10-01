// Athlet:innen: Liste und Aufnahme einer neuen Akte
import { esc, fmt, ageOf } from '../util.js';
import { get, post } from '../api.js';
import { actions, forms, changes, inputs, toast, head, options } from '../ui.js';
import { state, registerView, registerNav, can, isRole } from '../state.js';
import { statusPill, athleteFormFields, athletePayload } from './athlete-common.js';
import { renderAkte, mountAkte } from './akte.js';

const filter = { q: '', sport: '', status: 'aktuelle' };

registerView('athleten', {
  title: 'Athlet:innen',
  guard: (s) => s.user.role !== 'athlet' && s.permissions.tabs.overview !== 'none',
  async render(parts) {
    if (parts[0] === 'neu') {
      if (!can('athletes.create')) return '<div class="note bad">Keine Berechtigung zum Anlegen von Akten.</div>';
      return head('Athlet:in aufnehmen', 'Nur Stammdaten. Gesundheitsdaten werden nicht hier, sondern im medizinischen Aufnahmeprozess erhoben.', '<button class="btn sm" data-act="nav" data-to="athleten">← Zur Liste</button>') + `
        <form class="panel" data-form="athlete-new" style="max-width:1000px"><h3>Stammdatenblatt anlegen</h3>${athleteFormFields()}
        <div class="err" data-err></div>
        <div class="row" style="margin-top:8px"><button class="btn primary">Akte anlegen</button><span class="small muted">Die Athleten-ID wird automatisch vergeben und bleibt in allen Systemen gleich.</span></div></form>`;
    }
    if (parts[0]) return renderAkte(parts[0], parts[1]);
    return listHtml();
  },
  mount(root, parts) { if (parts[0] && parts[0] !== 'neu') mountAkte(root, parts); },
});

async function listHtml() {
  const { athletes } = await get('/api/athletes');
  const q = filter.q.toLowerCase();
  const rows = athletes.filter((a) => (filter.status === 'alle' || (filter.status === 'aktuelle' ? a.status !== 'ausgetreten' : a.status === filter.status))
    && (!filter.sport || a.sport === filter.sport)
    && (!q || `${a.name} ${a.id} ${a.discipline} ${a.group} ${a.club} ${a.kader}`.toLowerCase().includes(q)));
  const sports = state.session.sports;
  const sub = isRole('trainer') ? 'Athlet:innen deiner Trainingsgruppe(n) und alle, bei denen du im Betreuungsteam stehst.' : 'Alle Athlet:innen in deinem Zuständigkeitsbereich.';
  return head('Athlet:innen', sub, can('athletes.create') ? '<button class="btn primary" data-act="nav" data-to="athleten" data-arg="neu">+ Athlet:in aufnehmen</button>' : '') + `
    <div class="panel">
      <div class="toolbar">
        <input type="search" placeholder="Suchen: Name, ID, Disziplin, Verein …" value="${esc(filter.q)}" data-input="ath-filter-q" style="max-width:320px">
        <select data-change="ath-filter-sport"><option value="">Alle Sportarten</option>${options(sports, filter.sport)}</select>
        <select data-change="ath-filter-status">${options([['aktuelle', 'ohne Ausgetretene'], ['alle', 'alle Status'], ...state.meta.catalog.lifecycle], filter.status)}</select>
        <span class="right small muted">${rows.length} von ${athletes.length}</span>
      </div>
      ${rows.length ? `<div class="scroll"><table><tr><th>Athlet:in</th><th>ID</th><th>Sportart / Disziplin</th><th>Gruppe · Kader</th><th>Alter</th><th>Betreuung</th><th>Status</th></tr>
      ${rows.map((a) => `<tr class="click" data-act="nav" data-to="athleten" data-arg="${esc(a.id)}"><td><b>${esc(a.name)}</b>${a.demo ? ' <span class="pill tag-demo">Demo</span>' : ''}</td><td class="small nowrap">${esc(a.id)}</td>
        <td>${esc(a.sport)}<div class="small muted">${esc(a.discipline)}</div></td><td class="small">${esc(a.group || '–')}<div class="muted">${esc(a.kader)}</div></td><td>${ageOf(a.born)}</td>
        <td class="small">${a.team.filter((t) => t.function === 'Trainer:in').map((t) => esc(t.name)).join(', ') || '<span class="muted">kein Trainer zugeordnet</span>'}</td><td>${statusPill(a.status)}</td></tr>`).join('')}</table></div>`
      : `<div class="empty">${athletes.length ? 'Keine Treffer.' : (can('athletes.create') ? 'Noch keine Akten angelegt. Mit „+ Athlet:in aufnehmen“ beginnen.' : 'Ihnen sind noch keine Athlet:innen zugeordnet.')}</div>`}
    </div>`;
}
inputs['ath-filter-q'] = (el) => { filter.q = el.value; const pos = el.selectionStart; window.__lsa.rerender().then(() => { const n = document.querySelector('[data-input=ath-filter-q]'); n?.focus(); n?.setSelectionRange(pos, pos); }); };
changes['ath-filter-sport'] = (el) => { filter.sport = el.value; window.__lsa.rerender(); };
changes['ath-filter-status'] = (el) => { filter.status = el.value; window.__lsa.rerender(); };

forms['athlete-new'] = async (f, v) => {
  const r = await post('/api/athletes', athletePayload(v));
  toast(`Akte ${r.id} angelegt. Nächste Schritte: Betreuungsteam zuordnen, Dokumente ablegen.`);
  window.__lsa.go('athleten/' + r.id);
};

registerNav({ id: 'athleten', label: 'Athlet:innen', view: 'athleten', order: 10, show: (s) => s.user.role !== 'athlet' && s.permissions.tabs.overview !== 'none', match: (r) => r.name === 'athleten' });
registerNav({ id: 'meine-akte', label: 'Meine Akte', view: 'meine-akte', order: 10, show: (s) => s.user.role === 'athlet' });
registerView('meine-akte', {
  title: 'Meine Akte',
  guard: (s) => s.user.role === 'athlet' && !!s.user.athleteId,
  async render(parts) { return renderAkte(state.session.user.athleteId, parts[0]); },
  mount(root, parts) { mountAkte(root, [state.session.user.athleteId, parts[0]]); },
});
