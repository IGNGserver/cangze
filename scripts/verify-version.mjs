// VERSION 是唯一版本源：根与各 workspace 的 package.json、compose.yaml 与 .env.example 的默认镜像版本必须与之一致。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
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
// 部署文件的默认镜像版本：发布前不存在 latest，必须指向本版本
/** @type {Array<[string, RegExp]>} */
const pins = [
  ['compose.yaml', /\$\{CANGZE_VERSION:-([^}]+)\}/],
  ['.env.example', /^CANGZE_VERSION=(.*)$/m],
];
for (const [file, re] of pins) {
  const pinned = re.exec(readFileSync(join(root, file), 'utf8'))?.[1];
  if (pinned !== version) {
    console.error(`${file}: default image version ${pinned} != VERSION ${version}`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log(
  `version ${version} consistent across ${manifests.length} manifests and ${pins.length} deployment files`,
);
