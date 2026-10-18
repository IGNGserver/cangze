// End-to-end environment: an in-memory Home Assistant, a rule-based model API and the hub itself
// with a fresh data directory. The hub runs as a child process under a tiny supervisor that
// restarts it after a clean exit, like the compose restart policy does after a restore.
// Writes the bootstrap code and addresses to `.e2e/env.json` for the tests.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAKE_TOKEN, FakeHa } from '../server/test/fake-ha.ts';
import { FakeLlm } from '../server/test/fake-llm.ts';

export const E2E_PORT = Number(process.env.E2E_PORT ?? 18190);
const here = dirname(fileURLToPath(import.meta.url));
const stateDir = join(here, '.e2e');
const dataDir = join(stateDir, 'data');
const serverDir = join(here, '../server');

rmSync(stateDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const ha = await new FakeHa().start(E2E_PORT + 1);
const llm = await new FakeLlm().start(E2E_PORT + 2);
const env = { haUrl: ha.url, haToken: FAKE_TOKEN, llmUrl: llm.url, bootstrapCode: '', starts: 0 };
const save = () => writeFileSync(join(stateDir, 'env.json'), JSON.stringify(env, null, 2));

let child: ChildProcess | null = null;
let stopping = false;

function startHub() {
  env.starts++;
  child = spawn(join(serverDir, 'node_modules/.bin/tsx'), ['src/main.ts'], {
    cwd: serverDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      CANGZE_HOST: '127.0.0.1',
      CANGZE_PORT: String(E2E_PORT),
      CANGZE_DATA_DIR: dataDir,
      CANGZE_LOG_LEVEL: 'info',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  child.stdout!.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    process.stdout.write(text);
    const code = /bootstrap code:\s+([A-Z0-9]{4}(?:-[A-Z0-9]{4})+)/.exec(text)?.[1];
    if (code) {
      env.bootstrapCode = code;
      save();
    }
  });
  child.on('exit', (code) => {
    child = null;
    if (stopping) return;
    if (code === 0) setTimeout(startHub, 200);
    else process.exit(code ?? 1);
  });
  save();
}

async function shutdown() {
  stopping = true;
  child?.kill('SIGTERM');
  await Promise.all([ha.stop(), llm.stop()]).catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

startHub();
