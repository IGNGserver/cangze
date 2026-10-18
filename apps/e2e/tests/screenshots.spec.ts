import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { ADMIN_KEY } from './env.ts';

// README screenshots, taken from the household that hub.spec.ts set up. Opt-in:
//   CANGZE_SCREENSHOTS=../../docs/images pnpm --filter @cangze/e2e test
const outDir = process.env.CANGZE_SCREENSHOTS;
test.skip(!outDir, 'set CANGZE_SCREENSHOTS to a directory to take README screenshots');

for (const colorScheme of ['light', 'dark'] as const) {
  test(`screenshots (${colorScheme})`, async ({ browser }, info) => {
    const context = await browser.newContext({
      baseURL: info.project.use.baseURL!,
      locale: 'en-US',
      colorScheme,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const shot = (name: string) =>
      page.screenshot({ path: join(resolve(outDir!), `${name}-${colorScheme}.png`) });

    await page.goto('/');
    await page.getByLabel('Admin key').fill(ADMIN_KEY);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/sessions/);

    await page.getByText('Lights check').first().click();
    await expect(
      page.getByText('Approval needed').or(page.getByText('Here is what I found')).first(),
    ).toBeVisible();
    await page.waitForTimeout(500);
    await shot('session');

    await page.getByRole('link', { name: 'Devices', exact: true }).click();
    await expect(page.getByText('Bedroom light')).toBeVisible();
    await page.waitForTimeout(500);
    await shot('devices');

    await page.getByRole('link', { name: 'Agents', exact: true }).click();
    await page.getByText('Blank agent').first().click();
    await expect(page.getByRole('tab', { name: 'Permissions' })).toBeVisible();
    await page.waitForTimeout(500);
    await shot('agent');
    await context.close();
  });
}
