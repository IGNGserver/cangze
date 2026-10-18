import { AppError } from '../../core/errors.ts';
import type { HaGateway } from '../ha/gateway.ts';
import type { AgentWriteEvaluator, PolicyEngine } from '../policy/engine.ts';
import { assertWrite } from './permissions.ts';
import type { AgentsService } from './service.ts';

/**
 * Write guard for subagents: rules of the revision the run started with must allow the call,
 * high-risk calls follow the agent's `highRisk` policy, and per-rule rate limits are counted.
 */
export function createAgentEvaluator(
  agents: AgentsService,
  policy: PolicyEngine,
  ha: HaGateway,
): AgentWriteEvaluator {
  const calls = new Map<string, number[]>();
  const recent = (k: string) => {
    const now = Date.now();
    const list = (calls.get(k) ?? []).filter((t) => now - t < 3_600_000);
    calls.set(k, list);
    return list;
  };
  return async (req) => {
    const p = req.principal;
    const def = agents.definition(p.agentId, p.revision);
    const ruleIds = assertWrite(def.permissions, req, ha.registry, {
      timeZone: ha.getStatus().timeZone,
      callsInLastHour: (ruleId) => recent(`${p.agentId}:${ruleId}`).length,
    });
    const risk = policy.classify(req);
    if (risk.level === 'high') {
      if (def.highRisk === 'deny') {
        throw new AppError(
          403,
          'policy_denied',
          `High-risk actions are not allowed for this agent (${risk.reason ?? req.summary})`,
        );
      }
      if (def.highRisk === 'approve')
        await policy.requireApproval(req, risk.reason, policy.riskPolicy.get().approvalTimeoutSeconds);
    }
    const now = Date.now();
    for (const id of ruleIds) recent(`${p.agentId}:${id}`).push(now);
  };
}
