import type { SecretBox } from '../../core/crypto.ts';
import { newId } from '../../core/ids.ts';
import type { Db } from '../../db/index.ts';

/**
 * Encrypted credential storage. Plaintext never leaves this service except through `reveal`,
 * which callers use only to talk to the credential's own service (LLM provider, HA).
 */
export class SecretsService {
  constructor(
    private readonly db: Db,
    private readonly box: SecretBox,
  ) {}

  put(kind: string, plaintext: string, id = newId('sec')): string {
    const now = Date.now();
    const sealed = this.box.seal(plaintext, `secret:${id}`);
    this.db
      .prepare(
        `INSERT INTO secrets (id, kind, ciphertext, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET ciphertext = excluded.ciphertext, kind = excluded.kind, updated_at = excluded.updated_at`,
      )
      .run(id, kind, sealed, now, now);
    return id;
  }

  reveal(id: string | null | undefined): string | null {
    if (!id) return null;
    const row = this.db.prepare('SELECT ciphertext FROM secrets WHERE id = ?').get(id) as
      { ciphertext: Buffer } | undefined;
    if (!row) return null;
    return this.box.open(row.ciphertext, `secret:${id}`);
  }

  has(id: string | null | undefined): boolean {
    if (!id) return false;
    return Boolean(this.db.prepare('SELECT 1 FROM secrets WHERE id = ?').get(id));
  }

  delete(id: string | null | undefined): void {
    if (id) this.db.prepare('DELETE FROM secrets WHERE id = ?').run(id);
  }

  /** Masked hint for UIs, e.g. `sk-…9f2c`. Never more than the last 4 characters. */
  hint(id: string | null | undefined): string | null {
    const v = this.reveal(id);
    if (!v) return null;
    if (v.length <= 8) return '••••';
    return `${v.slice(0, 3)}…${v.slice(-4)}`;
  }
}
