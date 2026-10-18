// zh-CN 与 en 的界面文案键必须完全一致，且值不得为空。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../apps/web/src/i18n/locales/', import.meta.url));
const locales = ['zh-CN', 'en'];

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const maps = {};
for (const l of locales) {
  const p = join(dir, `${l}.json`);
  if (!existsSync(p)) {
    console.error(`missing locale file ${p}`);
    process.exit(1);
  }
  maps[l] = flatten(JSON.parse(readFileSync(p, 'utf8')));
}

const problems = [];
const [base, ...rest] = locales;
for (const l of rest) {
  for (const k of Object.keys(maps[base])) if (!(k in maps[l])) problems.push(`${l} missing ${k}`);
  for (const k of Object.keys(maps[l])) if (!(k in maps[base])) problems.push(`${base} missing ${k}`);
}
for (const l of locales) {
  for (const [k, v] of Object.entries(maps[l]))
    if (typeof v !== 'string' || !v.trim()) problems.push(`${l} empty ${k}`);
}

if (problems.length) {
  console.error(
    'i18n problems:\n' +
      problems
        .slice(0, 50)
        .map((p) => '  - ' + p)
        .join('\n'),
  );
  process.exit(1);
}
console.log(`i18n ok (${Object.keys(maps[base]).length} keys)`);
