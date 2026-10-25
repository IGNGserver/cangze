import {
  CreateSession,
  CreateSessionResult,
  EditMessage,
  EntryRef,
  IdParams,
  Ok,
  QueryBool,
  RunAccepted,
  SendMessage,
  SessionDetail,
  SessionSummary,
  UpdateSession,
} from '@cangze/contracts';
import { z } from 'zod';
import { defineRoute, type RouteSpec } from '../../http/route.ts';
import type { ToolRegistry } from '../tools/registry.ts';
import type { SessionsService } from './service.ts';

const ToolInfo = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string(),
  risk: z.enum(['read', 'control', 'configure', 'system']),
  group: z.string(),
});

export function sessionRoutes(sessions: SessionsService, tools: ToolRegistry): RouteSpec[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/api/v1/sessions',
      summary: 'List sessions',
      tags: ['sessions'],
      query: z.object({ archived: QueryBool.default(false) }),
      response: z.array(SessionSummary),
      handler: ({ query }) => sessions.list(query.archived),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/sessions',
      summary: 'Create a session, optionally with its first message',
      tags: ['sessions'],
      body: CreateSession,
      response: CreateSessionResult,
      status: 201,
      handler: ({ body }) => {
        const { message, ...rest } = body;
        return message ? sessions.start({ ...rest, message }) : sessions.create(rest);
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/sessions/:id',
      summary: 'Session with the active branch, live run and pending approvals',
      tags: ['sessions'],
      params: IdParams,
      response: SessionDetail,
      handler: ({ params }) => sessions.get(params.id),
    }),
    defineRoute({
      method: 'PATCH',
      url: '/api/v1/sessions/:id',
      summary: 'Update title, model, instructions, pin or archive state',
      tags: ['sessions'],
      params: IdParams,
      body: UpdateSession,
      response: SessionSummary,
      handler: ({ params, body }) => sessions.update(params.id, body),
    }),
    defineRoute({
      method: 'DELETE',
      url: '/api/v1/sessions/:id',
      summary: 'Delete a session and its conversation',
      tags: ['sessions'],
      params: IdParams,
      response: Ok,
      handler: ({ params }) => {
        sessions.delete(params.id);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/sessions/:id/messages',
      summary: 'Send a message (steers or queues when a reply is running)',
      tags: ['sessions'],
      params: IdParams,
      body: SendMessage,
      response: RunAccepted,
      bodyLimit: 32 * 1024 * 1024,
      handler: ({ params, body }) => sessions.send(params.id, body),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/sessions/:id/edit',
      summary: 'Edit a user message into a new branch and answer it',
      tags: ['sessions'],
      params: IdParams,
      body: EditMessage,
      response: RunAccepted,
      handler: ({ params, body }) => sessions.edit(params.id, body.entryId, body.text),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/sessions/:id/regenerate',
      summary: 'Answer a message again as a new branch',
      tags: ['sessions'],
      params: IdParams,
      body: EntryRef,
      response: RunAccepted,
      handler: ({ params, body }) => sessions.regenerate(params.id, body.entryId),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/sessions/:id/branch',
      summary: 'Switch the active branch to the one containing an entry',
      tags: ['sessions'],
      params: IdParams,
      body: EntryRef,
      response: SessionDetail,
      handler: ({ params, body }) => sessions.switchBranch(params.id, body.entryId),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/sessions/:id/abort',
      summary: 'Stop the running reply',
      tags: ['sessions'],
      params: IdParams,
      response: Ok,
      handler: ({ params }) => {
        sessions.abort(params.id);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/sessions/:id/compact',
      summary: 'Summarize older messages to free context',
      tags: ['sessions'],
      params: IdParams,
      response: z.object({ compacted: z.boolean() }),
      handler: async ({ params }) => ({ compacted: await sessions.compact(params.id) }),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/sessions/:id/export',
      summary: 'Download the active branch as Markdown or JSONL',
      tags: ['sessions'],
      params: IdParams,
      query: z.object({ format: z.enum(['markdown', 'jsonl']).default('markdown') }),
      response: z.unknown(),
      raw: true,
      handler: async ({ params, query, reply }) => {
        const body = sessions.export(params.id, query.format);
        const ext = query.format === 'jsonl' ? 'jsonl' : 'md';
        await reply
          .header(
            'content-type',
            query.format === 'jsonl' ? 'application/x-ndjson; charset=utf-8' : 'text/markdown; charset=utf-8',
          )
          .header('content-disposition', `attachment; filename="cangze-${params.id}.${ext}"`)
          .send(body);
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/tools',
      summary: 'Tools available to sessions and subagents',
      tags: ['sessions'],
      response: z.array(ToolInfo),
      handler: () => tools.catalog(),
    }),
  ];
}
