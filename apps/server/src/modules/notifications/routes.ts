import { Notification, Ok } from '@cangze/contracts';
import { QueryBool } from '@cangze/contracts';
import { z } from 'zod';
import { defineRoute, type RouteSpec } from '../../http/route.ts';
import type { NotificationsService } from './service.ts';

export function notificationRoutes(n: NotificationsService): RouteSpec[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/api/v1/notifications',
      summary: 'Notifications, newest first',
      tags: ['notifications'],
      query: z.object({
        unread: QueryBool.default(false),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
      response: z.object({ items: z.array(Notification), unread: z.number() }),
      handler: ({ query }) => ({
        items: n.list({ unreadOnly: query.unread, limit: query.limit }),
        unread: n.unreadCount(),
      }),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/notifications/read',
      summary: 'Mark notifications as read',
      tags: ['notifications'],
      body: z.object({ ids: z.union([z.array(z.string()).max(500), z.literal('all')]) }),
      response: Ok,
      handler: ({ body }) => {
        n.markRead(body.ids);
        return { ok: true as const };
      },
    }),
  ];
}
