import type { RiskLevel, RiskPolicy } from '@cangze/contracts';
import { z } from 'zod';
import type { WriteRequest } from '../ha/gateway.ts';
import { domainOf, type HaRegistry } from '../ha/registry.ts';

export const DEFAULT_RISK_POLICY: RiskPolicy = {
  confirmInSessions: true,
  highRiskDomains: ['lock', 'alarm_control_panel'],
  highRiskServices: [
    'homeassistant.restart',
    'homeassistant.stop',
    'homeassistant.reload_all',
    'homeassistant.reload_core_config',
    'hassio.host_reboot',
    'hassio.host_shutdown',
    'hassio.addon_stop',
    'hassio.backup_full',
    'hassio.restore_full',
  ],
  highRiskCoverClasses: ['garage', 'gate', 'door'],
  configurationIsHighRisk: true,
  approvalTimeoutSeconds: 300,
};

export const RiskPolicySetting = z
  .object({
    confirmInSessions: z.boolean(),
    highRiskDomains: z.array(z.string()),
    highRiskServices: z.array(z.string()),
    highRiskCoverClasses: z.array(z.string()),
    configurationIsHighRisk: z.boolean(),
    approvalTimeoutSeconds: z.number().int().min(30).max(86_400),
  })
  .default(DEFAULT_RISK_POLICY);

/** Services that make a high-risk domain safer rather than less safe. */
const SAFE_SERVICES = new Set([
  'lock.lock',
  'cover.close_cover',
  'alarm_control_panel.alarm_arm_away',
  'alarm_control_panel.alarm_arm_home',
]);

/** Classify a write before it reaches Home Assistant. */
export function classifyWrite(
  req: WriteRequest,
  policy: RiskPolicy,
  registry: HaRegistry,
): { level: RiskLevel; reason: string | null } {
  const service = `${req.domain}.${req.service}`;
  if (req.kind === 'config') {
    return policy.configurationIsHighRisk
      ? { level: 'high', reason: 'changes Home Assistant configuration' }
      : { level: 'normal', reason: null };
  }
  if (policy.highRiskServices.includes(service))
    return { level: 'high', reason: `${service} is a high-risk service` };
  if (SAFE_SERVICES.has(service)) return { level: 'normal', reason: null };
  if (policy.highRiskDomains.includes(req.domain))
    return { level: 'high', reason: `${req.domain} devices are high risk` };
  for (const id of req.entityIds) {
    const d = domainOf(id);
    if (policy.highRiskDomains.includes(d)) return { level: 'high', reason: `affects ${id}` };
    if (d === 'cover') {
      const dc = registry.states.get(id)?.attributes.device_class;
      if (
        typeof dc === 'string' &&
        policy.highRiskCoverClasses.includes(dc) &&
        req.service !== 'close_cover'
      ) {
        return { level: 'high', reason: `${id} is a ${dc}` };
      }
    }
  }
  return { level: 'normal', reason: null };
}
