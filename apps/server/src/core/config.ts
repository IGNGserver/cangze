import { resolve } from 'node:path';
import { z } from 'zod';

const Env = z.object({
  CANGZE_DATA_DIR: z.string().default('./data'),
  CANGZE_HOST: z.string().default('0.0.0.0'),
  CANGZE_PORT: z.coerce.number().int().min(1).max(65535).default(38417),
  CANGZE_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Base64 encoded 32-byte key. When unset, a key file is created in the data directory. */
  CANGZE_MASTER_KEY: z.string().optional(),
  /** Comma separated CIDRs of reverse proxies whose X-Forwarded-* headers are trusted. */
  CANGZE_TRUSTED_PROXIES: z.string().default(''),
  /** Public origin users reach the hub at, e.g. https://home.example.com. Adds its host to the allowlist. */
  CANGZE_PUBLIC_ORIGIN: z.string().url().optional(),
  /** Extra comma separated host names accepted in the Host header. */
  CANGZE_ALLOWED_HOSTS: z.string().default(''),
  /** Directory with the built web UI. */
  CANGZE_WEB_DIR: z.string().optional(),
  NODE_ENV: z.string().default('production'),
});

export interface AppConfig {
  dataDir: string;
  host: string;
  port: number;
  logLevel: z.infer<typeof Env>['CANGZE_LOG_LEVEL'];
  masterKey?: string;
  trustedProxies: string[];
  publicOrigin?: string;
  allowedHosts: string[];
  webDir?: string;
  dev: boolean;
}

const list = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Compose passes unset variables as empty strings; treat them as unset.
  const e = Env.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  return {
    dataDir: resolve(e.CANGZE_DATA_DIR),
    host: e.CANGZE_HOST,
    port: e.CANGZE_PORT,
    logLevel: e.CANGZE_LOG_LEVEL,
    masterKey: e.CANGZE_MASTER_KEY,
    trustedProxies: list(e.CANGZE_TRUSTED_PROXIES),
    publicOrigin: e.CANGZE_PUBLIC_ORIGIN,
    allowedHosts: list(e.CANGZE_ALLOWED_HOSTS),
    webDir: e.CANGZE_WEB_DIR ? resolve(e.CANGZE_WEB_DIR) : undefined,
    dev: e.NODE_ENV === 'development',
  };
}
