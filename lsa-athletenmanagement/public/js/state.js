// Globaler Zustand: Sitzung (angemeldete Person + Rechte), Metadaten, View-Registry.
import { get } from './api.js';

export const state = { session: null, meta: null };
export const views = {};   // name -> { title, guard(session)->bool, render(params)->html, mount(root,params) }
export const navItems = []; // { id, label, view, order, show(session), badge() }

export const registerView = (name, def) => { views[name] = def; };
export const registerNav = (item) => { navItems.push(item); navItems.sort((a, b) => (a.order ?? 50) - (b.order ?? 50)); };

export async function loadSession() {
  state.session = await get('/api/session', { noAuthRedirect: true });
  if (state.session.authenticated && !state.meta) {
    try { state.meta = await get('/api/meta'); } catch { /* wird bei Passwortpflicht nachgeladen */ }
  }
  return state.session;
}
export async function ensureMeta() {
  if (!state.meta) state.meta = await get('/api/meta');
  return state.meta;
}

export const me = () => state.session?.user;
export const can = (feature) => !!state.session?.permissions?.features?.[feature];
export const level = (tab) => state.session?.permissions?.tabs?.[tab] || 'none';
export const isRole = (...r) => r.includes(state.session?.user?.role);
export const roleLabel = (key) => state.meta?.roles.find((r) => r.key === key)?.label || key;
