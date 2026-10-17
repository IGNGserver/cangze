import { VERSION } from './core/version.ts';

const [command] = process.argv.slice(2);

switch (command) {
  case 'version':
  case undefined:
    process.stdout.write(`cangze ${VERSION}\n`);
    break;
  default:
    console.error(`unknown command: ${command}`);
    process.exit(2);
}
