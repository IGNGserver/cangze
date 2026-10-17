import { RiskPolicy } from '@cangze/contracts';
import { defineRoute, type RouteSpec } from '../../http/route.ts';
import type { PolicyEngine } from './engine.ts';

export function policyRoutes(policy: PolicyEngine): RouteSpec[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/api/v1/settings/risk',
      summary: 'Risk policy for actions taken by sessions',
      tags: ['settings'],
      response: RiskPolicy,
      handler: () => policy.riskPolicy.get(),
    }),
    defineRoute({
      method: 'PUT',
      url: '/api/v1/settings/risk',
      summary: 'Update the risk policy',
      tags: ['settings'],
      body: RiskPolicy,
      response: RiskPolicy,
      handler: ({ body }) => {
        policy.riskPolicy.set(body);
        return body;
      },
    }),
  ];
}
