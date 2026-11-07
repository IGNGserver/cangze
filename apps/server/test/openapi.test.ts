import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildOpenApi } from '../src/http/openapi.ts';
import type { RouteSpec } from '../src/http/route.ts';

describe('OpenAPI raw responses', () => {
  it('declares binary content for a typed raw response', () => {
    const spec = {
      method: 'GET',
      url: '/api/v1/ha/entities/:entityId/camera.jpg',
      summary: 'Camera snapshot',
      tags: ['ha'],
      response: z.unknown(),
      raw: true,
      contentType: 'image/jpeg',
      handler: () => undefined,
    } as RouteSpec;
    const doc = buildOpenApi([spec], 'test') as {
      paths: Record<
        string,
        { get: { responses: Record<string, { content: Record<string, { schema: unknown }> }> } }
      >;
    };
    expect(
      doc.paths['/api/v1/ha/entities/{entityId}/camera.jpg']!.get.responses['200']!.content['image/jpeg']!
        .schema,
    ).toEqual({ type: 'string', format: 'binary' });
  });
});
