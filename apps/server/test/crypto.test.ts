import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  loadMasterKey,
  openWithPassphrase,
  SecretBox,
  sealWithPassphrase,
  verifyPassword,
} from '../src/core/crypto.ts';

describe('crypto', () => {
  it('hashes and verifies passwords', async () => {
    const h = await hashPassword('hunter2 hunter2');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('hunter2 hunter2', h)).toBe(true);
    expect(await verifyPassword('hunter3 hunter3', h)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });

  it('binds secret ciphertext to its record id', () => {
    const box = new SecretBox(Buffer.alloc(32, 1));
    const sealed = box.seal('sk-secret', 'secret:a');
    expect(box.open(sealed, 'secret:a')).toBe('sk-secret');
    expect(() => box.open(sealed, 'secret:b')).toThrow();
    expect(sealed.toString('utf8')).not.toContain('sk-secret');
  });

  it('creates a private master key file once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cz-key-'));
    const file = join(dir, 'master.key');
    const a = loadMasterKey(file);
    const b = loadMasterKey(file);
    expect(a.source).toBe('created');
    expect(b.source).toBe('file');
    expect(a.key.equals(b.key)).toBe(true);
    expect(statSync(file).mode & 0o077).toBe(0);
    expect(readFileSync(file, 'utf8').trim()).toHaveLength(44);
  });

  it('rejects malformed env master keys', () => {
    expect(() => loadMasterKey('/nonexistent', 'dG9vIHNob3J0')).toThrow(/32 bytes/);
  });

  it('round-trips passphrase encryption', async () => {
    const sealed = await sealWithPassphrase(Buffer.from('backup'), 'pass phrase');
    expect((await openWithPassphrase(sealed, 'pass phrase')).toString()).toBe('backup');
    await expect(openWithPassphrase(sealed, 'wrong')).rejects.toThrow();
  });
});
