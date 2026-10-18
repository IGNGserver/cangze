import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { APIRequestContext } from '@playwright/test';

export interface E2eEnv {
  haUrl: string;
  haToken: string;
  llmUrl: string;
  bootstrapCode: string;
  starts: number;
}

const file = join(dirname(fileURLToPath(import.meta.url)), '../.e2e/env.json');

export function e2eEnv(): E2eEnv {
  return JSON.parse(readFileSync(file, 'utf8')) as E2eEnv;
}

export const ADMIN_KEY = 'e2e-admin-key-0123';

/** API calls with the browser's session cookie; state-changing requests need a same-origin Origin. */
export function api(request: APIRequestContext, baseURL: string) {
  const headers = { origin: baseURL };
  return {
    get: async <T>(url: string) => (await (await request.get(`/api/v1${url}`)).json()) as T,
    post: async <T>(url: string, data: unknown) => {
      const res = await request.post(`/api/v1${url}`, { data, headers });
      if (!res.ok()) throw new Error(`POST ${url}: ${res.status()} ${await res.text()}`);
      return (await res.json()) as T;
    },
    put: async <T>(url: string, data: unknown) => {
      const res = await request.put(`/api/v1${url}`, { data, headers });
      if (!res.ok()) throw new Error(`PUT ${url}: ${res.status()} ${await res.text()}`);
      return (await res.json()) as T;
    },
  };
}
