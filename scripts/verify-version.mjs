// VERSION 是唯一版本源：根与各 workspace 的 package.json 必须与之一致。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const version = readFileSync(join(root, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) {
  console.error(`VERSION is not SemVer: ${version}`);
  process.exit(1);
}

const manifests = ['package.json'];
for (const dir of ['apps', 'packages']) {
  for (const name of readdirSync(join(root, dir))) {
    const p = join(dir, name, 'package.json');
    if (existsSync(join(root, p))) manifests.push(p);
  }
}

let bad = 0;
for (const m of manifests) {
  const v = JSON.parse(readFileSync(join(root, m), 'utf8')).version;
  if (v !== version) {
    console.error(`${m}: version ${v} != VERSION ${version}`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log(`version ${version} consistent across ${manifests.length} manifests`);
