// Aufruf des Servers. Alle Änderungen senden den Header X-LSA-Request (CSRF-Schutz).
export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data || {}; }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(method, url, body, opts = {}) {
  const headers = { 'X-LSA-Request': '1', ...(opts.headers || {}) };
  let payload;
  if (body instanceof Blob || body instanceof ArrayBuffer) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let r;
  try {
    r = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Der Server ist nicht erreichbar. Läuft das Programm noch (Fenster „LSA Athletenmanagement“)?');
  }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await r.json() : null;
  if (!r.ok) {
    if (r.status === 401 && !opts.noAuthRedirect) onUnauthorized();
    throw new ApiError(r.status, (data && data.error) || `Fehler ${r.status}`, data);
  }
  return data;
}
export const get = (u, o) => api('GET', u, undefined, o);
export const post = (u, b = {}, o) => api('POST', u, b, o);
export const put = (u, b = {}, o) => api('PUT', u, b, o);
export const del = (u, o) => api('DELETE', u, undefined, o);
