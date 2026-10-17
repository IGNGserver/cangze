import { AppError } from '../../core/errors.ts';
import type { Principal } from '../../core/principal.ts';
import { currentToolCall } from '../../core/tool-context.ts';
import type { ApprovalsService } from '../approvals/service.ts';
import type { HaGateway, WriteRequest } from '../ha/gateway.ts';
import type { SettingsService } from '../settings/service.ts';
import { classifyWrite, RiskPolicySetting } from './risk.ts';

/** Evaluates subagent permission rules; installed by the agents module (M4). */
export type AgentWriteEvaluator = (
  req: WriteRequest & { principal: Extract<Principal, { kind: 'agent' }> },
) => Promise<void>;

/**
 * Write guard for the HA gateway. Admin actions pass; main sessions are trusted but risky actions
 * wait for a human approval; subagent writes are delegated to the agent rule evaluator, which
 * denies by default.
 */
export class PolicyEngine {
  readonly riskPolicy;
  private agentEvaluator: AgentWriteEvaluator | null = null;

  constructor(
    settings: SettingsService,
    private readonly ha: HaGateway,
    private readonly approvals: ApprovalsService,
  ) {
    this.riskPolicy = settings.define('policy.risk', RiskPolicySetting);
  }

  install(): void {
    this.ha.addWriteGuard((req) => this.guard(req));
  }

  setAgentEvaluator(fn: AgentWriteEvaluator): void {
    this.agentEvaluator = fn;
  }

  classify(req: WriteRequest) {
    return classifyWrite(req, this.riskPolicy.get(), this.ha.registry);
  }

  async guard(req: WriteRequest): Promise<void> {
    const p = req.principal;
    if (p.kind === 'admin' || p.kind === 'system') return;
    if (p.kind === 'agent') {
      if (!this.agentEvaluator)
        throw new AppError(403, 'policy_denied', 'Subagent permissions are not configured');
      await this.agentEvaluator(req as WriteRequest & { principal: typeof p });
      return;
    }
    // main session
    const policy = this.riskPolicy.get();
    const risk = this.classify(req);
    if (risk.level !== 'high' || !policy.confirmInSessions) return;
    await this.requireApproval(req, risk.reason, policy.approvalTimeoutSeconds);
  }

  /** Block until a human approves the write; throws when denied, expired or outside a tool call. */
  async requireApproval(req: WriteRequest, reason: string | null, timeoutSeconds: number): Promise<void> {
    const ctx = currentToolCall();
    if (!ctx)
      throw new AppError(
        403,
        'policy_denied',
        'High-risk action requires approval, which is only possible from a conversation',
      );
    const status = await this.approvals.request({
      principal: req.principal,
      toolName: ctx.toolName,
      toolCallId: ctx.toolCallId,
      summary: reason ? `${req.summary} — ${reason}` : req.summary,
      args: { domain: req.domain, service: req.service, entityIds: req.entityIds, data: req.data },
      risk: 'high',
      sessionId: ctx.sessionId,
      runId: ctx.runId,
      agentId: ctx.agentId,
      timeoutMs: timeoutSeconds * 1000,
      signal: ctx.signal,
    });
    if (status === 'approved') return;
    if (status === 'denied') throw new AppError(403, 'approval_rejected', 'The user denied this action');
    throw new AppError(403, 'approval_rejected', 'Approval was not given in time');
  }
}
