/* global document, HTMLElement */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEBSITE_ROOT = join(SCRIPT_DIR, '..');
const PORT = 4291;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT_FILE = join(WEBSITE_ROOT, 'public', 'og', 'og.png');

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

  const server = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
    { cwd: WEBSITE_ROOT, stdio: 'pipe' },
  );

  let browser;
  try {
    await waitForServer(BASE_URL);
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
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="residence-stage"][data-model-loaded="true"]', {
      timeout: 15000,
    });
    await page.waitForTimeout(700);

    // Inject clean 1200x630 OpenGraph composition overlay over the live 3D twilight residence canvas
    await page.evaluate((logoData) => {
      for (const el of document.querySelectorAll('header, main, footer, .cz-pin-layer, .cz-stage-hud')) {
        if (el instanceof HTMLElement) {
          el.style.display = 'none';
        }
      }
      const overlay = document.createElement('div');
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:9999',
        'display:flex',
        'flex-direction:column',
        'justify-content:space-between',
        'padding:54px 64px',
        'background:linear-gradient(95deg, rgba(7,10,16,0.84) 0%, rgba(9,13,20,0.56) 46%, rgba(9,13,20,0.06) 100%)',
        'color:#f4efe6',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
      ].join(';');

      overlay.innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;">
          <img src="data:image/png;base64,${logoData}" width="52" height="52" style="border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,0.45);" />
          <div>
            <div style="font-size:22px;font-weight:700;letter-spacing:0.04em;">藏泽 CANGZE</div>
            <div style="font-size:13px;color:#f5a962;letter-spacing:0.14em;margin-top:2px;">藏山于泽 · SANCTUARY INTELLIGENCE</div>
          </div>
        </div>
        <div style="max-width:650px;">
          <div style="font-size:48px;font-weight:750;line-height:1.18;letter-spacing:-0.01em;margin-bottom:18px;">
            面向 Home Assistant 的<br/>开源私有 AI 智能家居中枢
          </div>
          <div style="font-size:20px;line-height:1.55;color:#c9d2e3;">
            零 HA 插件侵入 · 平等主会话 · 全局子代理 · 默认拒绝权限与门锁审批闭环
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;gap:10px;">
            <span style="padding:7px 14px;border-radius:999px;background:rgba(245,169,98,0.16);border:1px solid rgba(245,169,98,0.4);color:#f7bc81;font-size:14px;font-weight:600;">Docker Compose 单容器</span>
            <span style="padding:7px 14px;border-radius:999px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.16);color:#dfe6f2;font-size:14px;">HaGateway + PolicyEngine</span>
            <span style="padding:7px 14px;border-radius:999px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.16);color:#dfe6f2;font-size:14px;">Apache-2.0 · v0.4.2</span>
          </div>
          <div style="font-size:16px;font-weight:600;color:#f5a962;letter-spacing:0.03em;">cangze.igng.net</div>
        </div>
      `;
      document.body.appendChild(overlay);
    }, logoB64);

    await page.waitForTimeout(200);
    await page.screenshot({ path: OUT_FILE, type: 'png' });
    await ctx.close();
    process.stdout.write(`[generate-og] Wrote 1200x630 OpenGraph image to ${OUT_FILE}\n`);
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}

generateOgImage().catch((err) => {
  console.error(err);
  process.exit(1);
});
