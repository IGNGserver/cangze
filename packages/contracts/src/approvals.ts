import { z } from 'zod';

export const RiskLevel = z.enum(['normal', 'high']);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const ApprovalStatus = z.enum(['pending', 'approved', 'denied', 'expired']);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

export const Approval = z.object({
  id: z.string(),
  principal: z.string(),
  sessionId: z.string().nullable(),
  runId: z.string().nullable(),
  agentId: z.string().nullable(),
  toolName: z.string(),
  toolCallId: z.string(),
  summary: z.string(),
  args: z.unknown(),
  risk: RiskLevel,
  status: ApprovalStatus,
  createdAt: z.string(),
  expiresAt: z.string(),
  decidedAt: z.string().nullable(),
  note: z.string().nullable(),
});
export type Approval = z.infer<typeof Approval>;

export const DecideApproval = z.object({ approve: z.boolean(), note: z.string().max(500).optional() });

export const RiskPolicy = z.object({
  /** Ask before risky actions in main sessions. */
  confirmInSessions: z.boolean(),
  /** Domains whose state-changing services are high risk. */
  highRiskDomains: z.array(z.string()),
  /** Individual services treated as high risk, e.g. `homeassistant.restart`. */
  highRiskServices: z.array(z.string()),
  /** Cover device classes treated as high risk (garage doors, gates). */
  highRiskCoverClasses: z.array(z.string()),
  /** Creating, editing or deleting HA configuration (automations, scripts, scenes). */
  configurationIsHighRisk: z.boolean(),
  approvalTimeoutSeconds: z.number().int().min(30).max(86_400),
});
export type RiskPolicy = z.infer<typeof RiskPolicy>;
