import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ADMIN_KEY, api, e2eEnv } from './env.ts';

// One household, set up from scratch: the steps share a browser session and build on each other.
test.describe.configure({ mode: 'serial' });

interface DraftInfo {
  scope: string;
  text: string;
  revision: number;
  images: Array<{ id: string }>;
}

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

let context: BrowserContext;
let page: Page;
let baseURL: string;
const cspViolations: string[] = [];
const hub = () => api(context.request, baseURL);
const drafts = async () => (await hub().get<{ items: DraftInfo[] }>('/drafts')).items;

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
    models: [{ id: 'fake-1' }, { id: 'fake-vision', name: 'Fake vision', vision: true }],
  });
  await hub().put('/models/defaults', {
    chat: `${provider.id}/fake-vision`,
    utility: `${provider.id}/fake-1`,
    thinkingLevel: 'off',
  });
  // changed behind the UI's back: reload instead of waiting for the query cache to go stale
  await page.reload();
  await expect(page.getByText('Welcome to Cangze')).toBeVisible();

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Fake models')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('All set')).toBeVisible();
  await page.getByRole('button', { name: 'Start your first conversation' }).click();
  await expect(page).toHaveURL(/\/sessions\/new$/);
});

test('new chat: no session until the first message, synced across devices', async ({ browser }) => {
  await expect(composer()).toBeVisible();
  expect(await hub().get<Array<{ id: string }>>('/sessions')).toHaveLength(0);

  await composer().fill('Lights check');
  await expect.poll(async () => (await drafts()).find((d) => d.scope === 'new')?.text).toBe('Lights check');
  expect(await hub().get<Array<{ id: string }>>('/sessions')).toHaveLength(0);

  await page.reload();
  await expect(composer()).toHaveValue('Lights check');
  await expect.poll(async () => (await drafts()).find((d) => d.scope === 'new')?.text).toBe('Lights check');

  // A second device joins the same new chat and adds text plus an image.
  const other = await browser.newContext({ baseURL, locale: 'en-US' });
  const otherPage = await other.newPage();
  await otherPage.goto('/');
  await otherPage.getByLabel('Admin key').fill(ADMIN_KEY);
  await otherPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(otherPage).toHaveURL(/\/sessions/);
  await otherPage.goto('/sessions/new');
  const otherComposer = otherPage.getByPlaceholder(/Enter to send/);
  await expect(otherComposer).toHaveValue('Lights check');
  await otherComposer.fill('Lights check from the other device');
  await expect(otherPage.getByRole('button', { name: 'Attach images' })).toBeEnabled();
  const chooserPromise = otherPage.waitForEvent('filechooser');
  await otherPage.getByRole('button', { name: 'Attach images' }).click();
  await (
    await chooserPromise
  ).setFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG, 'base64'),
  });
  await expect(otherPage.locator('img[src*="/api/v1/drafts/new/images/"]')).toHaveCount(1, {
    timeout: 20_000,
  });
  await expect
    .poll(async () => {
      const draft = (await drafts()).find((d) => d.scope === 'new');
      return draft ? { text: draft.text, images: draft.images.length } : null;
    })
    .toEqual({ text: 'Lights check from the other device', images: 1 });
  expect(await hub().get<Array<{ id: string }>>('/sessions')).toHaveLength(0);

  // The first device sees the remote edit without losing it.
  await expect(composer()).toHaveValue('Lights check from the other device');
  await expect(page.locator('img[src*="/api/v1/drafts/new/images/"]')).toHaveCount(1, {
    timeout: 20_000,
  });

  // Removing the image and clearing the text removes the singleton draft everywhere.
  await page
    .locator('img[src*="/api/v1/drafts/new/images/"]')
    .first()
    .locator('..')
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.locator('img[src*="/api/v1/drafts/new/images/"]')).toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(otherPage.locator('img[src*="/api/v1/drafts/new/images/"]')).toHaveCount(0, {
    timeout: 20_000,
  });
  await composer().fill('');
  await expect.poll(async () => (await drafts()).length).toBe(0);
  await expect(otherComposer).toHaveValue('');
  expect(await hub().get<Array<{ id: string }>>('/sessions')).toHaveLength(0);
  await other.close();
});

test('chat: the model searches devices with a tool', async () => {
  await say('Which lights are on?');
  await expect(page.getByText('Here is what I found')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('light.living_lamp').first()).toBeVisible();
  // the utility model titles the session
  await expect(page.getByText('Lights check').first()).toBeVisible({ timeout: 20_000 });
});

test('session drafts survive reloads', async () => {
  const id = page.url().split('/').pop()!;
  await composer().fill('Draft saved in this session');
  await expect
    .poll(async () => (await drafts()).find((d) => d.scope === id)?.text)
    .toBe('Draft saved in this session');
  await page.reload();
  await expect(composer()).toHaveValue('Draft saved in this session');
  await composer().fill('');
  await expect.poll(async () => (await drafts()).some((d) => d.scope === id)).toBe(false);
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

test('sending the first message from a draft creates exactly one session', async () => {
  const before = (await hub().get<Array<{ id: string }>>('/sessions')).length;
  await page.getByText('New session', { exact: true }).first().click();
  await expect(page).toHaveURL(/\/sessions\/new$/);
  expect(await hub().get<Array<{ id: string }>>('/sessions')).toHaveLength(before);

  await composer().fill('Hello from a draft');
  await expect(page.getByRole('button', { name: 'Attach images' })).toBeEnabled();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach images' }).click();
  await (
    await chooserPromise
  ).setFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG, 'base64'),
  });
  await expect(page.locator('img[src*="/api/v1/drafts/new/images/"]')).toHaveCount(1, {
    timeout: 20_000,
  });

  await composer().press('Enter');
  await expect(page).toHaveURL(/\/sessions\/[\w-]+$/);
  await expect(page.getByText('Hello from a draft').first()).toBeVisible();
  await expect(page.locator('img[src^="data:image"]').first()).toBeVisible();
  expect(await hub().get<Array<{ id: string }>>('/sessions')).toHaveLength(before + 1);
  await expect.poll(async () => (await drafts()).length).toBe(0);
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
  await expect(drawer.getByText('Unknown / incomplete pricing', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.locator('.ant-drawer .ant-list-item').filter({ hasText: 'succeeded' }).first().click();
  const reportDrawer = page.getByRole('dialog').filter({ has: page.getByText('Succeeded', { exact: true }) });
  await expect(reportDrawer).toBeVisible();
  await reportDrawer.getByRole('button', { name: 'Close' }).click();
});

test('agent edits merge independent changes and require explicit conflict choices', async () => {
  const created = await hub().post<{ id: string; revision: number; definition: Record<string, unknown> }>(
    '/agents',
    {
      definition: { name: 'Merge regression', instructions: 'Original instructions' },
    },
  );
  await page.goto(`/agents/${created.id}`);
  await page.getByRole('tab', { name: 'Definition', exact: true }).click();
  await page.locator('input[maxlength="80"]').fill('My renamed agent');
  await hub().put(`/agents/${created.id}`, {
    baseRevision: created.revision,
    definition: { ...created.definition, instructions: 'Remote instructions' },
  });
  await page.getByRole('button', { name: 'Review merge', exact: true }).click();
  await expect(page.getByText('No overlapping edits.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Apply to draft', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved as revision 3')).toBeVisible();
  const merged = await hub().get<typeof created>(`/agents/${created.id}`);
  expect(merged.definition).toMatchObject({ name: 'My renamed agent', instructions: 'Remote instructions' });
  await page.locator('input[maxlength="80"]').fill('Local conflict');
  await hub().put(`/agents/${created.id}`, {
    baseRevision: merged.revision,
    definition: { ...merged.definition, name: 'Remote conflict' },
  });
  await page.getByRole('button', { name: 'Review merge', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply to draft', exact: true })).toBeDisabled();
  await page.getByRole('radio', { name: /Remote version/ }).check();
  await page.getByRole('button', { name: 'Apply to draft', exact: true }).click();
  await expect(page.locator('input[maxlength="80"]')).toHaveValue('Remote conflict');
});

test('trigger JSON stays controlled and invalid objects block save and fire', async () => {
  const created = await hub().post<{ id: string }>('/agents', {
    definition: {
      name: 'JSON regression',
      instructions: 'Test only',
      triggers: [
        { id: 'json-event', kind: 'ha_event', eventType: 'test_event', dataMatch: { original: true } },
      ],
    },
  });
  await page.goto(`/agents/${created.id}`);
  await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
  const json = page.locator('textarea.cz-mono');
  for (const invalid of ['{', '[]', 'null']) {
    await json.fill(invalid);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Run now', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Fire once', exact: true })).toBeDisabled();
  }
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(json).toHaveValue(JSON.stringify({ original: true }, null, 2));
  await json.fill('{"changed":true}');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved as revision 2')).toBeVisible();
  await expect(json).toHaveValue(JSON.stringify({ changed: true }, null, 2));
});

test('mobile users can open notifications and run details', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.locator('.ant-drawer .ant-list-item').filter({ hasText: 'succeeded' }).first().click();
  const drawer = page.getByRole('dialog').filter({ has: page.getByText('Succeeded', { exact: true }) });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Close' }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
});

test('custom model prices distinguish unknown, configured and explicitly free', async () => {
  await page.goto('/settings/models');
  const provider = page.locator('.ant-list-item').filter({ hasText: 'Fake models' });
  await provider.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog');
  // fake-1 is the first configured model; fake-vision is second.
  const known = dialog.getByRole('checkbox', { name: 'Configure prices (explicit zero = free)' }).first();
  await expect(known).not.toBeChecked();
  await known.check();
  await dialog.getByLabel('Input', { exact: true }).first().fill('1.5');
  await dialog.getByLabel('Output', { exact: true }).first().fill('2');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const models = () =>
    hub().get<Array<{ ref: string; costKnown: boolean; cost: { input: number; output: number } }>>('/models');
  await expect
    .poll(async () => (await models()).find((m) => m.ref.endsWith('/fake-1'))?.cost)
    .toEqual({ input: 1.5, output: 2 });
  expect((await models()).find((m) => m.ref.endsWith('/fake-1'))?.costKnown).toBe(true);
  await provider.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(known).toBeChecked();
  await dialog.getByLabel('Input', { exact: true }).first().fill('0');
  await dialog.getByLabel('Output', { exact: true }).first().fill('0');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () => (await models()).find((m) => m.ref.endsWith('/fake-1'))?.cost)
    .toEqual({ input: 0, output: 0 });
  await provider.getByRole('button', { name: 'Edit', exact: true }).click();
  await known.uncheck();
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () => (await models()).find((m) => m.ref.endsWith('/fake-1'))?.costKnown)
    .toBe(false);
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
