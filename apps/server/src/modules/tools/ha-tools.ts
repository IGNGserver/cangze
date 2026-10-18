import { StringEnum, Type, type ImageContent } from '@earendil-works/pi-ai';
import { AppError, badRequest } from '../../core/errors.ts';
import type { HaGateway } from '../ha/gateway.ts';
import { domainOf } from '../ha/registry.ts';
import { defineTool, type ToolDef, type ToolEnv } from './types.ts';

const ids = (description: string) => Type.Optional(Type.Array(Type.String(), { description }));

const Target = Type.Object(
  {
    entity_id: ids('Entity ids, e.g. ["light.kitchen"]'),
    area_id: ids('Area ids from ha_overview'),
    floor_id: ids('Floor ids from ha_overview'),
    device_id: ids('Device ids'),
    label_id: ids('Label ids'),
  },
  { description: 'What the service acts on. Prefer explicit entity ids after searching.' },
);

const CONFIG_KINDS = ['automation', 'script', 'scene'] as const;

function fmtState(state: string, attrs: Record<string, unknown>): string {
  const unit = attrs.unit_of_measurement;
  return typeof unit === 'string' ? `${state} ${unit}` : state;
}

function iso(d: Date): string {
  return d.toISOString();
}

/** Keep at most `n` points evenly spread over a series. */
function downsample<T>(points: T[], n: number): T[] {
  if (points.length <= n) return points;
  const step = points.length / n;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(points[Math.floor(i * step)]!);
  out.push(points[points.length - 1]!);
  return out;
}

/** Throw unless the caller may read every entity in the list. */
function assertReadable(env: ToolEnv, ids: string[]): void {
  if (!env.access) return;
  const denied = ids.filter((id) => !env.access!.canRead(id));
  if (denied.length) throw new AppError(403, 'policy_denied', `No permission to read ${denied.join(', ')}`);
}

function assertReadAll(env: ToolEnv, what: string): void {
  if (env.access && !env.access.readAll)
    throw new AppError(403, 'policy_denied', `${what} needs read access to every entity`);
}

function requireAdmin(ha: HaGateway): void {
  if (!ha.isHaAdmin) {
    throw new AppError(
      403,
      'ha_not_admin',
      'The Home Assistant token does not belong to an administrator, so configuration cannot be read or changed.',
    );
  }
}

export function haTools(ha: HaGateway): ToolDef[] {
  const reg = ha.registry;
  const areaName = (id: string | null) => (id ? (reg.areas.get(id)?.name ?? id) : '-');

  const tools: ToolDef[] = [
    defineTool({
      name: 'ha_overview',
      label: 'Home overview',
      group: 'home',
      risk: 'read',
      description:
        'Floors, areas (with ids) and how many entities of each domain they contain, plus labels. Call this first when you do not know the layout of the home.',
      parameters: Type.Object({}),
      execute: async () => {
        const labels = [...reg.labels.values()].map((l) => `${l.name} (label_id: ${l.label_id})`).join(', ');
        return { text: `${reg.overview()}\n\nLabels: ${labels || 'none'}` };
      },
    }),
    defineTool({
      name: 'ha_search_entities',
      label: 'Search entities',
      group: 'home',
      risk: 'read',
      description:
        'Find entities by words in their name, id, area or device, optionally filtered by domain, area, floor or label. Returns "entity_id | name | state | area" lines. Always search before acting instead of guessing entity ids.',
      parameters: Type.Object({
        query: Type.Optional(Type.String({ description: 'Words to match, e.g. "kitchen light"' })),
        domain: Type.Optional(Type.String({ description: 'e.g. light, switch, climate, sensor' })),
        area: Type.Optional(Type.String({ description: 'area_id' })),
        floor: Type.Optional(Type.String({ description: 'floor_id' })),
        label: Type.Optional(Type.String({ description: 'label_id' })),
        include_hidden: Type.Optional(
          Type.Boolean({ description: 'Include hidden and diagnostic entities' }),
        ),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 40 })),
      }),
      execute: async (env, p) => {
        const limit = p.limit ?? 40;
        const found = reg.search({
          q: p.query,
          domain: p.domain,
          area: p.area,
          floor: p.floor,
          label: p.label,
          includeHidden: p.include_hidden,
          limit: 5000,
        });
        const all = env.access ? found.filter((e) => env.access!.canRead(e.entity_id)) : found;
        if (!all.length)
          return {
            text: 'No entities matched. Try fewer words, another language, or ha_overview to see areas.',
          };
        const lines = all
          .slice(0, limit)
          .map(
            (e) => `${e.entity_id} | ${e.name} | ${fmtState(e.state, e.attributes)} | ${areaName(e.area_id)}`,
          );
        const more =
          all.length > limit ? `\n(${all.length - limit} more matches not shown; refine the query)` : '';
        return { text: lines.join('\n') + more, details: { count: all.length } };
      },
    }),
    defineTool({
      name: 'ha_get_states',
      label: 'Get states',
      group: 'home',
      risk: 'read',
      description: 'Current state, attributes and last change time of up to 30 entities.',
      parameters: Type.Object({
        entity_ids: Type.Array(Type.String(), { minItems: 1, maxItems: 30 }),
        attributes: Type.Optional(Type.Boolean({ default: true })),
      }),
      execute: async (env, p) => {
        assertReadable(
          env,
          p.entity_ids.map((id) => id.toLowerCase()),
        );
        const out = p.entity_ids.map((id) => {
          const e = reg.toEntity(id.toLowerCase());
          if (!e) return { entity_id: id, error: 'not found' };
          return {
            entity_id: e.entity_id,
            name: e.name,
            state: e.state,
            area: areaName(e.area_id),
            last_changed: e.last_changed,
            ...(p.attributes === false ? {} : { attributes: e.attributes }),
          };
        });
        return { text: JSON.stringify(out, null, 1) };
      },
    }),
    defineTool({
      name: 'ha_list_services',
      label: 'List services',
      group: 'home',
      risk: 'read',
      description:
        'Services of one domain with their fields (required marked with *), so that ha_call_service gets valid data.',
      parameters: Type.Object({ domain: Type.String() }),
      execute: async (_env, p) => {
        const services = ha.listServices(p.domain);
        if (!services.length) return { text: `No services in domain "${p.domain}".`, isError: true };
        const lines = services.map((s) => {
          const fields = Object.entries(s.fields)
            .map(([k, f]) => {
              const sel = f.selector ? Object.keys(f.selector)[0] : undefined;
              const range =
                sel === 'number' && f.selector
                  ? (() => {
                      const n = (f.selector as { number?: { min?: number; max?: number } }).number;
                      return n ? `${n.min ?? ''}..${n.max ?? ''}` : '';
                    })()
                  : sel === 'select' && f.selector
                    ? `[${((f.selector as { select?: { options?: unknown[] } }).select?.options ?? [])
                        .map((o) => (typeof o === 'string' ? o : (o as { value?: string }).value))
                        .slice(0, 12)
                        .join('|')}]`
                    : '';
              return `${k}${f.required ? '*' : ''}${sel ? `:${sel}${range ? ' ' + range : ''}` : ''}`;
            })
            .join(', ');
          return `${s.domain}.${s.service}${s.hasTarget ? ' (target)' : ''}${s.response !== 'none' ? ` (response ${s.response})` : ''}${fields ? ` — ${fields}` : ''}`;
        });
        return { text: lines.join('\n') };
      },
    }),
    defineTool({
      name: 'ha_call_service',
      label: 'Call service',
      group: 'home',
      risk: 'control',
      sequential: true,
      description:
        'Call a Home Assistant service, e.g. light.turn_on with data {"brightness_pct": 40}. Area/floor/device/label targets are expanded to entities. Returns the affected entities and their states afterwards. High-risk actions may wait for the user\'s approval.',
      parameters: Type.Object({
        domain: Type.String(),
        service: Type.String(),
        target: Type.Optional(Target),
        data: Type.Optional(
          Type.Record(Type.String(), Type.Unknown(), { description: 'Service data fields' }),
        ),
        return_response: Type.Optional(
          Type.Boolean({ description: 'Return the service response (for services that provide one)' }),
        ),
      }),
      execute: async (env, p) => {
        const svc = ha.getService(p.domain, p.service);
        if (!svc) {
          const alternatives = ha
            .listServices(p.domain)
            .map((s) => s.service)
            .slice(0, 20)
            .join(', ');
          throw badRequest(
            `Service ${p.domain}.${p.service} does not exist.${alternatives ? ` Available in ${p.domain}: ${alternatives}` : ''}`,
          );
        }
        const missing = Object.entries(svc.fields)
          .filter(([k, f]) => f.required && (p.data ?? {})[k] === undefined)
          .map(([k]) => k);
        if (missing.length) throw badRequest(`Missing required field(s): ${missing.join(', ')}`);
        const result = await ha.callService(env.principal, {
          domain: p.domain,
          service: p.service,
          target: p.target,
          data: p.data ?? {},
          returnResponse: p.return_response ?? svc.response === 'only',
        });
        // give HA a moment to report the new states
        await new Promise((r) => setTimeout(r, 400));
        const states = result.entityIds
          .slice(0, 30)
          .map((id) => {
            const s = reg.states.get(id);
            return `${id}: ${s ? fmtState(s.state, s.attributes) : 'unknown'}`;
          })
          .join('\n');
        const response =
          result.response !== undefined ? `\nResponse: ${JSON.stringify(result.response)}` : '';
        return {
          text: `Called ${p.domain}.${p.service}${result.entityIds.length ? ` on ${result.entityIds.length} entit${result.entityIds.length === 1 ? 'y' : 'ies'}` : ''}.${states ? `\nStates now:\n${states}` : ''}${response}`,
          details: { entityIds: result.entityIds, contextId: result.contextId },
        };
      },
    }),
    defineTool({
      name: 'ha_history',
      label: 'State history',
      group: 'home',
      risk: 'read',
      description: "How an entity's state changed over the last hours (downsampled to at most 48 points).",
      parameters: Type.Object({
        entity_id: Type.String(),
        hours: Type.Optional(Type.Number({ minimum: 0.25, maximum: 720, default: 24 })),
      }),
      execute: async (env, p) => {
        assertReadable(env, [p.entity_id]);
        const end = new Date();
        const start = new Date(end.getTime() - (p.hours ?? 24) * 3600_000);
        const res = await ha.history([p.entity_id], start, end);
        const points = res[p.entity_id] ?? [];
        if (!points.length) return { text: 'No history in this period.' };
        const lines = downsample(points, 48).map((pt) => `${new Date(pt.t).toISOString()} ${pt.s}`);
        return { text: `${points.length} changes; sample:\n${lines.join('\n')}` };
      },
    }),
    defineTool({
      name: 'ha_logbook',
      label: 'Logbook',
      group: 'home',
      risk: 'read',
      description: 'Recent logbook events (who/what changed what), optionally for one entity.',
      parameters: Type.Object({
        entity_id: Type.Optional(Type.String()),
        hours: Type.Optional(Type.Number({ minimum: 0.25, maximum: 72, default: 6 })),
      }),
      execute: async (env, p) => {
        if (p.entity_id) assertReadable(env, [p.entity_id]);
        else assertReadAll(env, 'The logbook of all entities');
        const end = new Date();
        const start = new Date(end.getTime() - (p.hours ?? 6) * 3600_000);
        const events = await ha.query<Array<Record<string, unknown>>>({
          type: 'logbook/get_events',
          start_time: iso(start),
          end_time: iso(end),
          ...(p.entity_id ? { entity_ids: [p.entity_id] } : {}),
        });
        const lines = events.slice(-150).map((e) => {
          const when =
            typeof e.when === 'number' ? new Date(e.when * 1000).toISOString() : String(e.when ?? '');
          return `${when} ${e.entity_id ?? ''} ${e.state ?? e.message ?? ''}${e.context_user_id ? ' (by user)' : ''}`.trim();
        });
        return { text: lines.length ? lines.join('\n') : 'No logbook entries.' };
      },
    }),
    defineTool({
      name: 'ha_statistics',
      label: 'Long-term statistics',
      group: 'home',
      risk: 'read',
      description: 'Aggregated long-term statistics (energy, temperature, …) per hour/day/week/month.',
      parameters: Type.Object({
        statistic_ids: Type.Array(Type.String(), {
          minItems: 1,
          maxItems: 10,
          description: 'Usually entity ids of sensors with state_class',
        }),
        period: StringEnum(['5minute', 'hour', 'day', 'week', 'month'] as const),
        days: Type.Optional(Type.Number({ minimum: 1, maximum: 366, default: 7 })),
      }),
      execute: async (env, p) => {
        assertReadable(
          env,
          p.statistic_ids.filter((id) => id.includes('.') && !id.includes(':')),
        );
        const end = new Date();
        const start = new Date(end.getTime() - (p.days ?? 7) * 86_400_000);
        const res = await ha.query<Record<string, Array<Record<string, unknown>>>>({
          type: 'recorder/statistics_during_period',
          start_time: iso(start),
          end_time: iso(end),
          statistic_ids: p.statistic_ids,
          period: p.period,
          types: ['mean', 'min', 'max', 'sum', 'change'],
        });
        const parts = Object.entries(res).map(([id, rows]) => {
          const lines = downsample(rows, 60).map((r) => {
            const t = typeof r.start === 'number' ? new Date(r.start).toISOString() : String(r.start);
            const vals = ['mean', 'min', 'max', 'change', 'sum']
              .filter((k) => typeof r[k] === 'number')
              .map((k) => `${k}=${Math.round((r[k] as number) * 100) / 100}`)
              .join(' ');
            return `${t} ${vals}`;
          });
          return `${id}:\n${lines.join('\n')}`;
        });
        return { text: parts.length ? parts.join('\n\n') : 'No statistics found for these ids.' };
      },
    }),
    defineTool({
      name: 'ha_render_template',
      label: 'Render template',
      group: 'home',
      risk: 'read',
      description:
        'Evaluate a Home Assistant Jinja template, useful for aggregate questions, e.g. {{ states.light | selectattr("state","eq","on") | list | count }}.',
      parameters: Type.Object({ template: Type.String({ maxLength: 4000 }) }),
      execute: async (env, p) => {
        assertReadAll(env, 'Templates');
        return { text: await ha.renderTemplate(p.template) };
      },
    }),
    defineTool({
      name: 'ha_camera_snapshot',
      label: 'Camera snapshot',
      group: 'home',
      risk: 'read',
      description: 'Current image of a camera entity. Only useful with models that accept images.',
      parameters: Type.Object({ entity_id: Type.String() }),
      execute: async (env, p) => {
        if (domainOf(p.entity_id) !== 'camera') throw badRequest('Not a camera entity');
        assertReadable(env, [p.entity_id]);
        if (!env.model.input.includes('image')) {
          return {
            text: 'The current model cannot view images. Ask the user to switch to a vision-capable model.',
            isError: true,
          };
        }
        const res = await ha.rest('GET', `/api/camera_proxy/${p.entity_id}`);
        if (!res.ok) throw new AppError(502, 'camera_failed', `Camera returned HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 5 * 1024 * 1024)
          throw new AppError(413, 'image_too_large', 'Camera image is larger than 5 MB');
        const image: ImageContent = {
          type: 'image',
          data: buf.toString('base64'),
          mimeType: res.headers.get('content-type') ?? 'image/jpeg',
        };
        return { text: `Snapshot of ${p.entity_id} at ${new Date().toISOString()}`, images: [image] };
      },
    }),
    defineTool({
      name: 'ha_calendar_events',
      label: 'Calendar events',
      group: 'home',
      risk: 'read',
      description: 'Events of a calendar entity in the next days.',
      parameters: Type.Object({
        entity_id: Type.String(),
        days: Type.Optional(Type.Number({ minimum: 1, maximum: 62, default: 7 })),
      }),
      execute: async (env, p) => {
        assertReadable(env, [p.entity_id]);
        const start = new Date();
        const end = new Date(start.getTime() + (p.days ?? 7) * 86_400_000);
        const res = await ha.rest(
          'GET',
          `/api/calendars/${p.entity_id}?start=${encodeURIComponent(iso(start))}&end=${encodeURIComponent(iso(end))}`,
        );
        if (!res.ok) throw new AppError(502, 'calendar_failed', `Calendar returned HTTP ${res.status}`);
        const events = (await res.json()) as Array<{
          summary?: string;
          start?: { dateTime?: string; date?: string };
          end?: { dateTime?: string; date?: string };
          location?: string;
        }>;
        const lines = events.map(
          (e) =>
            `${e.start?.dateTime ?? e.start?.date} → ${e.end?.dateTime ?? e.end?.date}: ${e.summary ?? ''}${e.location ? ` @ ${e.location}` : ''}`,
        );
        return { text: lines.length ? lines.join('\n') : 'No events.' };
      },
    }),
    defineTool({
      name: 'ha_todo_items',
      label: 'To-do items',
      group: 'home',
      risk: 'read',
      description:
        'Items of a to-do list entity. Add or complete items with ha_call_service (todo.add_item, todo.update_item).',
      parameters: Type.Object({ entity_id: Type.String() }),
      execute: async (env, p) => {
        assertReadable(env, [p.entity_id]);
        const res = await ha.query<{ items: Array<{ summary: string; status: string; due?: string }> }>({
          type: 'todo/item/list',
          entity_id: p.entity_id,
        });
        const lines = res.items.map(
          (i) => `[${i.status === 'completed' ? 'x' : ' '}] ${i.summary}${i.due ? ` (due ${i.due})` : ''}`,
        );
        return { text: lines.length ? lines.join('\n') : 'The list is empty.' };
      },
    }),
    defineTool({
      name: 'ha_list_configs',
      label: 'List automations/scripts/scenes',
      group: 'config',
      risk: 'read',
      description:
        'Automations, scripts or scenes with their config ids (needed for ha_get_config) and state.',
      parameters: Type.Object({ kind: StringEnum(CONFIG_KINDS) }),
      execute: async (env, p) => {
        const lines: string[] = [];
        for (const [id, s] of reg.states) {
          if (domainOf(id) !== p.kind) continue;
          if (env.access && !env.access.canRead(id)) continue;
          const cfgId =
            p.kind === 'script' ? id.slice('script.'.length) : (s.attributes.id as string | undefined);
          const last = s.attributes.last_triggered
            ? ` last_triggered=${String(s.attributes.last_triggered)}`
            : '';
          lines.push(
            `${id} | ${reg.displayName(id)} | ${s.state} | config_id=${cfgId ?? '(not editable)'}${last}`,
          );
        }
        return { text: lines.length ? lines.join('\n') : `No ${p.kind}s.` };
      },
    }),
    defineTool({
      name: 'ha_get_config',
      label: 'Read configuration',
      group: 'config',
      risk: 'read',
      description: 'The YAML-equivalent JSON configuration of an automation, script or scene, by config id.',
      parameters: Type.Object({ kind: StringEnum(CONFIG_KINDS), config_id: Type.String() }),
      execute: async (env, p) => {
        requireAdmin(ha);
        assertReadAll(env, 'Reading Home Assistant configuration');
        const res = await ha.rest('GET', `/api/config/${p.kind}/config/${encodeURIComponent(p.config_id)}`);
        if (res.status === 404)
          throw new AppError(
            404,
            'not_found',
            `${p.kind} ${p.config_id} not found (or not managed in the UI)`,
          );
        if (!res.ok) throw new AppError(502, 'ha_error', `Home Assistant returned HTTP ${res.status}`);
        return { text: JSON.stringify(await res.json(), null, 1) };
      },
    }),
    defineTool({
      name: 'ha_save_config',
      label: 'Save configuration',
      group: 'config',
      risk: 'configure',
      sequential: true,
      description:
        "Create or replace an automation, script or scene in Home Assistant (UI-managed configs). Omit config_id to create a new one. Use Home Assistant's automation schema (triggers, conditions, actions). Requires approval by default.",
      parameters: Type.Object({
        kind: StringEnum(CONFIG_KINDS),
        config_id: Type.Optional(
          Type.String({ description: 'Existing config id; for scripts the slug after "script."' }),
        ),
        config: Type.Record(Type.String(), Type.Unknown()),
      }),
      execute: async (env, p) => {
        requireAdmin(ha);
        const id =
          p.config_id ??
          (p.kind === 'script'
            ? String(p.config.alias ?? 'script')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_|_$/g, '') || `script_${Date.now()}`
            : String(Date.now()));
        const summary = `save ${p.kind} ${id}${p.config.alias ? ` ("${String(p.config.alias)}")` : ''}`;
        await ha.configWrite(
          env.principal,
          { domain: p.kind, action: 'save_config', data: { config_id: id, config: p.config }, summary },
          async ({ rest }) => {
            const res = await rest(
              'POST',
              `/api/config/${p.kind}/config/${encodeURIComponent(id)}`,
              p.config,
            );
            if (!res.ok) {
              const body = await res.text().catch(() => '');
              throw new AppError(
                400,
                'ha_config_invalid',
                `Home Assistant rejected the ${p.kind}: ${body.slice(0, 500) || res.status}`,
              );
            }
          },
        );
        return {
          text: `Saved ${p.kind} with config_id=${id}. Home Assistant reloads it automatically.`,
          details: { configId: id },
        };
      },
    }),
    defineTool({
      name: 'ha_delete_config',
      label: 'Delete configuration',
      group: 'config',
      risk: 'configure',
      sequential: true,
      description: 'Delete a UI-managed automation, script or scene. Requires approval by default.',
      parameters: Type.Object({ kind: StringEnum(CONFIG_KINDS), config_id: Type.String() }),
      execute: async (env, p) => {
        requireAdmin(ha);
        await ha.configWrite(
          env.principal,
          {
            domain: p.kind,
            action: 'delete_config',
            data: { config_id: p.config_id },
            summary: `delete ${p.kind} ${p.config_id}`,
          },
          async ({ rest }) => {
            const res = await rest(
              'DELETE',
              `/api/config/${p.kind}/config/${encodeURIComponent(p.config_id)}`,
            );
            if (!res.ok) throw new AppError(400, 'ha_error', `Home Assistant returned HTTP ${res.status}`);
          },
        );
        return { text: `Deleted ${p.kind} ${p.config_id}.` };
      },
    }),
  ];
  return tools;
}
