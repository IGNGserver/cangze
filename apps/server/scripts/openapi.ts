// 生成 / 校验 docs/openapi.json。路由在 buildRouteSpecs() 中集中声明，不需要启动服务。
import { readFileSync, writeFileSync } from 'node:fs';
import { buildOpenApi } from '../src/http/openapi.ts';
import { allRouteSpecs } from '../src/routes.ts';
import { VERSION } from '../src/core/version.ts';

const target = new URL('../../../docs/openapi.json', import.meta.url);
const doc = JSON.stringify(buildOpenApi(allRouteSpecs(), VERSION.replace(/-dev$/, '')), null, 2) + '\n';

if (process.argv.includes('--write')) {
  writeFileSync(target, doc);
  process.stdout.write('wrote docs/openapi.json\n');
} else {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // missing file
  }
  if (current !== doc) {
    console.error('docs/openapi.json is out of date. Run `pnpm openapi:write` and commit the result.');
    process.exit(1);
  }
  process.stdout.write('docs/openapi.json is up to date\n');
}
