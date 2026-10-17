// 生产构建：打包 src/main.ts；npm 依赖保持 external（由 `pnpm deploy --prod` 提供），
// workspace 包（@cangze/*，以 TS 源码发布）打进产物。
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const version = readFileSync(new URL('../../../VERSION', import.meta.url), 'utf8').trim();

const keepWorkspace = {
  name: 'externalize-npm',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith('@cangze/')) return undefined;
      return { path: args.path, external: true };
    });
  },
};

await build({
  entryPoints: ['src/main.ts', 'src/cli.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  plugins: [keepWorkspace],
  define: { __CANGZE_VERSION__: JSON.stringify(version) },
  logLevel: 'info',
});
