// Dokumente & Notizen einer Akte (Akteneinträge) – wiederverwendbar je Kategorie oder gesamt
import { esc, fmtTs, fmtSize, nl2br } from '../util.js';
import { get, post, put, del, api } from '../api.js';
import { actions, forms, changes, toast, confirmDialog, options } from '../ui.js';
import { state } from '../state.js';

const editing = new Set(); // IDs der Einträge im Bearbeitungsmodus

function entryHtml(e, catLabels) {
  const isEdit = editing.has(e.id);
  const f = e.file;
  return `<div class="entry" id="entry-${e.id}">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div><b>${esc(e.title)}</b> <span class="pill">${esc(catLabels[e.category] || e.category)}</span>${e.visibleToAthlete ? ' <span class="pill ok-pill" title="Die Athlet:in sieht diesen Eintrag">für Athlet:in sichtbar</span>' : ''}
      <div class="small muted">${fmtTs(e.createdAt)} · ${esc(e.createdBy)}${e.updatedAt !== e.createdAt ? ' · geändert ' + fmtTs(e.updatedAt) : ''}</div></div>
      ${e.canEdit ? `<div class="row"><button class="btn sm" data-act="entry-edit" data-id="${e.id}">${isEdit ? 'Abbrechen' : 'Bearbeiten'}</button><button class="btn sm" data-act="entry-delete" data-id="${e.id}">Löschen</button></div>` : ''}
    </div>
    ${isEdit ? `<form data-form="entry-update" data-id="${e.id}" style="margin-top:8px">
      <div class="fgrid c2"><div class="f"><label>Titel</label><input name="title" value="${esc(e.title)}" required maxlength="200"></div>
      <div class="f"><label>Kategorie</label><select name="category">${options(Object.entries(catLabels), e.category)}</select></div></div>
      <div class="f"><label>Text</label><textarea name="text">${esc(e.text)}</textarea></div>
      <label class="chk"><input type="checkbox" name="visibleToAthlete" ${e.visibleToAthlete ? 'checked' : ''}> Für die Athlet:in sichtbar</label>
      <div class="err" data-err></div><button class="btn sm primary">Speichern</button></form>`
    : `${e.text ? `<div class="entry-text">${nl2br(e.text)}</div>` : ''}
      ${f ? `<div class="entry-file">${f.image ? `<a href="/api/entries/${e.id}/file" title="Herunterladen"><img class="thumb" src="/api/entries/${e.id}/file?inline=1" alt="${esc(f.name)}"></a>` : ''}
        <a class="btn sm" href="/api/entries/${e.id}/file" download>⬇ ${esc(f.name)}</a> <span class="small muted">${fmtSize(f.size)}</span></div>` : ''}`}
  </div>`;
}

export async function entriesPanel(athleteId, { category = null, title = 'Dokumente & Notizen', hint = '' } = {}) {
  const q = category ? `?category=${encodeURIComponent(category)}` : '';
  const d = await get(`/api/athletes/${encodeURIComponent(athleteId)}/entries${q}`);
  const cats = state.meta.catalog.docCategories;
  const labels = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, v.label]));
  const writable = d.writable.filter((c) => !category || c === category);
  const wLabels = Object.fromEntries(writable.map((c) => [c, labels[c]]));
  const allowed = state.meta.catalog.allowedUploads.map((x) => '.' + x).join(',');
  const rows = d.entries;
  if (category && !d.readable.includes(category) && !d.writable.includes(category)) return '';
  return `<div class="panel" style="margin-top:14px" data-entries="${esc(athleteId)}"><h3>${esc(title)}</h3>
    ${hint ? `<p class="small muted">${hint}</p>` : ''}
    ${rows.length ? rows.map((e) => entryHtml(e, labels)).join('') : '<p class="muted">Noch keine Einträge.</p>'}
    ${writable.length ? `<details style="margin-top:10px" ${rows.length ? '' : 'open'}><summary>＋ Eintrag oder Datei hinzufügen</summary>
      <form data-form="entry-new" data-athlete="${esc(athleteId)}" data-max="${d.maxUploadMb}" style="margin-top:10px">
        <div class="fgrid c2">
          <div class="f"><label>Kategorie</label>${category && wLabels[category] ? `<input type="hidden" name="category" value="${esc(category)}"><input value="${esc(labels[category])}" readonly>` : `<select name="category">${options(Object.entries(wLabels), writable[0])}</select>`}</div>
          <div class="f"><label>Titel</label><input name="title" required maxlength="200" placeholder="z. B. Befund, Gesprächsnotiz, Testprotokoll"></div>
        </div>
        <div class="f"><label>Text / Notiz</label><textarea name="text" maxlength="10000"></textarea></div>
        <div class="f"><label>Datei (optional, bis ${d.maxUploadMb} MB)</label><input type="file" name="file" accept="${esc(allowed)}"><span class="hint">PDF, Bilder, Office-Dokumente, Text/CSV, Video (mp4/mov)</span></div>
        <label class="chk"><input type="checkbox" name="visibleToAthlete"> Für die Athlet:in sichtbar</label>
        <div class="err" data-err></div>
        <button class="btn primary">Speichern</button></form></details>` : ''}
  </div>`;
}

forms['entry-new'] = async (f, v) => {
  const athlete = f.dataset.athlete;
  const file = f.elements.file?.files?.[0];
  const base = `/api/athletes/${encodeURIComponent(athlete)}/entries`;
  if (file) {
    if (file.size > Number(f.dataset.max) * 1024 * 1024) throw new Error(`Die Datei ist größer als ${f.dataset.max} MB.`);
    const qs = new URLSearchParams({ category: v.category, title: v.title, filename: file.name, visible: v.visibleToAthlete ? '1' : '0' });
    const r = await api('POST', `${base}/file?${qs}`, file);
    if (v.text) await put(`/api/entries/${r.id}`, { text: v.text });
  } else {
    if (!v.text) throw new Error('Bitte einen Text eingeben oder eine Datei auswählen.');
    await post(base, { category: v.category, title: v.title, text: v.text, visibleToAthlete: !!v.visibleToAthlete });
  }
  toast('Gespeichert.');
  await window.__lsa.rerender();
};
forms['entry-update'] = async (f, v) => {
  await put(`/api/entries/${f.dataset.id}`, { title: v.title, text: v.text, category: v.category, visibleToAthlete: !!v.visibleToAthlete });
  editing.delete(Number(f.dataset.id));
  toast('Gespeichert.');
  await window.__lsa.rerender();
};
actions['entry-edit'] = async (el) => {
  const id = Number(el.dataset.id);
  if (editing.has(id)) editing.delete(id); else editing.add(id);
  await window.__lsa.rerender();
};
actions['entry-delete'] = async (el) => {
  if (!(await confirmDialog('Diesen Eintrag (und eine ggf. angehängte Datei) endgültig löschen? Das Löschen wird im Zugriffsprotokoll festgehalten.', { ok: 'Löschen', danger: true }))) return;
  await del(`/api/entries/${el.dataset.id}`);
  toast('Gelöscht.');
  await window.__lsa.rerender();
};
