import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY } from '../src/security.ts';
import { makeServer, type TestServer } from './helpers.ts';

let s: TestServer | undefined;
afterEach(async () => {
  await s?.close();
  s = undefined;
});

describe('Sicherheits-Header und statische Auslieferung', () => {
  it('API und App senden CSP, Permissions-Policy und Co.; API ist nie cachebar', async () => {
    s = await makeServer();
    const res = await s.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-security-policy']).toBe(CONTENT_SECURITY_POLICY);
    expect(res.headers['content-security-policy']).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/);
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['permissions-policy']).toContain('microphone=()');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('Statische Dateien: gehashte Assets unveränderlich, Einstiegsseite/Service Worker immer prüfen; SPA-Fallback', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'bf-dist-'));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>x</title>');
    writeFileSync(join(dist, 'sw.js'), '// sw');
    writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'export {}');
    s = await makeServer({ WEB_DIST: dist });
    const asset = await s.app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(asset.statusCode, asset.body).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const sw = await s.app.inject({ method: 'GET', url: '/sw.js' });
    expect(sw.headers['cache-control']).toBe('no-cache');
    const spa = await s.app.inject({ method: 'GET', url: '/hub/athletes' });
    expect(spa.statusCode).toBe(200);
    expect(spa.headers['content-type']).toContain('text/html');
    expect(spa.headers['cache-control']).toBe('no-cache');
    expect(spa.headers['content-security-policy']).toBe(CONTENT_SECURITY_POLICY);
    const api404 = await s.app.inject({ method: 'GET', url: '/api/nope' });
    expect([401, 404]).toContain(api404.statusCode); // unbekannte API-Pfade fallen nie auf die SPA zurück
    expect(api404.headers['content-type']).toContain('application/json');
  });

  it('WEB_DIST: relative Pfade gelten ab INIT_CWD (pnpm-Startverzeichnis); fehlender Ordner → 404 statt 500', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bf-root-'));
    mkdirSync(join(root, 'apps', 'web', 'dist'), { recursive: true });
    writeFileSync(join(root, 'apps', 'web', 'dist', 'index.html'), '<!doctype html><title>x</title>');
    s = await makeServer({ INIT_CWD: root, WEB_DIST: 'apps/web/dist' });
    expect((await s.app.inject({ method: 'GET', url: '/' })).statusCode).toBe(200);
    await s.close();
    s = await makeServer({ INIT_CWD: root, WEB_DIST: 'gibt-es-nicht' });
    expect((await s.app.inject({ method: 'GET', url: '/' })).statusCode).toBe(404);
    expect((await s.app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });
});
