/* global document, requestAnimationFrame, HTMLImageElement */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

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
 * Automated End-to-End Static Hosting, SEO, Visual, Interactive, Mobile & Copy Verification
 * for the Cangze Official Website (website/).
 */

const DIST_DIR = join(process.cwd(), 'dist');
const IS_CI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const OUT_DIR = process.env.WEBSITE_SCREENSHOT_DIR || join(process.cwd(), 'test-results', 'visual-audit');

const FORBIDDEN_TECHNICAL_TERMS = [
  'beforeToolCall',
  'HaGateway',
  'HaRegistry',
  'PolicyEngine',
  'CoordinationService',
  'SQLite WAL',
  'AES-256-GCM',
  'baseRevision',
  'agent_revisions',
  'agent_memory',
  '409 conflict_manual',
  '403 policy_denied',
  '403 approval_rejected',
  'waiting_approval',
  'maxChainDepth',
  'cap_drop',
  'INV-01',
  'placement="room"',
  '127.0.0.1:38417',
];

mkdirSync(OUT_DIR, { recursive: true });

async function snap(targetPage, filename) {
  if (IS_CI && process.env.FORCE_SCREENSHOTS !== 'true') {
    return;
  }
  await targetPage.screenshot({
    path: join(OUT_DIR, filename),
    animations: 'disabled',
    timeout: 45000,
  });
}

function verifyStaticBundle() {
  const requiredFiles = [
    'index.html',
    '404.html',
    '_headers',
    'robots.txt',
    'sitemap.xml',
    'og/og.png',
    'models/cangze-residence.glb',
    'brand/favicon.png',
    'brand/logo.png',
  ];

  for (const rel of requiredFiles) {
    const full = join(DIST_DIR, rel);
    if (!existsSync(full)) {
      throw new Error(`Missing required static bundle artifact: dist/${rel}`);
    }
    if (statSync(full).size === 0) {
      throw new Error(`Empty static bundle artifact: dist/${rel}`);
    }
  }

  const headersText = readFileSync(join(DIST_DIR, '_headers'), 'utf8');
  if (!headersText.includes('immutable') || !headersText.includes('X-Content-Type-Options: nosniff')) {
    throw new Error('dist/_headers is missing immutable caching or security headers');
  }

  const robotsText = readFileSync(join(DIST_DIR, 'robots.txt'), 'utf8');
  if (!robotsText.includes('https://cangze.igng.net/sitemap.xml')) {
    throw new Error('dist/robots.txt does not reference https://cangze.igng.net/sitemap.xml');
  }

  const sitemapText = readFileSync(join(DIST_DIR, 'sitemap.xml'), 'utf8');
  if (!sitemapText.includes('<loc>https://cangze.igng.net/</loc>')) {
    throw new Error('dist/sitemap.xml does not contain canonical https://cangze.igng.net/ entry');
  }

  process.stdout.write(
    '[verify] Static bundle, _headers, 404.html, robots.txt, sitemap.xml, and OG card verified.\n',
  );
}

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
  verifyStaticBundle();

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(
    process.execPath,
    [viteBin, 'preview', '--port', String(port), '--host', '127.0.0.1', '--strictPort'],
    {
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    },
  );

  const errors = [];
  let browser;

  try {
    await waitForServer(baseUrl);
    process.stdout.write(`[verify] Preview server ready at ${baseUrl}\n`);

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
    // 1. DESKTOP FULL VISUAL, SEO, COPY & INTERACTIVE AUDIT (1440 x 900)
    // =========================================================================
    const desktopCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: IS_CI ? 1 : 1.5,
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
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    const loadMs = Date.now() - t0;

    // Verify SEO, OpenGraph, Bing verification & JSON-LD metadata in DOM
    const seoMeta = await page.evaluate(() => ({
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content'),
      ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
      bing: document.querySelector('meta[name="msvalidate.01"]')?.getAttribute('content'),
      hasJsonLd: Boolean(document.querySelector('script[type="application/ld+json"]')?.textContent),
    }));
    if (
      seoMeta.canonical !== 'https://cangze.igng.net/' ||
      seoMeta.ogUrl !== 'https://cangze.igng.net/' ||
      seoMeta.ogImage !== 'https://cangze.igng.net/og/og.png' ||
      !seoMeta.bing ||
      !seoMeta.hasJsonLd
    ) {
      throw new Error(`Invalid SEO/OpenGraph metadata: ${JSON.stringify(seoMeta)}`);
    }

    // Verify rendered copy avoids backend jargon (excluding the copyable Docker Compose command block)
    const visibleCopyText = await page.evaluate(() => {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('[data-testid="deploy-code-block"]').forEach((n) => n.remove());
      return clone.textContent || '';
    });
    for (const term of FORBIDDEN_TECHNICAL_TERMS) {
      if (visibleCopyText.includes(term)) {
        throw new Error(`Found forbidden technical jargon in visible page copy: ${term}`);
      }
    }

    // Wait for cangze-residence.glb to finish loading into Three.js
    await page.waitForSelector('[data-testid="residence-stage"][data-model-loaded="true"]', {
      timeout: 15000,
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

    await snap(page, '01-hero-daylight.png');

    // 2. Test 3D Roam Mode & Time-of-Day Lighting Presets
    await page.getByTestId('toggle-roam-btn').click();
    await page.waitForTimeout(650);
    await snap(page, '02-roam-3d-daylight.png');

    await page.getByTestId('tod-dusk').click();
    await page.waitForTimeout(450);
    await snap(page, '03-roam-3d-dusk.png');

    await page.getByTestId('tod-day').click();
    await page.getByTestId('toggle-roam-btn').click();
    await page.waitForTimeout(400);

    // 3. Test Spatial Room Explorer & Real-Time Device Controls
    await scrollToStart(page, '#explore');
    await page.waitForTimeout(550);
    await page.getByTestId('explore-room-living_room').click();
    await page.waitForTimeout(650);
    await page.getByTestId('toggle-light.living_lamp').click();
    await page.waitForTimeout(350);
    await snap(page, '04-explore-living-room.png');

    await page.getByTestId('explore-room-bedroom').click();
    await page.waitForTimeout(700);
    await page.getByTestId('climate-dec-climate.bedroom_ac').click();
    await snap(page, '05-explore-master-suite.png');

    // 4. Test AI Bedtime Routine ("帮我准备睡觉") -> Pause at Lock Confirmation -> Approve!
    await scrollToStart(page, '#bedtime');
    await page.waitForTimeout(400);
    await page.getByTestId('run-bedtime-btn').click();

    await page.waitForSelector('[data-testid="approval-card"]', { timeout: 8000 });
    await page.waitForSelector('[data-testid="approval-bell-badge"]', { timeout: 3000 });
    await page.waitForTimeout(500);
    await snap(page, '06-bedtime-approval-pause.png');

    await page.getByTestId('approve-lock-btn').click();
    await page.waitForSelector('[data-testid="bedtime-final-reply"]', { timeout: 4000 });
    await page.waitForTimeout(500);
    await snap(page, '07-bedtime-approved-complete.png');

    // Test Reset -> Deny flow cleanly
    await page.getByTestId('reset-bedtime-btn').click();
    await page.getByTestId('run-bedtime-btn').click();
    await page.waitForSelector('[data-testid="deny-lock-btn"]', { timeout: 8000 });
    await page.getByTestId('deny-lock-btn').click();
    await page.waitForSelector('[data-testid="bedtime-final-reply"]', { timeout: 4000 });
    const deniedText = await page.getByTestId('bedtime-final-reply').textContent();
    if (!deniedText || (!deniedText.includes('未上锁') && !deniedText.toLowerCase().includes('unlocked'))) {
      throw new Error('Expected denial reply to clearly indicate the door remained unlocked');
    }

    // 5. Test Home Helpers & House Rules Showcase
    await scrollToStart(page, '#agents');
    await page.waitForTimeout(500);
    await page.getByTestId('agent-tab-away-check').click();
    await page.getByTestId('arb-policy_cap').click();
    await page.waitForTimeout(350);
    await snap(page, '08-helpers-house-rules.png');

    // 6. Test Product Showcase (Default Light Mode + Dark Mode Switch)
    await scrollToStart(page, '#product');
    await page.waitForTimeout(500);
    const imgLoaded = await page.evaluate(() => {
      const img = document.querySelector('.cz-real-screenshot');
      return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 400;
    });
    if (!imgLoaded) {
      throw new Error('Product screenshot failed to load natural dimensions');
    }
    await snap(page, '09-product-workbench-light.png');

    await page.getByTestId('ui-theme-dark').click();
    await page.getByTestId('product-tab-devices').click();
    await page.waitForTimeout(350);
    await snap(page, '10-product-devices-dark.png');

    // 7. Test Bilingual Switch (EN) & Deploy Quickstart Section
    await page.getByTestId('toggle-lang-btn').click();
    await scrollToStart(page, '#deploy');
    await page.waitForTimeout(450);
    const englishCopyText = await page.evaluate(() => {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('[data-testid="deploy-code-block"]').forEach((n) => n.remove());
      return clone.textContent || '';
    });
    for (const term of FORBIDDEN_TECHNICAL_TERMS) {
      if (englishCopyText.includes(term)) {
        throw new Error(`Found forbidden technical jargon in English copy: ${term}`);
      }
    }
    await snap(page, '11-deploy-english.png');

    await desktopCtx.close();

    // =========================================================================
    // 2. MOBILE RESPONSIVE AUDIT (390 x 844 — iPhone 14/15 Pro Viewport)
    // =========================================================================
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: IS_CI ? 1 : 1.5,
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

    await mPage.goto(baseUrl, { waitUntil: 'networkidle' });
    await mPage.waitForSelector('[data-testid="residence-stage"][data-model-loaded="true"]', {
      timeout: 15000,
    });
    await page_waitForMobileReady(mPage);

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

    await snap(mPage, '12-mobile-hero.png');
    await scrollToStart(mPage, '#bedtime');
    await mPage.waitForTimeout(450);
    await snap(mPage, '13-mobile-bedtime.png');

    await mobileCtx.close();

    if (errors.length > 0) {
      throw new Error(`Browser verification encountered errors:\n${errors.join('\n')}`);
    }

    process.stdout.write(
      `[verify] ALL CHECKS PASSED! initialLoad=${loadMs}ms, measuredFps=${fps}, screenshots=${OUT_DIR}\n`,
    );
  } finally {
    if (browser) await browser.close();
    try {
      if (server.pid && process.platform !== 'win32') {
        process.kill(-server.pid, 'SIGTERM');
      } else {
        server.kill('SIGTERM');
      }
    } catch {
      // server already exited
    }
  }
}

async function page_waitForMobileReady(mPage) {
  await mPage.waitForTimeout(600);
}

runVerification()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
