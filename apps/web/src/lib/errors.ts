import type { TFunction } from 'i18next';
import { ApiError } from '../api/client.ts';

/** User-facing text for an API error, translated when the code is known. */
export function errorText(t: TFunction, err: unknown): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    const translated = t(key);
    if (translated !== key) return translated;
    if (err.code === 'rate_limited') return t('errors.rate_limited');
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
