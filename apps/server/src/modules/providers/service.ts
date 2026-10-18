import type {
  CustomModel,
  ModelDefaults,
  ModelInfo,
  Provider,
  ProviderApi,
  ThinkingLevel,
} from '@cangze/contracts';
import {
  createProvider,
  getSupportedThinkingLevels,
  type Api,
  type AuthContext,
  type Credential,
  type CredentialInfo,
  type CredentialStore,
  type Model,
  type MutableModels,
} from '@earendil-works/pi-ai';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import { builtinModels, getBuiltinProviders } from '@earendil-works/pi-ai/providers/all';
import type { Logger } from 'pino';
import { z } from 'zod';
import { AppError, badRequest, conflict, notFound } from '../../core/errors.ts';
import { newId } from '../../core/ids.ts';
import { json, type Db } from '../../db/index.ts';
import type { SecretsService } from '../secrets/service.ts';
import type { SettingsService } from '../settings/service.ts';

interface Row {
  id: string;
  kind: 'builtin' | 'custom';
  builtin_id: string | null;
  name: string;
  base_url: string | null;
  secret_id: string | null;
  config: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

interface CustomConfig {
  api: ProviderApi;
  models: CustomModel[];
}

const API_IMPL: Record<ProviderApi, () => ReturnType<typeof openAICompletionsApi>> = {
  'openai-completions': openAICompletionsApi,
  'openai-responses': openAIResponsesApi,
  'anthropic-messages': anthropicMessagesApi,
};

/** Auth resolution never reads process environment: credentials come only from the UI. */
const NO_ENV: AuthContext = {
  env: async () => undefined,
  fileExists: async () => false,
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'custom';

function supportedLevels(m: Model<Api>): ThinkingLevel[] {
  if (!m.reasoning) return ['off'];
  try {
    return ['off', ...getSupportedThinkingLevels(m)] as ThinkingLevel[];
  } catch {
    return ['off', 'low', 'medium', 'high'];
  }
}

export const DEFAULT_MODELS: ModelDefaults = { chat: null, utility: null, thinkingLevel: 'medium' };

/**
 * LLM providers on top of pi-ai. Built-in providers come from pi's catalog; custom ones are
 * OpenAI- or Anthropic-compatible endpoints (Ollama, vLLM, LM Studio, gateways). API keys live
 * in the secrets store and reach pi through a CredentialStore keyed by provider id.
 */
export class ProvidersService {
  readonly models: MutableModels;
  readonly defaults;
  private readonly credentialStore: CredentialStore;

  constructor(
    private readonly db: Db,
    private readonly secrets: SecretsService,
    settings: SettingsService,
    private readonly logger: Logger,
  ) {
    this.defaults = settings.define(
      'models.defaults',
      z
        .object({
          chat: z.string().nullable(),
          utility: z.string().nullable(),
          thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']),
        })
        .default(DEFAULT_MODELS),
    );
    this.credentialStore = {
      read: async (providerId) => this.credentialFor(providerId),
      list: async () =>
        this.rows()
          .filter((r) => r.secret_id)
          .map((r): CredentialInfo => ({ providerId: r.id, type: 'api_key' })),
      modify: async (providerId, fn) => fn(this.credentialFor(providerId)),
      delete: async () => undefined,
    };
    this.models = builtinModels({ credentials: this.credentialStore, authContext: NO_ENV });
    // Only configured providers are exposed; built-ins stay registered so ids resolve.
    for (const row of this.rows()) if (row.kind === 'custom') this.registerCustom(row);
  }

  private credentialFor(providerId: string): Credential | undefined {
    const row = this.rows().find((r) => r.id === providerId);
    if (!row || !row.enabled) return undefined;
    const key = this.secrets.reveal(row.secret_id);
    return key ? { type: 'api_key', key } : undefined;
  }

  private rows(): Row[] {
    return this.db.prepare('SELECT * FROM providers ORDER BY created_at').all() as Row[];
  }

  private row(id: string): Row {
    const r = this.db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw notFound('Provider');
    return r;
  }

  private registerCustom(row: Row): void {
    const cfg = json.parse<CustomConfig>(row.config, { api: 'openai-completions', models: [] });
    const secrets = this.secrets;
    const provider = createProvider({
      id: row.id,
      name: row.name,
      baseUrl: row.base_url ?? undefined,
      auth: {
        apiKey: {
          name: `${row.name} API key`,
          // Keyless local servers (Ollama, LM Studio) still count as configured.
          resolve: async () => ({ auth: { apiKey: secrets.reveal(row.secret_id) ?? 'none' } }),
        },
      },
      models: cfg.models.map((m): Model<Api> => ({
        id: m.id,
        name: m.name ?? m.id,
        api: cfg.api,
        provider: row.id,
        baseUrl: row.base_url ?? '',
        reasoning: m.reasoning,
        input: m.vision ? ['text', 'image'] : ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
      })),
      api: API_IMPL[cfg.api](),
    });
    this.models.setProvider(provider);
  }

  private toProvider(r: Row): Provider {
    const cfg = json.parse<Partial<CustomConfig>>(r.config, {});
    return {
      id: r.id,
      kind: r.kind,
      builtinId: r.builtin_id,
      name: r.name,
      api: r.kind === 'custom' ? (cfg.api ?? 'openai-completions') : null,
      baseUrl: r.base_url,
      hasKey: this.secrets.has(r.secret_id),
      keyHint: this.secrets.hint(r.secret_id),
      enabled: r.enabled === 1,
      models: r.kind === 'custom' ? (cfg.models ?? []) : [],
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  list(): Provider[] {
    return this.rows().map((r) => this.toProvider(r));
  }

  get(id: string): Provider {
    return this.toProvider(this.row(id));
  }

  builtinCatalog() {
    const configured = new Set(
      this.rows()
        .map((r) => r.builtin_id)
        .filter(Boolean),
    );
    return getBuiltinProviders()
      .map((id) => {
        const p = this.models.getProvider(id);
        return {
          id,
          name: p?.name ?? id,
          modelCount: this.models.getModels(id).length,
          configured: configured.has(id),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  create(
    input:
      | { kind: 'builtin'; builtinId: string; apiKey?: string }
      | {
          kind: 'custom';
          name: string;
          api: ProviderApi;
          baseUrl: string;
          apiKey?: string;
          models: CustomModel[];
        },
  ): Provider {
    const now = Date.now();
    if (input.kind === 'builtin') {
      if (!getBuiltinProviders().includes(input.builtinId as never))
        throw badRequest('Unknown built-in provider');
      if (this.rows().some((r) => r.builtin_id === input.builtinId))
        throw conflict('This provider is already configured');
      const secretId = input.apiKey ? this.secrets.put('llm_api_key', input.apiKey) : null;
      const name = this.models.getProvider(input.builtinId)?.name ?? input.builtinId;
      this.db
        .prepare(
          'INSERT INTO providers (id, kind, builtin_id, name, base_url, secret_id, config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, 1, ?, ?)',
        )
        .run(input.builtinId, 'builtin', input.builtinId, name, secretId, '{}', now, now);
      return this.get(input.builtinId);
    }
    let id = `custom-${slug(input.name)}`;
    while (this.rows().some((r) => r.id === id)) id = `${id}-${newId('x').slice(-4)}`;
    const secretId = input.apiKey ? this.secrets.put('llm_api_key', input.apiKey) : null;
    this.db
      .prepare(
        'INSERT INTO providers (id, kind, builtin_id, name, base_url, secret_id, config, enabled, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, 1, ?, ?)',
      )
      .run(
        id,
        'custom',
        input.name,
        input.baseUrl.replace(/\/+$/, ''),
        secretId,
        json.stringify({ api: input.api, models: input.models }),
        now,
        now,
      );
    this.registerCustom(this.row(id));
    return this.get(id);
  }

  update(
    id: string,
    patch: { name?: string; baseUrl?: string; apiKey?: string; enabled?: boolean; models?: CustomModel[] },
  ): Provider {
    const r = this.row(id);
    let secretId = r.secret_id;
    if (patch.apiKey !== undefined) {
      if (patch.apiKey === '') {
        this.secrets.delete(secretId);
        secretId = null;
      } else {
        secretId = this.secrets.put('llm_api_key', patch.apiKey, secretId ?? undefined);
      }
    }
    const cfg = json.parse<Partial<CustomConfig>>(r.config, {});
    if (patch.models && r.kind === 'custom') cfg.models = patch.models;
    this.db
      .prepare(
        'UPDATE providers SET name = ?, base_url = ?, secret_id = ?, enabled = ?, config = ?, updated_at = ? WHERE id = ?',
      )
      .run(
        r.kind === 'custom' ? (patch.name ?? r.name) : r.name,
        r.kind === 'custom' ? (patch.baseUrl?.replace(/\/+$/, '') ?? r.base_url) : r.base_url,
        secretId,
        patch.enabled === undefined ? r.enabled : patch.enabled ? 1 : 0,
        json.stringify(cfg),
        Date.now(),
        id,
      );
    if (r.kind === 'custom') this.registerCustom(this.row(id));
    return this.get(id);
  }

  remove(id: string): void {
    const r = this.row(id);
    this.secrets.delete(r.secret_id);
    this.db.prepare('DELETE FROM providers WHERE id = ?').run(id);
    if (r.kind === 'custom') this.models.deleteProvider(id);
    const d = this.defaults.get();
    const stale = (ref: string | null) => (ref && ref.startsWith(`${id}/`) ? null : ref);
    this.defaults.set({ ...d, chat: stale(d.chat), utility: stale(d.utility) });
  }

  /** Models of every enabled, configured provider. */
  listModels(): ModelInfo[] {
    const out: ModelInfo[] = [];
    for (const r of this.rows()) {
      if (!r.enabled) continue;
      if (r.kind === 'builtin' && !r.secret_id) continue;
      for (const m of this.models.getModels(r.id)) out.push(this.info(m, r.name));
    }
    return out;
  }

  private info(m: Model<Api>, providerName: string): ModelInfo {
    const levels = supportedLevels(m);
    return {
      ref: `${m.provider}/${m.id}`,
      providerId: m.provider,
      providerName,
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
      vision: m.input.includes('image'),
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      thinkingLevels: [...new Set(levels)],
      cost: { input: m.cost.input, output: m.cost.output },
    };
  }

  /** Resolve a model reference (or the default) to a usable pi model. */
  resolve(ref: string | null | undefined, purpose: 'chat' | 'utility' = 'chat'): Model<Api> {
    const d = this.defaults.get();
    const effective = ref ?? (purpose === 'utility' ? (d.utility ?? d.chat) : d.chat);
    if (!effective)
      throw new AppError(409, 'no_model', 'No model is configured. Add a model provider in Settings.');
    const slash = effective.indexOf('/');
    const providerId = effective.slice(0, slash);
    const modelId = effective.slice(slash + 1);
    const row = this.rows().find((r) => r.id === providerId);
    if (!row || !row.enabled)
      throw new AppError(409, 'model_unavailable', `Provider ${providerId} is not configured`);
    const model = this.models.getModel(providerId, modelId);
    if (!model) throw new AppError(409, 'model_unavailable', `Model ${effective} does not exist`);
    return model;
  }

  modelInfo(ref: string): ModelInfo | null {
    try {
      const m = this.resolve(ref);
      return this.info(m, this.row(m.provider).name);
    } catch {
      return null;
    }
  }

  /** Small completion to check credentials and connectivity. */
  async test(id: string, modelId?: string) {
    const r = this.row(id);
    const model = modelId ? this.models.getModel(id, modelId) : this.models.getModels(id)[0];
    if (!model)
      return {
        ok: false,
        error: 'No model available for this provider',
        model: null,
        latencyMs: null,
        reply: null,
      };
    const started = Date.now();
    try {
      const msg = await this.models.completeSimple(
        model,
        {
          systemPrompt: 'Reply with the single word: pong',
          messages: [{ role: 'user', content: 'ping', timestamp: Date.now() }],
        },
        { maxTokens: 16, signal: AbortSignal.timeout(30_000) },
      );
      if (msg.stopReason === 'error' || msg.stopReason === 'aborted') {
        return {
          ok: false,
          error: msg.errorMessage ?? 'Request failed',
          model: model.id,
          latencyMs: Date.now() - started,
          reply: null,
        };
      }
      const reply = msg.content
        .filter((c) => c.type === 'text')
        .map((c) => (c as { text: string }).text)
        .join('')
        .slice(0, 200);
      this.logger.info({ module: 'providers', provider: r.id }, 'provider test succeeded');
      return { ok: true, error: null, model: model.id, latencyMs: Date.now() - started, reply };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        model: model.id,
        latencyMs: null,
        reply: null,
      };
    }
  }

  /**
   * Load the API implementations of configured providers in the background so the first chat
   * after a start does not pay for loading the provider SDK.
   */
  warmUp(): void {
    const apis = new Set<string>();
    for (const r of this.rows()) {
      if (!r.enabled) continue;
      for (const m of this.models.getModels(r.id)) apis.add(m.api);
    }
    const modules: Record<string, () => Promise<unknown>> = {
      'openai-completions': () => import('@earendil-works/pi-ai/api/openai-completions'),
      'openai-responses': () => import('@earendil-works/pi-ai/api/openai-responses'),
      'anthropic-messages': () => import('@earendil-works/pi-ai/api/anthropic-messages'),
      'google-generative-ai': () => import('@earendil-works/pi-ai/api/google-generative-ai'),
    };
    for (const api of apis) void modules[api]?.().catch(() => undefined);
  }

  /** List model ids from an OpenAI-compatible `/models` endpoint. */
  async discover(baseUrl: string, apiKey?: string): Promise<string[]> {
    const url = `${baseUrl.replace(/\/+$/, '')}/models`;
    const res = await fetch(url, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(15_000),
    }).catch((err: unknown) => {
      throw new AppError(
        502,
        'discover_failed',
        `Cannot reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    if (!res.ok) throw new AppError(502, 'discover_failed', `${url} returned HTTP ${res.status}`);
    const body = (await res.json()) as {
      data?: Array<{ id?: string }>;
      models?: Array<{ name?: string; model?: string }>;
    };
    const ids = [
      ...(body.data ?? []).map((m) => m.id),
      ...(body.models ?? []).map((m) => m.model ?? m.name),
    ].filter((x): x is string => typeof x === 'string');
    return [...new Set(ids)].sort();
  }
}
