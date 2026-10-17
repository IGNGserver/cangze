import { loadConfig } from './core/config.ts';
import { createLogger, LogRing } from './core/logger.ts';
import { VERSION } from './core/version.ts';
import { createServices, stopServices } from './context.ts';

const [command] = process.argv.slice(2);

const usage = `cangze ${VERSION}

Usage: node dist/cli.js <command>

  version            print the version
  reset-admin        forget the admin key; the next start prints a bootstrap code (data is kept)
`;

switch (command) {
  case 'version':
    process.stdout.write(`cangze ${VERSION}\n`);
    break;
  case 'reset-admin': {
    const services = createServices(loadConfig(), { logger: createLogger('warn', new LogRing()) });
    services.auth.resetAdmin();
    stopServices(services);
    process.stdout.write(
      'Admin key cleared. Restart the container and use the new bootstrap code from the log.\n',
    );
    break;
  }
  case undefined:
  case 'help':
    process.stdout.write(usage);
    break;
  default:
    console.error(`unknown command: ${command}\n\n${usage}`);
    process.exit(2);
}
