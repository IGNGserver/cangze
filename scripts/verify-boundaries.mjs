// 架构边界守卫（AGENTS.md「不可破坏的架构不变量」）：
// 1. 只有 apps/server/src/modules/ha/ 可以直接引用 home-assistant-js-websocket 或发起 HA 原始调用；
// 2. apps/web 不得引用 apps/server；server 不得引用 apps/web；
// 3. 任何模块不得在 ha 模块之外拼接 HA 的 call_service 消息。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

const violations = [];
const check = (file, re, why) => {
  const src = readFileSync(file, 'utf8');
  if (re.test(src)) violations.push(`${relative(root, file)}: ${why}`);
};

for (const file of walk(join(root, 'apps/server/src'))) {
  const rel = relative(root, file);
  const inHa = rel.startsWith('apps/server/src/modules/ha/');
  if (!inHa) {
    check(
      file,
      /from ['"]home-assistant-js-websocket['"]/,
      'imports the HA socket library outside modules/ha',
    );
    check(file, /type:\s*['"]call_service['"]/, 'builds a raw HA call_service message outside modules/ha');
  }
  check(file, /from ['"][./]*\/?apps\/web|@cangze\/web/, 'server imports the web app');
}
for (const file of walk(join(root, 'apps/web/src'))) {
  check(file, /@cangze\/server|apps\/server/, 'web imports the server');
}

if (violations.length) {
  console.error('Boundary violations:\n' + violations.map((v) => '  - ' + v).join('\n'));
  process.exit(1);
}
console.log('boundaries ok');
