// Systemkonzept (aus dem Prototyp übernommen) mit Berechtigungsmatrix aus der Datenbank-Rollenvorlage
import { esc, AREAS, lvl } from '../util.js';
import { state, views, registerView, registerNav, ensureMeta } from '../state.js';
import { head } from '../ui.js';

// [Modul, Funktion, Quelle im Konzept, Phase, View]
const MODS = [
  ['Personen, Rollen & Rechte', 'Benutzer anlegen, Rollenvorlage + Einzelrechte, Athletenbereich je Person, Protokoll jeder Rechteänderung.', 'Kap. 11, 12', 1, 'users'],
  ['Stammdaten & Lebenszyklus', 'Eine Athleten-ID über alle Systeme. Status aktiv, eingeschränkt, pausiert, ausgetreten. Austritt mit Checkliste.', 'Kap. 2, 3, 18', 2, 'athleten'],
  ['Akte: Dokumente & Notizen', 'Dateien und Einträge je Bereich; Zugriff folgt dem Bereich (Performance, Medizin, Psychologie, Schule).', 'Kap. 8, 12', 2, 'athleten'],
  ['Individueller Entwicklungsplan', 'Ausgangslage, Ziel, max. 2–3 Jahresziele je Bereich, Maßnahmen mit Verantwortung, Prüftermin, Erfolgskriterium, Wirkungskontrolle.', 'Kap. 4', 3, 'athleten'],
  ['Tages-Check & Trainingserfassung', 'Readiness in 30–60 s, Anwesenheit, Dauer, Session-RPE. Kein intransparenter Gesamtscore.', 'Kap. 5', 3, 'check'],
  ['Hinweise & Eskalation', 'Regeln erzeugen Prüfaufträge, keine Diagnosen. Fünf Stufen, jede mit Verantwortlichen und Kontrolltermin.', 'Kap. 17', 3, 'hinweise'],
  ['Belastungsstatus & Verletzungsregister', 'IOC-Mindestdatensatz in der medizinischen Akte. Nach außen nur Ampel, Erlaubtes, Verbotenes, Kontrolltermin.', 'Kap. 6', 4, 'verletzungen'],
  ['Geschützter Beratungsbereich', 'Psychologische Notizen bleiben getrennt. Weiter geht nur, was die Athlet:in freigibt.', 'Kap. 7, 8', 4, 'athleten'],
  ['Wochenbesprechung & Entscheidungsprotokoll', 'Automatische Agenda, nur Fälle mit Entscheidungsbedarf. Jede Entscheidung mit Anlass, Daten, Verantwortung, Prüftermin.', 'Kap. 10, 14', 4, 'besprechung'],
  ['Datenqualität', 'Validierung, Markieren statt Löschen, fehlende Werte sichtbar, Datenwörterbuch, Data Owner.', 'Kap. 9, 15, 16', 5, 'qualitaet'],
  ['Datenschutz, Audit, Löschfristen', 'Protokoll jedes Zugriffs, jährliche Rechteprüfung, Löschfristen, DSFA, Auskunft/Export.', 'Kap. 12, 13, 18', 5, 'datenschutz'],
  ['Safeguarding', 'Unabhängiger Meldeweg, Dokumentation außerhalb des Performance-Systems.', 'Kap. 1, 13', 5, 'safeguarding'],
  ['Kennzahlen', 'Nur aggregiert, kleine Gruppen unterdrückt. Erfolgskriterien nach drei Jahren als Zielwerte.', 'Kap. 11, 21', 5, 'kennzahlen'],
];

registerView('konzept', {
  title: 'Systemkonzept',
  async render() {
    const meta = await ensureMeta();
    const me = state.session.user.role;
    const mx = meta.roles.map((r) => `<tr class="${r.key === me ? 'me' : ''}"><td>${esc(r.label)}</td>${r.matrix.map((t) => `<td class="${lvl(t)}">${esc(t)}</td>`).join('')}</tr>`).join('');
    return head('So ist das Athletenmanagement aufgebaut', 'Der Prototyp setzt das Gesamtmodell des LSA um – jetzt mit echter Datenbank, Anmeldung und serverseitig durchgesetzten Rechten.') + `
    <div class="panel"><h3>Architektur: drei getrennte Datenbereiche, ein Entwicklungsplan</h3>
     <div class="arch" style="margin-top:8px">
       <div class="box" style="background:var(--navy)">Athlet:innen-Portal<small>Tages-Check, eigene Daten, Meldung</small></div>
       <div class="col">
         <div class="box" style="background:var(--petrol)">Performance-Akte<small>Training, Tests, Ziele, Maßnahmen, Kalender</small></div>
         <div class="box" style="background:var(--med)">Medizinische Akte<small>Diagnosen, Befunde, Reha, Freigaben</small></div>
         <div class="box" style="background:var(--psy)">Geschützter Beratungsbereich<small>Psychologie; Safeguarding separat</small></div>
       </div>
       <div class="col"><div class="flow f">vollständig</div><div class="flow r">nur Belastungsstatus</div><div class="flow r">nur freigegebene Hinweise</div></div>
       <div class="box" style="background:var(--signal);text-align:center;padding:22px 12px">Gemeinsamer Entwicklungsplan<small>ein Plan, ein Wochenplan</small></div>
       <div class="col"><div class="flow">Training</div><div class="flow">Schule</div><div class="flow">Regeneration</div><div class="flow">Wettkampf</div></div>
     </div>
     <div class="note">Gemeinsame Sicht heißt nicht, dass alle alles sehen. Für jede Verarbeitung von Gesundheitsdaten braucht es eine Rechtsgrundlage nach Art. 6 und eine Ausnahme nach Art. 9 DSGVO. Zweckbindung, Datenminimierung und Löschfristen sind eingebaut, nicht nachgerüstet.</div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="panel"><h3>Module und ihre Grundlage im Konzept</h3><div class="scroll"><table><tr><th>Modul</th><th>Funktion</th><th>Quelle</th></tr>
      ${MODS.map((m) => `<tr><td><b>${m[4] && views[m[4]] ? `<a href="#/${m[4]}">${esc(m[0])}</a>` : esc(m[0])}</b> <span class="phase ${views[m[4]] ? 'live' : ''}">Phase ${m[3]}${views[m[4]] ? ' · verfügbar' : ''}</span></td><td>${esc(m[1])}</td><td class="small muted">${esc(m[2])}</td></tr>`).join('')}</table></div></div>
      <div class="panel"><h3>Berechtigungsmatrix (Rollenvorlagen)</h3><p class="small muted">Ihre Rolle ist markiert. Pro Person lässt sich die Vorlage unter „Personen &amp; Rechte“ gezielt ändern. Die Zeile „Systemadministration“ ist eine Ergänzung der Umsetzung.</p>
      <div class="scroll"><table class="mx"><tr><th>Rolle</th>${AREAS.map((a) => `<th>${a}</th>`).join('')}</tr>${mx}</table></div></div>
    </div>
    <div class="panel" style="margin-top:14px"><h3>Datenverarbeitung in sieben Schritten</h3>
     <div class="steps7">${[['Erfassung', 'nah an der Quelle: Athlet:in, Trainer, Messsystem, Medizin, Schule, Koordination'], ['Validierung', 'fehlend, falsche Einheit, unmöglich, Duplikat, Sprung, Zeitstempel'], ['Aufbereitung', 'Einheiten, Zeiträume, Ausfalltage; Lücken bleiben sichtbar'], ['Analyse', 'vorab definierte Fragen, z. B. steigt Belastung schneller als Belastbarkeit?'], ['Interpretation', 'Trainer, Sportwissenschaft, Medizin im Kontext'], ['Entscheidung', 'protokolliert mit Anlass, Daten, Verantwortung'], ['Wirkungskontrolle', 'umgesetzt? verändert? beenden, anpassen, fortführen']].map((x) => `<div><b>${x[0]}</b>${x[1]}</div>`).join('')}</div>
     <p class="small muted" style="margin-top:10px">Pflicht-Metadaten je Datensatz: Athleten-ID, Datensatz-ID, Zeitpunkt, Kategorie, Quelle, erfassende Person oder Gerät, Einheit, Rohwert, berechneter Wert, Gültigkeit, Änderung und Änderungsverantwortlicher, Zugriffsgruppe, Aufbewahrungsfrist, Zweck, Qualitätskennzeichen.</p></div>`;
  },
});

registerNav({ id: 'konzept', label: 'Systemkonzept', view: 'konzept', order: 5 });
