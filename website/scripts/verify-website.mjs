/* global document, requestAnimationFrame, HTMLImageElement */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

function resolveCachedChromiumExecutable() {
  if (existsSync(chromium.executablePath())) return undefined;
  const cacheRoot =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Caches', 'ms-playwright')
      : join(homedir(), '.cache', 'ms-playwright'));
  if (!existsSync(cacheRoot)) return undefined;
  const dirs = readdirSync(cacheRoot)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort()
    .reverse();
  for (const d of dirs) {
    for (const sub of ['chrome-headless-shell-mac-x64', 'chrome-headless-shell-mac-arm64', 'chrome-linux']) {
      const bin = join(cacheRoot, d, sub, 'chrome-headless-shell');
      if (existsSync(bin)) return bin;
    }
  }
  return undefined;
}

/**
 * Automated End-to-End Visual, Interactive, Mobile & Performance Verification
 * for the Cangze Official Website (website/).
 */

const PORT = 4289;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT_DIR = process.env.WEBSITE_SCREENSHOT_DIR || join(process.cwd(), 'test-results', 'visual-audit');

mkdirSync(OUT_DIR, { recursive: true });

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          resolve();
          return;
        }
      } catch {
        // retry
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for preview server at ${url}`));
        return;
      }
      setTimeout(check, 200);
    };
    void check();
  });
}

async function runVerification() {
  const server = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
    {
      stdio: 'pipe',
    },
  );

  const errors = [];
  let browser;

  try {
    await waitForServer(BASE_URL);
    process.stdout.write(`[verify] Preview server ready at ${BASE_URL}\n`);

    browser = await chromium.launch({
      headless: true,
      executablePath: resolveCachedChromiumExecutable(),
      args: [
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    });

    const scrollToStart = async (targetPage, selector) => {
      await targetPage.evaluate((sel) => {
        document.querySelector(sel)?.scrollIntoView({ behavior: 'instant', block: 'start' });
      }, selector);
    };

    // =========================================================================
    // 1. DESKTOP FULL VISUAL & INTERACTIVE AUDIT (1440 x 900)
    // =========================================================================
    const desktopCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1.5,
    });
    const page = await desktopCtx.newPage();

    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(`console.error: ${msg.text()}`);
      }
    });
    page.on('response', (res) => {
      if (res.status() >= 400) {
        errors.push(`HTTP ${res.status()}: ${res.url()}`);
      }
    });

    const t0 = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const loadMs = Date.now() - t0;

    // Wait for cangze-residence.glb to finish loading into Three.js
    await page.waitForSelector('[data-testid="residence-stage"][data-model-loaded="true"]', {
      timeout: 10000,
    });
    await page.waitForTimeout(700);

    // Check horizontal overflow on desktop
    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    if (desktopOverflow) {
      throw new Error('Desktop horizontal overflow detected');
    }

    // Measure FPS over ~600ms
    const fps = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          const start = performance.now();
          function step() {
            frames++;
            if (performance.now() - start >= 600) {
              resolve(Math.round((frames * 1000) / (performance.now() - start)));
            } else {
              requestAnimationFrame(step);
            }
          }
          requestAnimationFrame(step);
        }),
    );

    await page.screenshot({ path: join(OUT_DIR, '01-hero-dusk.png') });

    // 2. Test 3D Roam Mode & Time-of-Day Lighting Presets
    await page.getByTestId('toggle-roam-btn').click();
    await page.waitForTimeout(650);
    await page.screenshot({ path: join(OUT_DIR, '02-roam-3d-dusk.png') });

    await page.getByTestId('tod-day').click();
    await page.waitForTimeout(450);
    await page.screenshot({ path: join(OUT_DIR, '03-roam-3d-daylight.png') });

    await page.getByTestId('tod-dusk').click();
    await page.getByTestId('toggle-roam-btn').click();
    await page.waitForTimeout(400);

    // 3. Test Spatial Room Explorer & Real-Time Device Controls
    await scrollToStart(page, '#explore');
    await page.waitForTimeout(550);
    await page.getByTestId('explore-room-living_room').click();
    await page.waitForTimeout(650);
    await page.getByTestId('toggle-light.living_lamp').click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(OUT_DIR, '04-explore-living-room.png') });

    await page.getByTestId('explore-room-bedroom').click();
    await page.waitForTimeout(700);
    await page.getByTestId('climate-dec-climate.bedroom_ac').click();
    await page.screenshot({ path: join(OUT_DIR, '05-explore-master-suite.png') });

    // 4. Test AI Bedtime Routine ("帮我准备睡觉") -> Pause at Lock Approval -> Approve!
    await scrollToStart(page, '#bedtime');
    await page.waitForTimeout(400);
    await page.getByTestId('run-bedtime-btn').click();

    // Wait for waiting_approval state and ApprovalCard
    await page.waitForSelector('[data-testid="approval-card"]', { timeout: 8000 });
    await page.waitForSelector('[data-testid="approval-bell-badge"]', { timeout: 3000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT_DIR, '06-bedtime-approval-pause.png') });

    // Approve high-risk lock.lock
    await page.getByTestId('approve-lock-btn').click();
    await page.waitForSelector('[data-testid="bedtime-final-reply"]', { timeout: 4000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT_DIR, '07-bedtime-approved-complete.png') });

    // Also test Reset -> Deny flow quickly to verify both branches work cleanly
    await page.getByTestId('reset-bedtime-btn').click();
    await page.getByTestId('run-bedtime-btn').click();
    await page.waitForSelector('[data-testid="deny-lock-btn"]', { timeout: 8000 });
    await page.getByTestId('deny-lock-btn').click();
    await page.waitForSelector('[data-testid="bedtime-final-reply"]', { timeout: 4000 });
    const deniedText = await page.getByTestId('bedtime-final-reply').textContent();
    if (!deniedText || !deniedText.includes('403 approval_rejected')) {
      throw new Error('Expected denial reply to mention 403 approval_rejected');
    }

    // 5. Test Sub-Agent Network & Conflict Arbitration Simulator
    await scrollToStart(page, '#agents');
    await page.waitForTimeout(600);
    await page.getByTestId('agent-tab-away-check').click();
    await page.getByTestId('arb-policy_cap').click();
    await page.waitForTimeout(450);
    await page.screenshot({ path: join(OUT_DIR, '08-subagents-arbitration.png') });

    // 6. Test Authentic Product Workbench (Real Screenshots + Light/Dark + 6 Tabs)
    await scrollToStart(page, '#product');
    await page.waitForTimeout(500);
    const imgLoaded = await page.evaluate(() => {
      const img = document.querySelector('.cz-real-screenshot');
      return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 400;
    });
    if (!imgLoaded) {
      throw new Error('Product screenshot failed to load natural dimensions');
    }
    await page.screenshot({ path: join(OUT_DIR, '09-product-workbench-dark.png') });

    await page.getByTestId('ui-theme-light').click();
    await page.getByTestId('product-tab-devices').click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(OUT_DIR, '10-product-devices-light.png') });

    // 7. Test Bilingual Switch (EN) & Deploy Quickstart Section
    await page.getByTestId('toggle-lang-btn').click();
    await scrollToStart(page, '#deploy');
    await page.waitForTimeout(450);
    await page.screenshot({ path: join(OUT_DIR, '11-deploy-english.png') });

    await desktopCtx.close();

    // =========================================================================
    // 2. MOBILE RESPONSIVE AUDIT (390 x 844 — iPhone 14/15 Pro Viewport)
    // =========================================================================
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1.5,
      isMobile: true,
      hasTouch: true,
    });
    const mPage = await mobileCtx.newPage();
    mPage.on('pageerror', (err) => errors.push(`mobile pageerror: ${err.message}`));
    mPage.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(`mobile console.error: ${msg.text()}`);
      }
    });

    await mPage.goto(BASE_URL, { waitUntil: 'networkidle' });
    await mPage.waitForSelector('[data-testid="residence-stage"][data-model-loaded="true"]', {
      timeout: 10000,
    });
    await mPage.waitForTimeout(600);

    const mobileOverflow = await mPage.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    if (mobileOverflow) {
      const dims = await mPage.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      throw new Error(`Mobile horizontal overflow detected: ${JSON.stringify(dims)}`);
    }

    await mPage.screenshot({ path: join(OUT_DIR, '12-mobile-hero.png') });
    await scrollToStart(mPage, '#bedtime');
    await mPage.waitForTimeout(450);
    await mPage.screenshot({ path: join(OUT_DIR, '13-mobile-bedtime.png') });

    await mobileCtx.close();

    if (errors.length > 0) {
      throw new Error(`Browser verification encountered errors:\n${errors.join('\n')}`);
    }

    process.stdout.write(
      `[verify] ALL CHECKS PASSED! initialLoad=${loadMs}ms, measuredFps=${fps}, screenshots=${OUT_DIR}\n`,
    );
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}

runVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
