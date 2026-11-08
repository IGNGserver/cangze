/** Thin fetch wrapper for `/api/v1`. Errors surface as ApiError with the server's stable code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const s = params.toString();
  return s ? `${path}?${s}` : path;
}

let onUnauthorized: (() => void) | null = null;
let onReachable: (() => void) | null = null;
export function setReachableHandler(fn: () => void): void {
  onReachable = fn;
}
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

export async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const res = await fetch(withQuery(`/api/v1${path}`, query), {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // The API answered, so the hub is reachable: reconnect the live stream if it is waiting to retry.
  onReachable?.();
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      if (res.ok) {
        throw new ApiError(res.status, 'invalid_response', 'The hub returned an invalid response');
      }
      // Proxies and load balancers sometimes replace API errors with HTML. Keep the
      // stable HTTP error instead of leaking a JSON.parse SyntaxError to the UI.
      data = undefined;
    }
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | undefined)
      ?.error;
    if (res.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/setup')) onUnauthorized?.();
    throw new ApiError(
      res.status,
      err?.code ?? 'http_' + res.status,
      err?.message ?? res.statusText,
      err?.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
