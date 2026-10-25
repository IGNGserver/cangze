import {
  Draft,
  DraftImageParams,
  DraftScopeParams,
  DraftSnapshot,
  PutDraft,
  UploadDraftImage,
} from '@cangze/contracts';
import { z } from 'zod';
import { defineRoute, type RouteSpec } from '../../http/route.ts';
import type { DraftsService } from './service.ts';

const DraftResult = z.object({ draft: Draft.nullable() });

export function draftRoutes(drafts: DraftsService): RouteSpec[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/api/v1/drafts',
      summary: 'List unsent composer drafts and the stream sequence for incremental updates',
      tags: ['drafts'],
      response: DraftSnapshot,
      handler: () => drafts.snapshot(),
    }),
    defineRoute({
      method: 'PUT',
      url: '/api/v1/drafts/:scope',
      summary: 'Save draft text (scope is "new" or a session id)',
      tags: ['drafts'],
      params: DraftScopeParams,
      body: PutDraft,
      response: DraftResult,
      handler: ({ params, body }) => ({
        draft: drafts.put(params.scope, body.text, body.baseRevision),
      }),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/drafts/:scope/images',
      summary: 'Attach an image to a draft',
      tags: ['drafts'],
      params: DraftScopeParams,
      body: UploadDraftImage,
      response: z.object({ draft: Draft }),
      status: 201,
      bodyLimit: 12 * 1024 * 1024,
      handler: ({ params, body }) => ({ draft: drafts.addImage(params.scope, body) }),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/drafts/:scope/images/:imageId',
      summary: 'Download a draft image',
      tags: ['drafts'],
      params: DraftImageParams,
      response: z.unknown(),
      raw: true,
      contentType: 'application/octet-stream',
      handler: async ({ params, reply }) => {
        const image = drafts.image(params.scope, params.imageId);
        await reply
          .header('content-type', image.mimeType)
          .header('cache-control', 'private, max-age=3600')
          .send(image.bytes);
      },
    }),
    defineRoute({
      method: 'DELETE',
      url: '/api/v1/drafts/:scope/images/:imageId',
      summary: 'Remove an image from a draft',
      tags: ['drafts'],
      params: DraftImageParams,
      response: DraftResult,
      handler: ({ params }) => ({ draft: drafts.deleteImage(params.scope, params.imageId) }),
    }),
  ];
}
