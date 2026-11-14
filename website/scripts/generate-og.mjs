/* global document, HTMLElement */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEBSITE_ROOT = join(SCRIPT_DIR, '..');
const OUT_FILE = join(WEBSITE_ROOT, 'public', 'og', 'og.png');

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

async function generateOgImage() {
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const logoB64 = readFileSync(join(WEBSITE_ROOT, 'public', 'brand', 'logo.png')).toString('base64');
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const viteBin = join(WEBSITE_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(
    process.execPath,
    [viteBin, 'preview', '--port', String(port), '--host', '127.0.0.1', '--strictPort'],
    { cwd: WEBSITE_ROOT, stdio: 'ignore', detached: process.platform !== 'win32' },
  );

  let browser;
  try {
    await waitForServer(baseUrl);
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

    const ctx = await browser.newContext({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="residence-stage"][data-model-loaded="true"]', {
      timeout: 15000,
    });
    await page.getByTestId('tod-dusk').click();
    await page.waitForTimeout(450);

    // Position the 3D villa clearly on the right 72% and let ResizeObserver settle before overlay
    await page.evaluate(() => {
      for (const el of document.querySelectorAll(
        'header, .cz-narrative-flow, .cz-editorial-lower, .cz-stage-caption, .cz-pin-layer, .cz-stage-hud, .cz-roam-hint',
      )) {
        if (el instanceof HTMLElement) {
          el.style.display = 'none';
        }
      }

      const stageCol = document.querySelector('.cz-stage-column');
      if (stageCol instanceof HTMLElement) {
        stageCol.style.cssText =
          'position:fixed;top:0;right:0;bottom:0;left:28%;width:72%;height:100vh;z-index:1;padding:0;margin:0;';
      }
      const stageFrame = document.querySelector('.cz-stage-frame');
      if (stageFrame instanceof HTMLElement) {
        stageFrame.style.cssText =
          'padding:0;border:0;border-radius:0;height:100vh;max-height:none;min-height:0;background:transparent;box-shadow:none;';
      }
      const stage = document.querySelector('.cz-stage');
      if (stage instanceof HTMLElement) {
        stage.style.borderRadius = '0';
      }
    });

    await page.waitForTimeout(650);

    await page.evaluate((logoData) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:9999',
        'display:flex',
        'flex-direction:column',
        'justify-content:space-between',
        'padding:52px 62px',
        'background:linear-gradient(92deg, #faf6f0 0%, #faf6f0 35%, rgba(250,246,240,0.92) 45%, rgba(250,246,240,0.18) 58%, rgba(250,246,240,0) 70%)',
        'color:#2b231d',
        'font-family:"PingFang SC","Microsoft YaHei",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      ].join(';');

      overlay.innerHTML = `
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="data:image/png;base64,${logoData}" width="50" height="50" style="border-radius:12px;box-shadow:0 8px 20px rgba(43,35,29,0.16);" />
          <div>
            <div style="font-size:22px;font-weight:700;letter-spacing:0.04em;color:#2b231d;">藏泽 CANGZE</div>
            <div style="font-size:13px;color:#c86d2d;letter-spacing:0.08em;font-weight:600;margin-top:2px;">藏繁琐于山泽 · 留温暖在屋檐</div>
          </div>
        </div>
        <div style="max-width:490px;">
          <div style="font-size:44px;font-weight:750;line-height:1.22;margin-bottom:18px;color:#2b231d;font-family:'Songti SC','STSong',Georgia,serif;">
            听得懂家常话的<br/><span style="color:#c86d2d;">家庭智能管家</span>
          </div>
          <div style="font-size:19px;line-height:1.6;color:#5e5247;">
            连上你家已有的 Home Assistant<br/>门锁操作先问你 · 生活隐私不离开家门
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;gap:10px;">
            <span style="padding:7px 15px;border-radius:999px;background:#c86d2d;color:#ffffff;font-size:14px;font-weight:600;">开源家用 · 免费部署</span>
            <span style="padding:7px 15px;border-radius:999px;background:rgba(255,255,255,0.88);border:1px solid rgba(92,68,46,0.16);color:#2b231d;font-size:14px;">不用折腾原有设备</span>
            <span style="padding:7px 15px;border-radius:999px;background:rgba(255,255,255,0.88);border:1px solid rgba(92,68,46,0.16);color:#3f7659;font-size:14px;font-weight:600;">隐私留在家里</span>
          </div>
          <div style="font-size:16px;font-weight:700;color:#2b231d;background:rgba(250,246,240,0.86);padding:6px 14px;border-radius:999px;">cangze.igng.net</div>
        </div>
      `;
      document.body.appendChild(overlay);
    }, logoB64);

    await page.waitForTimeout(350);
    await page.screenshot({ path: OUT_FILE, type: 'png' });
    await ctx.close();
    process.stdout.write(`[generate-og] Wrote 1200x630 OpenGraph image to ${OUT_FILE}\n`);
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

generateOgImage()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
