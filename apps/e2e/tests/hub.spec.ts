import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ADMIN_KEY, api, e2eEnv } from './env.ts';

// One household, set up from scratch: the steps share a browser session and build on each other.
test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;
let baseURL: string;
const cspViolations: string[] = [];
const hub = () => api(context.request, baseURL);

test.beforeAll(async ({ browser }, info) => {
  baseURL = info.project.use.baseURL!;
  context = await browser.newContext({ baseURL, locale: 'en-US' });
  page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) cspViolations.push(msg.text());
  });
});

test.afterAll(async () => {
  await context.close();
});

const composer = () => page.getByPlaceholder(/Enter to send/);

async function say(text: string) {
  await composer().fill(text);
  await composer().press('Enter');
}

test('first start: bootstrap code and admin key', async () => {
  await page.goto('/');
  await expect(page.getByText('Set up Cangze')).toBeVisible();
  // a wrong code is rejected without consuming the real one
  await page.getByLabel('Bootstrap code').fill('AAAA-BBBB-CCCC');
  await page.getByLabel('Admin key', { exact: true }).fill(ADMIN_KEY);
  await page.getByLabel('Confirm key').fill(ADMIN_KEY);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByText('The bootstrap code is wrong')).toBeVisible();

  await page.getByLabel('Bootstrap code').fill(e2eEnv().bootstrapCode);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByText('Welcome to Cangze')).toBeVisible();
});

test('security headers are sent with the UI', async () => {
  const res = await context.request.get('/');
  expect(res.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(res.headers()['x-frame-options']).toBe('DENY');
});

test('welcome wizard: connect Home Assistant and add a model', async () => {
  const env = e2eEnv();
  await page.getByLabel('Home Assistant URL').fill(env.haUrl);
  await page.getByLabel('Long-lived access token').fill(env.haToken);
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText(/^Connected to /)).toBeVisible();
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await expect(page.getByText('Home Assistant connected')).toBeVisible();

  // The provider dialog is covered by unit tests; here the API adds it while the wizard is open.
  const provider = await hub().post<{ id: string }>('/providers', {
    kind: 'custom',
    name: 'Fake models',
    api: 'openai-completions',
    baseUrl: env.llmUrl,
    models: [{ id: 'fake-1' }],
  });
  await hub().put('/models/defaults', { chat: `${provider.id}/fake-1`, utility: null, thinkingLevel: 'off' });
  // changed behind the UI's back: reload instead of waiting for the query cache to go stale
  await page.reload();
  await expect(page.getByText('Welcome to Cangze')).toBeVisible();

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Fake models')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('All set')).toBeVisible();
  await page.getByRole('button', { name: 'Start your first conversation' }).click();
  await expect(page).toHaveURL(/\/sessions\/[\w-]+$/);
});

test('chat: the model searches devices with a tool', async () => {
  await say('Which lights are on?');
  await expect(page.getByText('Here is what I found')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('light.living_lamp').first()).toBeVisible();
  // the utility model titles the session
  await expect(page.getByText('Lights check').first()).toBeVisible({ timeout: 20_000 });
});

test('approval: unlocking asks the user first', async () => {
  await say('Please unlock the front door');
  await expect(page.getByText('Approval needed')).toBeVisible({ timeout: 20_000 });
  const before = await hub().get<{ state: string }>('/ha/entities/lock.front_door');
  expect(before.state).toBe('locked');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect
    .poll(async () => (await hub().get<{ state: string }>('/ha/entities/lock.front_door')).state)
    .toBe('unlocked');
  await expect(page.getByText('Here is what I found')).toHaveCount(2, { timeout: 20_000 });
});

test('devices: live state and quick controls', async () => {
  await page.getByRole('link', { name: 'Devices', exact: true }).click();
  await expect(page).toHaveURL(/\/devices/);
  const tile = page.getByRole('button').filter({ hasText: 'Bedroom light' });
  const toggle = tile.getByRole('switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect((await hub().get<{ state: string }>('/ha/entities/light.bedroom')).state).toBe('on');
  // the lock was unlocked in the previous step
  await expect(
    page.getByRole('button').filter({ hasText: 'Front door' }).getByRole('button', { name: 'Lock' }),
  ).toBeVisible();
});

test('agents: create from a template and run it', async () => {
  await page.getByRole('link', { name: 'Agents', exact: true }).click();
  await page.getByRole('button', { name: 'New agent' }).first().click();
  await page.getByRole('dialog').getByText('Blank agent').click();
  await expect(page.getByRole('tab', { name: 'Permissions' })).toBeVisible();
  await page.getByRole('button', { name: 'Run now' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Run' }).click();
  await expect(page.locator('.ant-tag').filter({ hasText: 'Succeeded' }).first()).toBeVisible({
    timeout: 30_000,
  });
  await page.locator('tr.ant-table-row').first().click();
  const drawer = page.locator('.ant-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('Succeeded', { exact: true })).toBeVisible();
  await expect(drawer.getByText('$0.0000', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.locator('.ant-drawer .ant-list-item').filter({ hasText: 'succeeded' }).first().click();
  await expect(page.locator('.ant-drawer').getByText('Succeeded', { exact: true })).toBeVisible();
  await page.locator('.ant-drawer').getByRole('button', { name: 'Close' }).click();
});

test('backup and restore', async () => {
  await page.goto('/settings/data');
  await page.getByRole('button', { name: 'Back up now' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Back up now' }).click();
  await expect(page.getByText('Backup created')).toBeVisible();
  await expect(page.locator('.ant-list-item').filter({ hasText: 'manual' })).toHaveCount(1);

  // made after the backup, so the restore removes it
  const later = await hub().post<{ id: string }>('/sessions', { title: 'After the backup' });
  const startsBefore = e2eEnv().starts;

  await page
    .locator('.ant-list-item')
    .filter({ hasText: 'manual' })
    .getByRole('button', { name: 'Restore' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Restoring and restarting the hub')).toBeVisible();
  await expect.poll(() => e2eEnv().starts, { timeout: 30_000 }).toBe(startsBefore + 1);
  // the page reloads by itself once the hub is back; the restored database still knows this sign-in
  await expect(page.getByText('Restoring and restarting the hub')).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Back up now' }).first()).toBeVisible();
  const sessions = await hub().get<Array<{ id: string }>>('/sessions');
  expect(sessions.map((s) => s.id)).not.toContain(later.id);
  await expect(page.locator('.ant-list-item').filter({ hasText: 'pre-restore' })).toHaveCount(1, {
    timeout: 15_000,
  });
});

test('the UI ran without Content Security Policy violations', () => {
  expect(cspViolations).toEqual([]);
});
