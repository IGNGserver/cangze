import type { PermissionRule } from '@cangze/contracts';
import { AppError } from '../../core/errors.ts';
import type { WriteRequest } from '../ha/gateway.ts';
import { domainOf, type HaRegistry } from '../ha/registry.ts';

const LEVEL = { read: 1, control: 2, configure: 3 } as const;

function globToRegExp(glob: string): RegExp {
  return new RegExp(
    `^${glob
      .toLowerCase()
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')}$`,
  );
}

/** Does a rule's target selector cover an entity? */
export function ruleMatchesEntity(rule: PermissionRule, entityId: string, reg: HaRegistry): boolean {
  const t = rule.targets;
  if (t.all) return true;
  const id = entityId.toLowerCase();
  if (t.entities.some((g) => (g.includes('*') ? globToRegExp(g).test(id) : g.toLowerCase() === id)))
    return true;
  if (t.domains.includes(domainOf(id))) return true;
  const area = reg.areaOf(id);
  if (area && t.areas.includes(area)) return true;
  const floor = reg.floorOf(id);
  if (floor && t.floors.includes(floor)) return true;
  const device = reg.entities.get(id)?.device_id;
  if (device && t.devices.includes(device)) return true;
  if (t.labels.length && reg.labelsOf(id).some((l) => t.labels.includes(l))) return true;
  return false;
}

function serviceAllowed(rule: PermissionRule, domain: string, service: string): boolean {
  if (!rule.services.length) return true;
  return rule.services.some((s) => s === service || s === `${domain}.${service}` || s === `${domain}.*`);
}

/** Minutes since local midnight for a date in the home's time zone. */
function localClock(now: Date, timeZone: string | null): { minutes: number; day: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone ?? undefined,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
      parts.find((p) => p.type === 'weekday')?.value ?? 'Sun',
    );
    return { minutes: h * 60 + m, day: wd < 0 ? 0 : wd };
  } catch {
    return { minutes: now.getHours() * 60 + now.getMinutes(), day: now.getDay() };
  }
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function inTimeWindow(
  win: { start: string; end: string; days: number[] },
  now: Date,
  timeZone: string | null,
): boolean {
  const { minutes, day } = localClock(now, timeZone);
  const start = toMinutes(win.start);
  const end = toMinutes(win.end);
  const crossesMidnight = start > end;
  const inside = crossesMidnight ? minutes >= start || minutes < end : minutes >= start && minutes < end;
  if (!inside) return false;
  if (!win.days.length) return true;
  // For windows past midnight, the early-morning part belongs to the previous day.
  const effectiveDay = crossesMidnight && minutes < end ? (day + 6) % 7 : day;
  return win.days.includes(effectiveDay);
}

export interface Decision {
  allowed: boolean;
  reason: string;
}

/** Read access: an allow rule of any level matches and no deny rule matches. */
export function canRead(rules: PermissionRule[], entityId: string, reg: HaRegistry): boolean {
  if (rules.some((r) => r.effect === 'deny' && ruleMatchesEntity(r, entityId, reg))) return false;
  return rules.some((r) => r.effect === 'allow' && ruleMatchesEntity(r, entityId, reg));
}

/** Whether rules allow reading everything (needed for unrestricted tools such as templates). */
export function readsEverything(rules: PermissionRule[]): boolean {
  return rules.some((r) => r.effect === 'allow' && r.targets.all) && !rules.some((r) => r.effect === 'deny');
}

/**
 * Evaluate a write for a subagent. Every affected entity needs an allow rule at the required level
 * whose services and constraints accept the call, and no deny rule may match. Target-less calls
 * (e.g. `notify.mobile_app_x`) need a rule covering the service's domain.
 */
export function evaluateWrite(
  rules: PermissionRule[],
  req: Pick<WriteRequest, 'kind' | 'domain' | 'service' | 'entityIds' | 'data'>,
  reg: HaRegistry,
  opts: { now?: Date; timeZone?: string | null; callsInLastHour?: (ruleId: string) => number } = {},
): Decision & { ruleIds: string[] } {
  const need = req.kind === 'config' ? LEVEL.configure : LEVEL.control;
  const now = opts.now ?? new Date();
  const subjects = req.entityIds.length ? req.entityIds : [null];
  const used = new Set<string>();

  for (const entity of subjects) {
    const matches = (r: PermissionRule) =>
      entity ? ruleMatchesEntity(r, entity, reg) : r.targets.all || r.targets.domains.includes(req.domain);
    const label = entity ?? `${req.domain}.${req.service}`;
    const deny = rules.find(
      (r) =>
        r.effect === 'deny' &&
        matches(r) &&
        LEVEL[r.access] <= need &&
        serviceAllowed(r, req.domain, req.service),
    );
    if (deny)
      return {
        allowed: false,
        reason: `${label} is explicitly denied${deny.note ? ` (${deny.note})` : ''}`,
        ruleIds: [deny.id],
      };

    const candidates = rules.filter((r) => r.effect === 'allow' && LEVEL[r.access] >= need && matches(r));
    if (!candidates.length) {
      return {
        allowed: false,
        reason: `no permission to ${req.kind === 'config' ? 'configure' : 'control'} ${label}`,
        ruleIds: [],
      };
    }
    const failures: string[] = [];
    let ok: PermissionRule | undefined;
    for (const r of candidates) {
      if (!serviceAllowed(r, req.domain, req.service)) {
        failures.push(`service ${req.domain}.${req.service} is not in [${r.services.join(', ')}]`);
        continue;
      }
      const bad = r.constraints.numeric.find((c) => {
        let v = req.data[c.field];
        if (req.domain === 'light' && ['brightness', 'brightness_pct'].includes(c.field)) {
          const alternate = c.field === 'brightness' ? 'brightness_pct' : 'brightness';
          if (req.data[alternate] !== undefined) {
            const converted = Number(req.data[alternate]) * (c.field === 'brightness' ? 2.55 : 100 / 255);
            if (
              !Number.isFinite(converted) ||
              (c.min !== undefined && converted < c.min) ||
              (c.max !== undefined && converted > c.max)
            )
              return true;
            v ??= converted;
          }
          if (v === undefined && req.service === 'turn_on') return true;
          if (req.data.brightness_step !== undefined || req.data.brightness_step_pct !== undefined)
            return true;
        }
        if (v === undefined) return false;
        const n = Number(v);
        return (
          !Number.isFinite(n) || (c.min !== undefined && n < c.min) || (c.max !== undefined && n > c.max)
        );
      });
      if (bad) {
        failures.push(
          `${bad.field}=${String(req.data[bad.field])} is outside ${bad.min ?? '-∞'}..${bad.max ?? '∞'}`,
        );
        continue;
      }
      if (r.constraints.timeWindow && !inTimeWindow(r.constraints.timeWindow, now, opts.timeZone ?? null)) {
        failures.push(
          `only allowed between ${r.constraints.timeWindow.start} and ${r.constraints.timeWindow.end}`,
        );
        continue;
      }
      if (
        r.constraints.maxCallsPerHour &&
        (opts.callsInLastHour?.(r.id) ?? 0) >= r.constraints.maxCallsPerHour
      ) {
        failures.push(`rate limit of ${r.constraints.maxCallsPerHour} calls per hour reached`);
        continue;
      }
      ok = r;
      break;
    }
    if (!ok) return { allowed: false, reason: `${label}: ${failures.join('; ')}`, ruleIds: [] };
    used.add(ok.id);
  }
  return { allowed: true, reason: 'allowed', ruleIds: [...used] };
}

export function assertWrite(...args: Parameters<typeof evaluateWrite>): string[] {
  const d = evaluateWrite(...args);
  if (!d.allowed) throw new AppError(403, 'policy_denied', `Permission denied: ${d.reason}`);
  return d.ruleIds;
}

/** Resolve rules to concrete entities for the permission preview in the UI. */
export function effectivePermissions(rules: PermissionRule[], reg: HaRegistry) {
  const ids = [...new Set([...reg.states.keys(), ...reg.entities.keys()])].sort();
  const read: string[] = [];
  const control: string[] = [];
  const denied: string[] = [];
  for (const id of ids) {
    if (rules.some((r) => r.effect === 'deny' && ruleMatchesEntity(r, id, reg))) {
      if (rules.some((r) => r.effect === 'allow' && ruleMatchesEntity(r, id, reg))) denied.push(id);
      continue;
    }
    const allows = rules.filter((r) => r.effect === 'allow' && ruleMatchesEntity(r, id, reg));
    if (!allows.length) continue;
    read.push(id);
    if (allows.some((r) => LEVEL[r.access] >= LEVEL.control)) control.push(id);
  }
  const configure = rules.some((r) => r.effect === 'allow' && r.access === 'configure');
  return { read, control, configure, denied };
}
