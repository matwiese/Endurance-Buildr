import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Produktionsnahe Prüfung: gebaute App (apps/web/dist) wird vom Fastify-Server selbst ausgeliefert (gleicher Ursprung,
 * CSP, Service Worker, Cache-Header). Aufruf: pnpm e2e:prod
 */
const chromium = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].find((p) => existsSync(p));

export const ADMIN = { email: 'admin@prod.test', password: 'prod-password-123' };
const PORT = 3100;
const root = resolve(import.meta.dirname, '..');

export default defineConfig({
  testDir: './tests-prod',
  timeout: 150_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: './.artifacts/results-prod',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: chromium, args: ['--no-sandbox'] },
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'pnpm --filter @buildr/web build && pnpm --filter @buildr/server start',
    url: `http://localhost:${PORT}/api/health`,
    cwd: '..',
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      DATA_DIR: resolve(import.meta.dirname, '.artifacts/prod-data'),
      WEB_DIST: resolve(root, 'apps/web/dist'),
      BOOTSTRAP_ADMIN_EMAIL: ADMIN.email,
      BOOTSTRAP_ADMIN_PASSWORD: ADMIN.password,
      BOOTSTRAP_ORG: 'Prod Verein',
      SCRYPT_LOG_N: '12',
    },
  },
});
