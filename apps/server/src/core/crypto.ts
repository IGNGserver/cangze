import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const scrypt = (password: string | Buffer, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );

/** URL-safe random token with 256 bits of entropy. */
export function randomToken(prefix = ''): string {
  return prefix + randomBytes(32).toString('base64url');
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Hash a human-chosen secret (the admin key). Format: `scrypt$N$r$p$salt$hash`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, 32, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Loads the 32-byte master key from `CANGZE_MASTER_KEY` (base64) or `<dataDir>/master.key`,
 * creating the file with mode 0600 on first start.
 */
export function loadMasterKey(
  file: string,
  fromEnv?: string,
): { key: Buffer; source: 'env' | 'file' | 'created' } {
  if (fromEnv) {
    const key = Buffer.from(fromEnv, 'base64');
    if (key.length !== 32) throw new Error('CANGZE_MASTER_KEY must be base64 encoding of exactly 32 bytes');
    return { key, source: 'env' };
  }
  if (existsSync(file)) {
    const key = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
    if (key.length !== 32) throw new Error(`${file} does not contain a valid 32-byte key`);
    return { key, source: 'file' };
  }
  mkdirSync(dirname(file), { recursive: true });
  const key = randomBytes(32);
  writeFileSync(file, key.toString('base64') + '\n', { mode: 0o600, flag: 'wx' });
  try {
    chmodSync(file, 0o600);
  } catch {
    // best effort on filesystems without POSIX modes
  }
  return { key, source: 'created' };
}

const VERSION_BYTE = 1;

/** AES-256-GCM with additional authenticated data binding the ciphertext to its record. */
export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('SecretBox key must be 32 bytes');
  }

  seal(plaintext: string, aad: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION_BYTE]), iv, cipher.getAuthTag(), ct]);
  }

  open(sealed: Buffer, aad: string): string {
    if (sealed[0] !== VERSION_BYTE) throw new Error('Unsupported secret format');
    const iv = sealed.subarray(1, 13);
    const tag = sealed.subarray(13, 29);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(sealed.subarray(29)), decipher.final()]).toString('utf8');
  }
}

/** Passphrase based encryption for portable backups: scrypt-derived key + AES-256-GCM. */
export async function sealWithPassphrase(data: Buffer, passphrase: string): Promise<Buffer> {
  const salt = randomBytes(16);
  const key = await scrypt(passphrase.normalize('NFKC'), salt, 32, SCRYPT);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([Buffer.from('CZB1'), salt, iv, cipher.getAuthTag(), ct]);
}

export async function openWithPassphrase(sealed: Buffer, passphrase: string): Promise<Buffer> {
  if (sealed.subarray(0, 4).toString() !== 'CZB1') throw new Error('Not an encrypted Cangze backup');
  const salt = sealed.subarray(4, 20);
  const iv = sealed.subarray(20, 32);
  const tag = sealed.subarray(32, 48);
  const key = await scrypt(passphrase.normalize('NFKC'), salt, 32, SCRYPT);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(48)), decipher.final()]);
}

export function isPassphraseSealed(buf: Buffer): boolean {
  return buf.subarray(0, 4).toString() === 'CZB1';
}
