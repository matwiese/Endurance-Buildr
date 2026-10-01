import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const chromium = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].find((p) => existsSync(p));

export const ADMIN = { email: 'admin@e2e.test', password: 'e2e-password-123' };
const API_PORT = 3000;
// absolut: `pnpm --filter` startet den Server im Verzeichnis apps/server
const DATA_DIR = resolve(import.meta.dirname, '.artifacts/server-data');
const WEB_PORT = 5173;

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: './.artifacts/results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: chromium, args: ['--no-sandbox'] },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'tablet',
      testIgnore: [/auth\.setup\.ts/, /login\.spec\.ts/],
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        hasTouch: true,
        storageState: '.artifacts/admin.json',
      },
    },
    {
      // ohne vorhandene Sitzung (Anmeldung, Rollen)
      name: 'anonymous',
      testMatch: /login\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, hasTouch: true },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          // frische Datenbank je Lauf (PGlite im Dateisystem), Admin per Umgebungsvariablen
          command: `rm -rf ${DATA_DIR} && pnpm --filter @buildr/server start`,
          url: `http://localhost:${API_PORT}/api/health`,
          cwd: '..',
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            PORT: String(API_PORT),
            DATA_DIR,
            BOOTSTRAP_ADMIN_EMAIL: ADMIN.email,
            BOOTSTRAP_ADMIN_PASSWORD: ADMIN.password,
            BOOTSTRAP_ORG: 'E2E Verein',
            SCRYPT_LOG_N: '12',
            LOGIN_MAX_ATTEMPTS: '50',
          },
        },
        {
          command: 'pnpm --filter @buildr/web dev',
          url: `http://localhost:${WEB_PORT}`,
          cwd: '..',
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
});
