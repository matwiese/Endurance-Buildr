// Kennzahlen: nur aggregiert, ohne Namen, kleine Gruppen unterdrückt
import { esc, pct } from '../util.js';
import { get } from '../api.js';
import { head, kpi } from '../ui.js';
import { registerView, registerNav, can } from '../state.js';
import { cockpits } from './start.js';

export async function kennzahlenHtml() {
  const k = await get('/api/kpi');
  const cls = (v, goal) => (v != null && v > goal ? 'ok' : 'warn');
  return head('Kennzahlen', `Nur aggregiert und ohne Namen. Gruppen unter ${k.kMin} Personen werden unterdrückt. Die Geschäftsführung benötigt keine individuellen Gesundheitsdaten.`) + `
  <div class="grid g4">${kpi(k.athletes, 'betreute Athlet:innen')}${kpi(pct(k.availability), 'Trainingsverfügbarkeit (14 Tage)')}${kpi(k.lostDays, 'laufende Ausfall- und Einschränkungstage')}${kpi(pct(k.completeness), 'Datenvollständigkeit Tages-Check')}</div>
  <div class="panel" style="margin-top:14px"><h3>Erfolgskriterien nach drei Jahren</h3><table><tr><th>Kriterium</th><th>Ziel</th><th>Aktuell</th></tr>
   <tr><td>Vollständige Entwicklungspläne</td><td>&gt; 95 %</td><td class="${cls(k.planComplete, 0.95)}">${pct(k.planComplete)}</td></tr>
   <tr><td>Dokumentierte Maßnahmenkontrolle</td><td>&gt; 90 %</td><td class="${cls(k.measureControl, 0.9)}">${pct(k.measureControl)}</td></tr>
   <tr><td>Ungeklärte Datensätze</td><td>&lt; 5 %</td><td>${k.openFlags} markierte Werte offen</td></tr>
   <tr><td>Unberechtigte Datenzugriffe</td><td>0</td><td class="ok">0 erfolgreich · ${k.deniedAccess} verweigerte Versuche protokolliert</td></tr></table></div>
  <div class="panel scroll" style="margin-top:14px"><h3>Nach Sportart</h3><table><tr><th>Sportart</th><th>Athlet:innen</th><th>Trainingsverfügbarkeit</th><th>Offene Verletzungen/Erkrankungen</th><th>Datenvollständigkeit</th></tr>
   ${k.bySport.map((b) => b.suppressed ? `<tr><td>${esc(b.sport)}</td><td>&lt; ${k.kMin}</td><td colspan="3" class="muted">unterdrückt (Gruppe zu klein für anonyme Auswertung)</td></tr>` : `<tr><td>${esc(b.sport)}</td><td>${b.n}</td><td>${pct(b.availability)}</td><td>${esc(b.openInjuries)}</td><td>${pct(b.completeness)}</td></tr>`).join('')}</table>
   <p class="small muted">Weitere Kennzahlen im Echtbetrieb: Schulabschlussquote, Kaderübergänge, Drop-outs, Wartezeiten, Nutzung der Angebote, Personalbelastung.</p></div>`;
}

registerView('kennzahlen', { title: 'Kennzahlen', guard: () => can('kpi.view'), render: kennzahlenHtml });
registerNav({ id: 'kennzahlen', label: 'Kennzahlen', view: 'kennzahlen', order: 65, show: () => can('kpi.view') });
cockpits.push({ match: (s) => s.user.role === 'management', render: () => kennzahlenHtml() });
