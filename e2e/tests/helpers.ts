import { expect, type Page } from '@playwright/test';

export const shot = (page: Page, name: string) =>
  page.screenshot({ path: `.artifacts/${name}.png`, fullPage: true });

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

/** Simulator verbinden → (Test: auto/Typ) → Gast → Nullen → Wiegen → Aufnahme-Schritt (noch nicht gestartet). */
export async function toRecordStep(page: Page, opts: { speed?: number; type?: string } = {}): Promise<void> {
  const speed = opts.speed ?? 5;
  await page.goto(`/test?speed=${speed}`);
  await page.getByTestId('sim-speed').selectOption(String(speed));
  await page.getByTestId('connect-button').click();
  await expect(page.getByTestId('status-connection')).toContainText('Verbunden');
  await page.getByTestId('next-button').click();
  await page.getByTestId(opts.type ? `type-${opts.type}` : 'type-auto').click();
  await page.getByTestId('next-button').click();
  await page.getByTestId('profile-guest').click();
  await page.getByTestId('next-button').click();
  await page.getByTestId('zero-start').click();
  await expect(page.getByTestId('status-zero')).toContainText('genullt', { timeout: 30_000 });
  await page.getByTestId('next-button').click();
  await page.getByTestId('sim-stepon').click();
  await expect(page.getByTestId('weigh-light')).toHaveAttribute('data-status', 'stable', { timeout: 40_000 });
  await page.getByTestId('weigh-accept').click();
  await expect(page.getByTestId('record-start')).toBeVisible();
}

/** Spielt einen Versuch im Simulator ab (Typ wählen → Ausführen). */
export async function perform(page: Page, type: string): Promise<void> {
  await page.getByTestId('sim-type').selectOption(type);
  await page.getByTestId('sim-perform').click();
}
