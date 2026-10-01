// Gemeinsame UI-Bausteine: Aktionen (data-act), Formulare (data-form), Dialoge, Hinweise.
import { esc } from './util.js';
import { ApiError } from './api.js';

export const actions = {};   // <button data-act="name">  -> actions.name(element, event)
export const forms = {};     // <form data-form="name">   -> forms.name(formElement, values, event)
export const changes = {};   // <select data-change="name"> -> changes.name(element, event)
export const inputs = {};    // <input data-input="name">  -> inputs.name(element, event)

let toastTimer;
export function toast(msg, kind = '') {
  const host = document.getElementById('toastHost');
  if (!host) return;
  host.innerHTML = `<div class="toast ${kind}" role="status">${esc(msg)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { host.innerHTML = ''; }, kind === 'error' ? 7000 : 3800);
}
export function reportError(e) {
  console.error(e);
  toast(e instanceof ApiError ? e.message : `Unerwarteter Fehler: ${e.message || e}`, 'error');
}

export function showModal(innerHtml, { wide = false } = {}) {
  const host = document.getElementById('modalHost');
  host.innerHTML = `<div class="modal-back" data-act="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" style="${wide ? 'max-width:860px' : ''}">${innerHtml}</div></div>`;
  const first = host.querySelector('input,select,textarea,button');
  first?.focus();
}
export function closeModal() { document.getElementById('modalHost').innerHTML = ''; }
actions['dlg-cancel'] = () => closeModal();

// Ja/Nein-Abfrage als Dialog, liefert Promise<boolean>
export function confirmDialog(message, { ok = 'Ja', cancel = 'Abbrechen', danger = false, title = 'Bitte bestätigen' } = {}) {
  return new Promise((resolve) => {
    showModal(`<h2>${esc(title)}</h2><p>${esc(message)}</p>
      <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" data-act="dlg-no">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="dlg-yes">${esc(ok)}</button></div>`);
    actions['dlg-yes'] = () => { closeModal(); resolve(true); };
    actions['dlg-no'] = () => { closeModal(); resolve(false); };
  });
}

export function formValues(form) {
  const out = {};
  for (const [k, v] of new FormData(form).entries()) {
    if (typeof v !== 'string') continue;
    if (k in out) out[k] = [].concat(out[k], v); else out[k] = v;
  }
  return out;
}
export const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function installGlobalHandlers({ onError = reportError } = {}) {
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'radio' && t.type !== 'button')) return;
    const name = t.dataset.act;
    if (name === 'modal-backdrop') { if (e.target === t) closeModal(); return; }
    const fn = actions[name];
    if (!fn) return;
    if (t.tagName === 'A') e.preventDefault();
    try { await fn(t, e); } catch (err) { onError(err); }
  });
  document.addEventListener('change', async (e) => {
    const t = e.target.closest('[data-change]');
    if (!t) return;
    try { await changes[t.dataset.change]?.(t, e); } catch (err) { onError(err); }
  });
  document.addEventListener('input', async (e) => {
    const t = e.target.closest('[data-input]');
    if (!t) return;
    try { await inputs[t.dataset.input]?.(t, e); } catch (err) { onError(err); }
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const btn = e.submitter || f.querySelector('button:not([type=button])');
    const errBox = f.querySelector('[data-err]');
    if (errBox) errBox.textContent = '';
    if (btn) btn.disabled = true;
    try { await forms[f.dataset.form]?.(f, formValues(f), e); }
    catch (err) {
      if (errBox && err instanceof ApiError) errBox.textContent = err.message; else onError(err);
    } finally { if (btn && btn.isConnected) btn.disabled = false; }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

// Hilfsfunktionen für HTML-Bausteine
export const options = (list, selected) => list.map((o) => {
  const [v, l] = Array.isArray(o) ? o : [o, o];
  return `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(l)}</option>`;
}).join('');
export const head = (title, sub = '', right = '') => `<div class="head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="row">${right}</div></div>`;
export const locked = (title, reason) => `<div class="locked"><h3>🔒 ${esc(title)}</h3><p style="margin:0 auto">${esc(reason)}</p></div>`;
export const kpi = (v, l, t = '') => `<div class="panel kpi"><div class="v">${v}</div><div class="l">${l}</div>${t ? `<div class="t">${t}</div>` : ''}</div>`;
