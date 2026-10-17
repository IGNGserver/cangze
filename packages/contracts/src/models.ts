import { z } from 'zod';

export const ProviderApi = z.enum(['openai-completions', 'openai-responses', 'anthropic-messages']);
export type ProviderApi = z.infer<typeof ProviderApi>;

export const ThinkingLevel = z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
export type ThinkingLevel = z.infer<typeof ThinkingLevel>;

/** `<providerId>/<modelId>`; model ids may contain slashes, the provider id never does. */
export const ModelRef = z
  .string()
  .min(3)
  .max(300)
  .regex(/^[a-z0-9][a-z0-9_-]*\/.+$/);

export const CustomModel = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(200).optional(),
  contextWindow: z.number().int().min(1024).max(10_000_000).default(128_000),
  maxTokens: z.number().int().min(256).max(1_000_000).default(8192),
  reasoning: z.boolean().default(false),
  vision: z.boolean().default(false),
});
export type CustomModel = z.infer<typeof CustomModel>;

export const Provider = z.object({
  id: z.string(),
  kind: z.enum(['builtin', 'custom']),
  builtinId: z.string().nullable(),
  name: z.string(),
  api: ProviderApi.nullable(),
  baseUrl: z.string().nullable(),
  hasKey: z.boolean(),
  keyHint: z.string().nullable(),
  enabled: z.boolean(),
  models: z.array(CustomModel),
  createdAt: z.string(),
});
export type Provider = z.infer<typeof Provider>;

export const CreateProvider = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('builtin'),
    builtinId: z.string().min(1).max(64),
    apiKey: z.string().min(1).max(4096).optional(),
  }),
  z.object({
    kind: z.literal('custom'),
    name: z.string().min(1).max(80),
    api: ProviderApi,
    baseUrl: z.string().url(),
    apiKey: z.string().max(4096).optional(),
    models: z.array(CustomModel).min(1).max(200),
  }),
]);

export const UpdateProvider = z.object({
  name: z.string().min(1).max(80).optional(),
  baseUrl: z.string().url().optional(),
  /** Empty string clears the stored key. */
  apiKey: z.string().max(4096).optional(),
  enabled: z.boolean().optional(),
  models: z.array(CustomModel).max(200).optional(),
});

export const BuiltinProvider = z.object({
  id: z.string(),
  name: z.string(),
  modelCount: z.number(),
  configured: z.boolean(),
});

export const ModelInfo = z.object({
  ref: z.string(),
  providerId: z.string(),
  providerName: z.string(),
  id: z.string(),
  name: z.string(),
  reasoning: z.boolean(),
  vision: z.boolean(),
  contextWindow: z.number(),
  maxTokens: z.number(),
  thinkingLevels: z.array(ThinkingLevel),
  cost: z.object({ input: z.number(), output: z.number() }),
});
export type ModelInfo = z.infer<typeof ModelInfo>;

export const ModelDefaults = z.object({
  chat: ModelRef.nullable(),
  /** Used for titles, compaction and summaries; falls back to `chat`. */
  utility: ModelRef.nullable(),
  thinkingLevel: ThinkingLevel,
});
export type ModelDefaults = z.infer<typeof ModelDefaults>;

export const ProviderTestResult = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  model: z.string().nullable(),
  latencyMs: z.number().nullable(),
  reply: z.string().nullable(),
});

export const DiscoveredModels = z.object({ models: z.array(z.string()) });
