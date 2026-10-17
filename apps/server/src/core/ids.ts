import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

function base32(bytes: Buffer): string {
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 31];
  return out;
}

/**
 * Time-sortable identifier: `<prefix>_<10 chars time><12 chars random>`.
 * Lexicographic order follows creation time within the same prefix.
 */
export function newId(prefix: string): string {
  const time = Date.now().toString(32).padStart(10, '0');
  return `${prefix}_${time}${base32(randomBytes(12))}`;
}
