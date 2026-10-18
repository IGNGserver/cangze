import { z } from 'zod';
import { ModelRef, ThinkingLevel } from './models.ts';

const ids = z.array(z.string().min(1).max(255)).max(500).default([]);

/** What a rule applies to. An entity matches when any listed selector matches it. */
export const RuleTargets = z.object({
  /** Every entity (use with care). */
  all: z.boolean().default(false),
  /** Entity ids; `*` wildcards allowed, e.g. `light.*`, `sensor.living_*`. */
  entities: ids,
  domains: ids,
  areas: ids,
  floors: ids,
  devices: ids,
  labels: ids,
});
export type RuleTargets = z.infer<typeof RuleTargets>;

export const NumericConstraint = z.object({
  /** Service data field, e.g. `temperature`, `brightness_pct`. */
  field: z.string().min(1).max(100),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const TimeWindow = z.object({
  /** Local time of the home, `HH:mm`. Windows may cross midnight. */
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  /** 0 = Sunday … 6 = Saturday; empty = every day. */
  days: z.array(z.number().int().min(0).max(6)).default([]),
});

export const PermissionRule = z.object({
  id: z.string().min(1).max(64),
  effect: z.enum(['allow', 'deny']).default('allow'),
  /** `read` < `control` < `configure`. Control includes read. */
  access: z.enum(['read', 'control', 'configure']),
  targets: RuleTargets,
  /** Allowed services, e.g. `turn_on` or `light.turn_on`. Empty = any service. Only for allow/control. */
  services: z.array(z.string().min(1).max(120)).max(100).default([]),
  constraints: z
    .object({
      numeric: z.array(NumericConstraint).max(20).default([]),
      timeWindow: TimeWindow.nullable().default(null),
      maxCallsPerHour: z.number().int().min(1).max(10_000).nullable().default(null),
    })
    .default({ numeric: [], timeWindow: null, maxCallsPerHour: null }),
  note: z.string().max(500).optional(),
});
export type PermissionRule = z.infer<typeof PermissionRule>;

export const TriggerKind = z.enum(['cron', 'interval', 'ha_state', 'ha_event', 'ha_trigger', 'manual']);
export type TriggerKind = z.infer<typeof TriggerKind>;

const TriggerBase = {
  id: z.string().min(1).max(64),
  name: z.string().max(120).default(''),
  enabled: z.boolean().default(true),
  /** Ignore repeated firings within this many seconds. */
  debounceSeconds: z.number().int().min(0).max(86_400).default(0),
};

export const Trigger = z.discriminatedUnion('kind', [
  z.object({ ...TriggerBase, kind: z.literal('cron'), expression: z.string().min(9).max(120) }),
  z.object({ ...TriggerBase, kind: z.literal('interval'), minutes: z.number().int().min(1).max(10_080) }),
  z.object({
    ...TriggerBase,
    kind: z.literal('ha_state'),
    entityIds: z.array(z.string().min(3)).min(1).max(100),
    attribute: z.string().max(100).optional(),
    from: z.string().max(255).optional(),
    to: z.string().max(255).optional(),
    /** Fire only after the new state held for this long. */
    forSeconds: z.number().int().min(0).max(86_400).default(0),
  }),
  z.object({
    ...TriggerBase,
    kind: z.literal('ha_event'),
    eventType: z.string().min(1).max(255),
    /** Fire only when event data contains these key/values. */
    dataMatch: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({
    ...TriggerBase,
    kind: z.literal('ha_trigger'),
    /** Any Home Assistant trigger configuration, e.g. `{ "platform": "sun", "event": "sunset" }`. */
    trigger: z.record(z.string(), z.unknown()),
  }),
  z.object({ ...TriggerBase, kind: z.literal('manual') }),
]);
export type Trigger = z.infer<typeof Trigger>;

export const AgentLimits = z.object({
  maxRunSeconds: z.number().int().min(10).max(3600).default(300),
  maxToolCalls: z.number().int().min(1).max(500).default(40),
  /** USD per day across all runs; null = unlimited. */
  dailyCostLimit: z.number().min(0).max(1000).nullable().default(null),
  /** What to do when a trigger fires while a run is active. */
  overlap: z.enum(['skip', 'queue', 'replace']).default('skip'),
  /** Missed schedules while the hub was down. */
  misfire: z.enum(['skip', 'run_once']).default('skip'),
});
export type AgentLimits = z.infer<typeof AgentLimits>;

export const AgentDefinition = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(1000).default(''),
  instructions: z.string().min(1).max(40_000),
  modelRef: ModelRef.nullable().default(null),
  thinkingLevel: ThinkingLevel.nullable().default(null),
  /** Granted tool names (see /api/v1/tools). Agent management tools cannot be granted. */
  tools: z.array(z.string().min(1).max(64)).max(100).default([]),
  permissions: z.array(PermissionRule).max(200).default([]),
  /** High-risk actions (locks, alarms, garage doors, configuration) even when rules allow them. */
  highRisk: z.enum(['deny', 'approve', 'allow']).default('approve'),
  allowIndirectActions: z.boolean().default(false),
  contextMode: z.enum(['continuous', 'isolated']).default('isolated'),
  triggers: z.array(Trigger).max(50).default([]),
  limits: AgentLimits.default({
    maxRunSeconds: 300,
    maxToolCalls: 40,
    dailyCostLimit: null,
    overlap: 'skip',
    misfire: 'skip',
  }),
  /** 1–100. Higher priority agents may override lower priority agents' recent changes. */
  priority: z.number().int().min(1).max(100).default(50),
  /** Do not change an entity a human changed within this many minutes. */
  respectManualMinutes: z.number().int().min(0).max(1440).default(30),
  notifyOnFailure: z.boolean().default(true),
});
export type AgentDefinition = z.infer<typeof AgentDefinition>;
export type AgentDefinitionInput = z.input<typeof AgentDefinition>;

export const RunStatus = z.enum([
  'queued',
  'running',
  'waiting_approval',
  'succeeded',
  'failed',
  'aborted',
  'skipped',
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const RunSummary = z.object({
  id: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  revision: z.number(),
  triggerId: z.string().nullable(),
  triggerKind: z.string(),
  triggerPayload: z.unknown(),
  requestedBy: z.string().nullable(),
  reportSessionId: z.string().nullable(),
  task: z.string().nullable(),
  status: RunStatus,
  chainDepth: z.number(),
  queuedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
  summary: z.string().nullable(),
  usage: z.object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
    cost: z.number(),
  }),
});
export type RunSummary = z.infer<typeof RunSummary>;

export const TriggerState = z.object({
  triggerId: z.string(),
  lastFiredAt: z.string().nullable(),
  nextFireAt: z.string().nullable(),
  fireCount: z.number(),
  error: z.string().nullable(),
});

export const AgentSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  revision: z.number(),
  modelRef: z.string().nullable(),
  triggerCount: z.number(),
  running: z.boolean(),
  lastRun: RunSummary.nullable(),
  nextFireAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgentSummary = z.infer<typeof AgentSummary>;

export const AgentDetail = AgentSummary.extend({
  definition: AgentDefinition,
  triggers: z.array(TriggerState),
  costToday: z.number(),
  stats: z.object({ runs: z.number(), succeeded: z.number(), failed: z.number() }),
});
export type AgentDetail = z.infer<typeof AgentDetail>;

export const SaveAgent = z.object({
  /** Revision the edit is based on; omitted when creating. */
  baseRevision: z.number().int().optional(),
  definition: AgentDefinition,
  note: z.string().max(500).optional(),
});

export const AgentRevision = z.object({
  revision: z.number(),
  createdBy: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  definition: AgentDefinition,
});

export const MemoryNote = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  updatedBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MemoryNote = z.infer<typeof MemoryNote>;

export const SaveMemoryNote = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(20_000),
});

export const RunAgent = z.object({ task: z.string().max(10_000).optional() });

export const EffectivePermissions = z.object({
  read: z.array(z.string()),
  control: z.array(z.string()),
  configure: z.boolean(),
  denied: z.array(z.string()),
});

export const UpcomingFire = z.object({
  agentId: z.string(),
  agentName: z.string(),
  triggerId: z.string(),
  triggerName: z.string(),
  kind: TriggerKind,
  at: z.string(),
});
export type UpcomingFire = z.infer<typeof UpcomingFire>;
