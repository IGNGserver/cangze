import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './core/config.ts';
import { createLogger, LogRing } from './core/logger.ts';
import { VERSION } from './core/version.ts';
import { buildServer, createServices, startServices, stopServices } from './context.ts';
import { applyPendingRestore } from './modules/backup/service.ts';

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
  // A restore staged before the last shutdown is applied before anything opens the database.
  const restored = await applyPendingRestore(config.dataDir, logger);
  const services = createServices(config, {
    logger,
    ring,
    onRestartRequested: () => process.kill(process.pid, 'SIGTERM'),
  });
  if (restored) {
    if (restored.wipeSecrets) {
      services.db.prepare('DELETE FROM secrets').run();
      services.settings.invalidate();
    }
    services.notifications.create({
      kind: 'restored',
      severity: restored.wipeSecrets ? 'warning' : 'success',
      title: 'Restored from backup',
      body: restored.wipeSecrets
        ? `Data from ${restored.restoredFrom} was restored. The backup did not contain this installation's credentials: enter the Home Assistant token and model API keys again.`
        : `Data from ${restored.restoredFrom} was restored.`,
    });
  }
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
