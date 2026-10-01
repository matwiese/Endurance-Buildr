// Minimaler HTTP-Server mit Router, Cookies, JSON, statischen Dateien und Sicherheits-Headern. Keine Fremdpakete.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
export const badRequest = (m, x) => new HttpError(400, m, x);
export const unauthorized = (m = 'Bitte anmelden.') => new HttpError(401, m);
export const forbidden = (m = 'Dafür fehlt die Berechtigung.') => new HttpError(403, m);
export const notFound = (m = 'Nicht gefunden.') => new HttpError(404, m);
export const conflict = (m) => new HttpError(409, m);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, opts, handler) {
    if (typeof opts === 'function') { handler = opts; opts = {}; }
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, opts, handler, pattern });
  }
  get(p, o, h) { this.add('GET', p, o, h); }
  post(p, o, h) { this.add('POST', p, o, h); }
  put(p, o, h) { this.add('PUT', p, o, h); }
  delete(p, o, h) { this.add('DELETE', p, o, h); }
  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
    return { route: null, pathMatched };
  }
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, `Datei bzw. Anfrage zu groß (Limit ${Math.round(limit / 1024 / 1024)} MB).`)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function createHttpServer({ router, publicDir, config, onRequestAuth, log }) {
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', ...(config.allowedHosts || []).map((h) => h.toLowerCase())]);

  const baseHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  };

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { ...baseHeaders, ...headers });
    res.end(body);
  }
  function sendJson(res, status, obj, extra = {}) {
    send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  }

  function serveStatic(req, res, pathname) {
    let rel = pathname === '/' ? '/index.html' : pathname;
    let file;
    try { file = path.normalize(path.join(publicDir, decodeURIComponent(rel))); } catch { return send(res, 400, 'Bad request'); }
    if (!file.startsWith(publicDir + path.sep) && file !== publicDir) return send(res, 403, 'Forbidden');
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        // Unbekannte Pfade ohne Dateiendung: Single-Page-App ausliefern
        if (!path.extname(rel)) return serveStatic(req, res, '/index.html');
        return send(res, 404, 'Nicht gefunden', { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
      if (req.headers['if-none-match'] === etag) return send(res, 304, '');
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { ...baseHeaders, 'Content-Type': type, 'Content-Length': st.size, ETag: etag, 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      // Schutz gegen DNS-Rebinding: nur erwartete Host-Header zulassen.
      const hostHeader = String(req.headers.host || '').toLowerCase();
      const host = hostHeader.startsWith('[') ? hostHeader.replace(/\]:\d+$/, ']') : hostHeader.replace(/:\d+$/, '');
      if (!allowedHosts.has(host)) return send(res, 421, 'Unerwarteter Host', { 'Content-Type': 'text/plain; charset=utf-8' });

      const url = new URL(req.url, `http://${hostHeader}`);
      const pathname = url.pathname;
      if (!pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
        return serveStatic(req, res, pathname);
      }

      const method = req.method;
      // CSRF: Änderungen nur mit eigenem Header und passendem Origin (zusätzlich zu SameSite=Strict-Cookie).
      if (!['GET', 'HEAD'].includes(method)) {
        if (req.headers['x-lsa-request'] !== '1') throw new HttpError(403, 'Ungültige Anfrage (fehlender Header).');
        const origin = req.headers.origin;
        if (origin) {
          let oh = ''; try { oh = new URL(origin).host.toLowerCase(); } catch { /* ungültig */ }
          if (oh !== hostHeader) throw new HttpError(403, 'Anfrage von fremder Herkunft abgelehnt.');
        }
      }

      const { route, params, pathMatched } = router.match(method === 'HEAD' ? 'GET' : method, pathname);
      if (!route) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Methode nicht erlaubt.' : 'Unbekannte Adresse.');

      const cookies = parseCookies(req.headers.cookie);
      const ctx = {
        req, res, method, url, pathname, params, query: Object.fromEntries(url.searchParams), cookies,
        ip: req.socket.remoteAddress, user: null, realUser: null, session: null, setCookies: [],
        async json(limit = 1024 * 1024) {
          const buf = await readBody(req, limit);
          if (!buf.length) return {};
          try { return JSON.parse(buf.toString('utf8')); } catch { throw new HttpError(400, 'Ungültiges JSON.'); }
        },
        async raw(limit) { return readBody(req, limit); },
      };
      await onRequestAuth(ctx);
      const auth = route.opts.auth ?? true;
      if (auth === true && !ctx.user) throw unauthorized();
      if (route.opts.feature && !(ctx.user && ctx.hasFeature(route.opts.feature))) {
        ctx.deny?.(route.opts.feature);
        throw forbidden();
      }
      const result = await route.handler(ctx);
      if (res.writableEnded) return;
      const extra = ctx.setCookies.length ? { 'Set-Cookie': ctx.setCookies } : {};
      if (result && result.__raw) {
        send(res, result.status || 200, result.body, { ...result.headers, ...extra });
      } else {
        sendJson(res, 200, result ?? { ok: true }, extra);
      }
    } catch (e) {
      if (res.writableEnded) return;
      if (e instanceof HttpError) {
        sendJson(res, e.status, { error: e.message, ...(e.extra || {}) });
      } else {
        log?.error?.('Unerwarteter Fehler', e);
        sendJson(res, 500, { error: 'Interner Fehler. Details stehen im Server-Protokoll.' });
      }
    }
  });
  server.requestTimeout = 120000;
  return server;
}

export const rawResponse = (body, headers = {}, status = 200) => ({ __raw: true, body, headers, status });
