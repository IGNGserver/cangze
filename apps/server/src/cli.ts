import { readFileSync } from 'node:fs';
import { loadConfig } from './core/config.ts';
import { createLogger, LogRing } from './core/logger.ts';
import { VERSION } from './core/version.ts';
import { createServices, stopServices } from './context.ts';

const [command, ...args] = process.argv.slice(2);

const usage = `cangze ${VERSION}

Usage: node dist/cli.js <command>

  version                 print the version
  reset-admin             forget the admin key; the next start prints a bootstrap code (data is kept)
  backup                  create a backup in /data/backups
                          (encrypted when CANGZE_BACKUP_PASSPHRASE is set; add --credentials to include the master key)
  restore <file>          stage a backup for restore; it is applied on the next start
                          (passphrase from CANGZE_BACKUP_PASSPHRASE)
`;

const open = () => createServices(loadConfig(), { logger: createLogger('warn', new LogRing()) });

switch (command) {
  case 'version':
    process.stdout.write(`cangze ${VERSION}\n`);
    break;
  case 'reset-admin': {
    const services = open();
    services.auth.resetAdmin();
    await stopServices(services);
    process.stdout.write(
      'Admin key cleared. Restart the container and use the new bootstrap code from the log.\n',
    );
    break;
  }
  case 'backup': {
    const services = open();
    const passphrase = process.env.CANGZE_BACKUP_PASSPHRASE || undefined;
    const info = await services.backup.create({
      kind: 'manual',
      passphrase,
      includeCredentials: args.includes('--credentials'),
    });
    await stopServices(services);
    process.stdout.write(
      `Backup written to ${services.backup.dir}/${info.file} (${info.size} bytes${info.encrypted ? ', encrypted' : ''}).\n`,
    );
    break;
  }
  case 'restore': {
    const file = args[0];
    if (!file) {
      console.error('restore needs a file');
      process.exit(2);
    }
    const services = open();
    const result = await services.backup.stageRestore(
      readFileSync(file),
      process.env.CANGZE_BACKUP_PASSPHRASE || undefined,
    );
    await stopServices(services);
    process.stdout.write(`Backup from ${result.manifest.createdAt} staged. Restart Cangze to apply it.\n`);
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
