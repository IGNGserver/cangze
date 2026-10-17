import {
  BuiltinProvider,
  CreateProvider,
  DiscoveredModels,
  IdParams,
  ModelDefaults,
  ModelInfo,
  Ok,
  Provider,
  ProviderTestResult,
  UpdateProvider,
} from '@cangze/contracts';
import { z } from 'zod';
import { defineRoute, type RouteSpec } from '../../http/route.ts';
import type { ProvidersService } from './service.ts';

export function providerRoutes(providers: ProvidersService): RouteSpec[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/api/v1/providers',
      summary: 'Configured model providers (keys are never returned)',
      tags: ['models'],
      response: z.array(Provider),
      handler: () => providers.list(),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/providers/catalog',
      summary: 'Built-in providers that can be configured',
      tags: ['models'],
      response: z.array(BuiltinProvider),
      handler: () => providers.builtinCatalog(),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/providers',
      summary: 'Add a provider',
      tags: ['models'],
      body: CreateProvider,
      response: Provider,
      status: 201,
      handler: ({ body }) => providers.create(body),
    }),
    defineRoute({
      method: 'PATCH',
      url: '/api/v1/providers/:id',
      summary: 'Update a provider',
      tags: ['models'],
      params: IdParams,
      body: UpdateProvider,
      response: Provider,
      handler: ({ params, body }) => providers.update(params.id, body),
    }),
    defineRoute({
      method: 'DELETE',
      url: '/api/v1/providers/:id',
      summary: 'Remove a provider and its key',
      tags: ['models'],
      params: IdParams,
      response: Ok,
      handler: ({ params }) => {
        providers.remove(params.id);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/providers/:id/test',
      summary: 'Send a tiny request to check the key and connectivity',
      tags: ['models'],
      params: IdParams,
      body: z.object({ modelId: z.string().optional() }),
      response: ProviderTestResult,
      handler: ({ params, body }) => providers.test(params.id, body.modelId),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/providers/discover',
      summary: 'List models of an OpenAI-compatible endpoint',
      tags: ['models'],
      body: z.object({ baseUrl: z.string().url(), apiKey: z.string().max(4096).optional() }),
      response: DiscoveredModels,
      handler: async ({ body }) => ({ models: await providers.discover(body.baseUrl, body.apiKey) }),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/models',
      summary: 'Models of all configured providers',
      tags: ['models'],
      response: z.array(ModelInfo),
      handler: () => providers.listModels(),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/models/defaults',
      summary: 'Default models',
      tags: ['models'],
      response: ModelDefaults,
      handler: () => providers.defaults.get() as z.infer<typeof ModelDefaults>,
    }),
    defineRoute({
      method: 'PUT',
      url: '/api/v1/models/defaults',
      summary: 'Set default models',
      tags: ['models'],
      body: ModelDefaults,
      response: ModelDefaults,
      handler: ({ body }) => {
        if (body.chat) providers.resolve(body.chat);
        if (body.utility) providers.resolve(body.utility);
        providers.defaults.set(body);
        return body;
      },
    }),
  ];
}
