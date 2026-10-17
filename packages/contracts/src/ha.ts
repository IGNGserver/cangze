import { z } from 'zod';
import { QueryBool } from './common.ts';

export const HaConnectionState = z.enum([
  'unconfigured',
  'connecting',
  'connected',
  'disconnected',
  'auth_invalid',
  'error',
]);
export type HaConnectionState = z.infer<typeof HaConnectionState>;

export const HaStatus = z.object({
  state: HaConnectionState,
  url: z.string().nullable(),
  error: z.string().nullable(),
  haVersion: z.string().nullable(),
  locationName: z.string().nullable(),
  timeZone: z.string().nullable(),
  language: z.string().nullable(),
  user: z.object({ id: z.string(), name: z.string(), isAdmin: z.boolean() }).nullable(),
  entityCount: z.number(),
  connectedAt: z.string().nullable(),
  verifyTls: z.boolean(),
});
export type HaStatus = z.infer<typeof HaStatus>;

export const HaSettingsInput = z.object({
  url: z.string().url(),
  /** Omit to keep the stored token. */
  token: z.string().min(20).max(4096).optional(),
  verifyTls: z.boolean().default(true),
});
export type HaSettingsInput = z.infer<typeof HaSettingsInput>;

export const HaTestResult = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  haVersion: z.string().nullable(),
  locationName: z.string().nullable(),
  user: z.object({ name: z.string(), isAdmin: z.boolean() }).nullable(),
});

export const HaContext = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  parent_id: z.string().nullable(),
});

export const HaEntityState = z.object({
  entity_id: z.string(),
  state: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  last_changed: z.string(),
  last_updated: z.string(),
  context: HaContext.optional(),
});
export type HaEntityState = z.infer<typeof HaEntityState>;

export const HaArea = z.object({
  area_id: z.string(),
  name: z.string(),
  floor_id: z.string().nullable(),
  icon: z.string().nullable(),
  labels: z.array(z.string()),
  aliases: z.array(z.string()),
});
export type HaArea = z.infer<typeof HaArea>;

export const HaFloor = z.object({
  floor_id: z.string(),
  name: z.string(),
  level: z.number().nullable(),
  icon: z.string().nullable(),
});
export type HaFloor = z.infer<typeof HaFloor>;

export const HaDevice = z.object({
  id: z.string(),
  name: z.string().nullable(),
  name_by_user: z.string().nullable(),
  area_id: z.string().nullable(),
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  labels: z.array(z.string()),
  disabled_by: z.string().nullable(),
});
export type HaDevice = z.infer<typeof HaDevice>;

export const HaLabel = z.object({
  label_id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
});
export type HaLabel = z.infer<typeof HaLabel>;

/** Registry entry merged with live state, as served to clients. */
export const HaEntity = z.object({
  entity_id: z.string(),
  domain: z.string(),
  name: z.string(),
  state: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  last_changed: z.string(),
  last_updated: z.string(),
  area_id: z.string().nullable(),
  device_id: z.string().nullable(),
  labels: z.array(z.string()),
  entity_category: z.string().nullable(),
  hidden: z.boolean(),
  platform: z.string().nullable(),
});
export type HaEntity = z.infer<typeof HaEntity>;

export const HaEntityQuery = z.object({
  q: z.string().max(200).optional(),
  domain: z.string().max(64).optional(),
  area: z.string().max(128).optional(),
  floor: z.string().max(128).optional(),
  label: z.string().max(128).optional(),
  device: z.string().max(128).optional(),
  includeHidden: QueryBool.default(false),
  limit: z.coerce.number().int().min(1).max(5000).default(2000),
});

export const HaTarget = z.object({
  entity_id: z.union([z.string(), z.array(z.string())]).optional(),
  device_id: z.union([z.string(), z.array(z.string())]).optional(),
  area_id: z.union([z.string(), z.array(z.string())]).optional(),
  floor_id: z.union([z.string(), z.array(z.string())]).optional(),
  label_id: z.union([z.string(), z.array(z.string())]).optional(),
});
export type HaTarget = z.infer<typeof HaTarget>;

export const HaServiceCall = z.object({
  target: HaTarget.optional(),
  data: z.record(z.string(), z.unknown()).default({}),
  returnResponse: z.boolean().default(false),
});

export const HaServiceCallResult = z.object({
  entityIds: z.array(z.string()),
  contextId: z.string().nullable(),
  response: z.unknown().optional(),
});

export const HaServiceField = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  example: z.unknown().optional(),
  default: z.unknown().optional(),
  selector: z.record(z.string(), z.unknown()).optional(),
  advanced: z.boolean().optional(),
});

export const HaService = z.object({
  domain: z.string(),
  service: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  hasTarget: z.boolean(),
  fields: z.record(z.string(), HaServiceField),
  response: z.enum(['none', 'optional', 'only']),
});
export type HaService = z.infer<typeof HaService>;

export const HaHistoryQuery = z.object({
  entityId: z.string().min(1),
  start: z.string().optional(),
  end: z.string().optional(),
  hours: z.coerce
    .number()
    .min(1)
    .max(24 * 31)
    .default(24),
});

export const HaHistoryPoint = z.object({
  t: z.number(),
  s: z.string(),
  a: z.record(z.string(), z.unknown()).optional(),
});
export type HaHistoryPoint = z.infer<typeof HaHistoryPoint>;

/** Coalesced state update published on the `ha:states` stream topic. */
export const HaStateEvent = z.object({
  entity_id: z.string(),
  state: z.string().nullable(),
  attributes: z.record(z.string(), z.unknown()).nullable(),
  last_changed: z.string().nullable(),
  last_updated: z.string().nullable(),
});
export type HaStateEvent = z.infer<typeof HaStateEvent>;
