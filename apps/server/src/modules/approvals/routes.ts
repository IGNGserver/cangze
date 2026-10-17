import { Approval, ApprovalStatus, DecideApproval, IdParams } from '@cangze/contracts';
import { z } from 'zod';
import { defineRoute, type RouteSpec } from '../../http/route.ts';
import type { ApprovalsService } from './service.ts';

export function approvalRoutes(approvals: ApprovalsService): RouteSpec[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/api/v1/approvals',
      summary: 'List approvals',
      tags: ['approvals'],
      query: z.object({
        status: ApprovalStatus.optional(),
        sessionId: z.string().max(64).optional(),
        agentId: z.string().max(64).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      }),
      response: z.array(Approval),
      handler: ({ query }) => approvals.list(query),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/approvals/:id/decide',
      summary: 'Approve or deny a pending action',
      tags: ['approvals'],
      params: IdParams,
      body: DecideApproval,
      response: Approval,
      handler: ({ params, body }) => approvals.decide(params.id, body.approve, body.note),
    }),
  ];
}
