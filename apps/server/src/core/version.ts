import { readFileSync } from 'node:fs';

declare const __CANGZE_VERSION__: string | undefined;

function devVersion(): string {
  try {
    return readFileSync(new URL('../../../../VERSION', import.meta.url), 'utf8').trim() + '-dev';
  } catch {
    return '0.0.0-dev';
  }
}

export const VERSION: string = typeof __CANGZE_VERSION__ === 'string' ? __CANGZE_VERSION__ : devVersion();
