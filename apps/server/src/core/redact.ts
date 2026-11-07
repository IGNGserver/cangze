const REDACTED = '[redacted]';
const SENSITIVE_KEY =
  /^(?:.*_)?(?:api_key|access_token|refresh_token|token|password|passphrase|secret|secrets|authorization|credential|credentials|private_key|master_key)(?:_.*)?$/i;

function normalizedKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]/g, '_')
    .toLowerCase();
}

/** Redact credentials without discarding the non-sensitive action details shown for approval. */
export function redactSensitive(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const visit = (input: unknown, depth: number): unknown => {
    if (typeof input === 'string') {
      return input
        .replace(/(https?:\/\/)[^/@\s]+@/gi, `$1${REDACTED}@`)
        .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
        .replace(
          /(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passphrase|secret|authorization|private[_-]?key|master[_-]?key)\b\s*["']?\s*[:=]\s*)([^,\r\n}\]]+)/gi,
          `$1${REDACTED}`,
        );
    }
    if (!input || typeof input !== 'object' || depth > 20) return input;
    if (seen.has(input)) return '[circular]';
    seen.add(input);
    if (Array.isArray(input)) return input.map((item) => visit(item, depth + 1));
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(input)) {
      output[key] = SENSITIVE_KEY.test(normalizedKey(key)) ? REDACTED : visit(item, depth + 1);
    }
    return output;
  };
  return visit(value, 0);
}
