// System: Datenspeicher, Organisation, Sportarten, Backups, Testansicht
import { esc, fmtTs, fmtSize } from '../util.js';
import { get, post, put } from '../api.js';
import { actions, forms, toast, head, confirmDialog } from '../ui.js';
import { state, registerView, registerNav, can } from '../state.js';

registerView('system', {
  title: 'System',
  guard: () => can('system.manage'),
  async render() {
    const [sys, st] = await Promise.all([get('/api/system'), get('/api/settings')]);
    return head('System', 'Datenspeicher, Sicherungen und Grundeinstellungen.') + `
    <div class="grid g2">
      <div class="panel"><h3>Datenspeicher</h3>
        ${sys.dataDirFallback ? '<div class="note bad"><b>Ausweichordner aktiv.</b> Der gewünschte Datenordner war nicht beschreibbar. Bitte Berechtigungen prüfen oder in <code>config.json</code> einen anderen Ordner eintragen.</div>' : ''}
        <dl class="kv"><dt>Datenordner</dt><dd><code>${esc(sys.dataDir)}</code></dd>
        <dt>Datenbank</dt><dd><code>${esc(sys.dbFile)}</code> (${fmtSize(sys.dbSize)})</dd>
        <dt>Dokumente</dt><dd><code>${esc(sys.docsDir)}</code> (${fmtSize(sys.docSize)})</dd>
        <dt>Sicherungen</dt><dd><code>${esc(sys.backupDir)}</code></dd>
        <dt>Protokolldatei</dt><dd><code>${esc(sys.logDir)}</code></dd>
        <dt>Inhalt</dt><dd>${sys.counts.users} Personen · ${sys.counts.athletes} Athlet:innen · ${sys.counts.audit} Protokolleinträge</dd>
        <dt>Version</dt><dd>${esc(sys.version)} · Datenbank-Schema ${sys.schemaVersion} · Node ${esc(sys.node)} (${esc(sys.platform)})</dd>
        <dt>Erreichbar unter</dt><dd><code>http://localhost:${sys.port}</code> (nur dieser Rechner${sys.bind !== '127.0.0.1' ? ' – ACHTUNG: Server ist im Netzwerk erreichbar: ' + esc(sys.bind) : ''})</dd></dl>
        <div class="note" style="margin-bottom:0">Die Daten enthalten Gesundheitsdaten Minderjähriger. Laufwerk C: bitte mit BitLocker verschlüsseln und den Datenordner nur für berechtigte Windows-Konten zugänglich halten.</div></div>
      <div class="panel"><h3>Sicherungen</h3>
        <p class="small muted">Eine Sicherung enthält die Datenbank und alle Dokumente. Beim Start des Programms wird außerdem täglich automatisch die Datenbank gesichert (die letzten 14 Tage bleiben erhalten).</p>
        <button class="btn primary" data-act="backup-now">Jetzt Sicherung erstellen</button>
        <div class="scroll" style="margin-top:10px">${sys.backups.length ? `<table><tr><th>Sicherung</th><th>Art</th><th>Datenbank</th><th>Dokumente</th></tr>${sys.backups.slice(0, 10).map((b) => `<tr><td class="small"><code>${esc(b.name)}</code></td><td class="small">${esc(b.label)}</td><td class="small">${fmtSize(b.dbSize)}</td><td class="small">${b.documents ?? '–'}</td></tr>`).join('')}</table>` : '<p class="muted">Noch keine Sicherung vorhanden.</p>'}</div>
        <details style="margin-top:10px"><summary>Wiederherstellen</summary><ol class="small"><li>Programm beenden (Fenster schließen).</li><li>Ordner <code>lsa.sqlite</code>, <code>lsa.sqlite-wal</code>, <code>lsa.sqlite-shm</code> im Datenordner an einen sicheren Ort verschieben.</li><li>Aus dem Sicherungsordner <code>lsa.sqlite</code> (und ggf. <code>dokumente\\</code>) in den Datenordner kopieren.</li><li>Programm neu starten.</li></ol></details></div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <form class="panel" data-form="settings-org"><h3>Organisation</h3>
        <div class="f"><label>Name der Organisation</label><input name="orgName" type="text" value="${esc(st.orgName)}" required></div>
        <div class="f"><label>Präfix der Athleten-ID</label><input name="athletePrefix" type="text" value="${esc(st.athletePrefix)}" pattern="[A-Za-z0-9]{2,8}" required><span class="hint">gilt für neu angelegte Akten, z. B. <code>${esc(st.athletePrefix)}-0001</code></span></div>
        <label class="chk"><input type="checkbox" name="testMode" ${st.testMode ? 'checked' : ''}><span><b>Testansicht erlauben</b><span class="d">Administration kann die Anwendung mit den Rechten einer anderen Person ansehen (jede Nutzung wird protokolliert). Für den Echtbetrieb ausschalten.</span></span></label>
        <div class="err" data-err></div><button class="btn primary">Speichern</button></form>
      <form class="panel" data-form="settings-sports"><h3>Sportarten</h3>
        <p class="small muted">Eine pro Zeile. Verwendete Sportarten (bei Athlet:innen oder im Athletenbereich einer Person) lassen sich nicht entfernen.</p>
        <textarea name="sports" rows="6" style="min-height:120px">${esc(st.sports.join('\n'))}</textarea>
        <div class="err" data-err></div><button class="btn primary" style="margin-top:6px">Speichern</button></form>
    </div>`;
  },
});

forms['settings-org'] = async (f, v) => {
  await put('/api/settings', { orgName: v.orgName, athletePrefix: v.athletePrefix, testMode: !!v.testMode });
  toast('Gespeichert.');
  await window.__lsa.refresh();
};
forms['settings-sports'] = async (f, v) => {
  await put('/api/settings', { sports: v.sports.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) });
  toast('Sportarten gespeichert.');
  await window.__lsa.refresh();
};
actions['backup-now'] = async (el) => {
  el.disabled = true; el.textContent = 'Sicherung läuft …';
  try { const r = await post('/api/backup'); toast(`Sicherung erstellt: ${r.backup.name}`); } finally { await window.__lsa.rerender(); }
};

registerNav({ id: 'system', label: 'System', view: 'system', order: 90, show: () => can('system.manage') });
