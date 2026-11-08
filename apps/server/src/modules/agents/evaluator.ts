import type { Db } from '../../db/index.ts';
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
  db: Db,
): AgentWriteEvaluator {
  const recent = (agentId: string, revision: number, ruleId: string) => {
    const cutoff = Date.now() - 3_600_000;
    return (
      db
        .prepare(
          'SELECT COUNT(*) AS n FROM agent_rule_calls WHERE agent_id = ? AND revision = ? AND rule_id = ? AND called_at >= ?',
        )
        .get(agentId, revision, ruleId, cutoff) as { n: number }
    ).n;
  };
  return async (req) => {
    const p = req.principal;
    const validate = () => {
      if (agents.row(p.agentId).halted)
        throw new AppError(403, 'policy_denied', 'Agent is emergency stopped');
      const def = agents.definition(p.agentId, p.revision);
      const indirect =
        ['script', 'scene', 'automation'].includes(req.domain) ||
        req.entityIds.some((id) => /^(script|scene|automation)\./.test(id));
      if (indirect && !def.allowIndirectActions)
        throw new AppError(403, 'policy_denied', 'Indirect actions require explicit permission');
      const ruleIds = assertWrite(def.permissions, req, ha.registry, {
        timeZone: ha.getStatus().timeZone,
        callsInLastHour: (ruleId) => recent(p.agentId, p.revision, ruleId),
      });
      return { def, ruleIds };
    };

    const { def } = validate();
    const risk = policy.classify(req);
    const highRisk = agents.highRiskFor(p.agentId, p.revision, def.highRisk);
    if (risk.level === 'high') {
      if (highRisk === 'deny') {
        throw new AppError(
          403,
          'policy_denied',
          `High-risk actions are not allowed for this agent (${risk.reason ?? req.summary})`,
        );
      }
      if (highRisk === 'approve')
        await policy.requireApproval(req, risk.reason, policy.riskPolicy.get().approvalTimeoutSeconds);
    }

    // Approval is a snapshot in time. Revalidate every dynamic rule and reserve all rule quotas
    // synchronously, so another approved call cannot consume the same final slot between check and write.
    const { ruleIds } = validate();
    const now = Date.now();
    for (const id of ruleIds)
      db.prepare(
        'INSERT INTO agent_rule_calls (agent_id, revision, rule_id, called_at) VALUES (?, ?, ?, ?)',
      ).run(p.agentId, p.revision, id, now);
  };
}
