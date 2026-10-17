import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './core/config.ts';
import { VERSION } from './core/version.ts';
import { buildServer, createServices, startServices, stopServices } from './context.ts';

function defaultWebDir(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, '../public'), join(here, '../../web/dist')]) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  return undefined;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const services = createServices(config);
  const app = await buildServer(services, config.webDir ?? defaultWebDir());
  startServices(services);

  await app.listen({ host: config.host, port: config.port });
  services.logger.info({ version: VERSION, port: config.port, dataDir: config.dataDir }, 'cangze started');

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    services.logger.info({ signal }, 'shutting down');
    try {
      await app.close();
    } finally {
      await stopServices(services);
      process.exit(0);
    }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('fatal:', err);
  process.exit(1);
});
