import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createApp } from './app.ts';
import { loadConfig } from './core/config.ts';
import { createLogger, LogRing } from './core/logger.ts';
import { VERSION } from './core/version.ts';
import { systemRoutes } from './modules/system/routes.ts';

function defaultWebDir(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, '../public'), join(here, '../../web/dist')]) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  return undefined;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const ring = new LogRing();
  const logger = createLogger(config.logLevel, ring);
  const startedAt = new Date();

  const app = await createApp({
    logger,
    webDir: config.webDir ?? defaultWebDir(),
    routes: systemRoutes({ startedAt, readiness: {}, setupRequired: () => true }),
  });

  await app.listen({ host: config.host, port: config.port });
  logger.info({ version: VERSION, port: config.port }, 'cangze started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('fatal:', err);
  process.exit(1);
});
