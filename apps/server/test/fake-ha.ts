import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';

/**
 * A small in-process Home Assistant stand-in speaking the WebSocket API (auth, states,
 * registries, services, events, triggers, templates) and a few REST endpoints.
 * Service calls toggle state the way the matching domain would, so tests can observe effects.
 */
export interface FakeState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
  context: { id: string; user_id: string | null; parent_id: string | null };
}

export const FAKE_TOKEN = 'fake-long-lived-token-0123456789';
export const FAKE_USER_ID = 'user-cangze';
export const HUMAN_USER_ID = 'user-human';

const now = () => new Date().toISOString();

function st(entity_id: string, state: string, attributes: Record<string, unknown> = {}): FakeState {
  return {
    entity_id,
    state,
    attributes,
    last_changed: now(),
    last_updated: now(),
    context: { id: randomUUID(), user_id: null, parent_id: null },
  };
}

export function defaultHome() {
  return {
    states: [
      st('light.living_ceiling', 'off', { friendly_name: 'Living room ceiling', brightness: null }),
      st('light.living_lamp', 'on', { friendly_name: 'Floor lamp', brightness: 180 }),
      st('light.bedroom', 'off', { friendly_name: 'Bedroom light' }),
      st('switch.coffee', 'off', { friendly_name: 'Coffee machine' }),
      st('lock.front_door', 'locked', { friendly_name: 'Front door' }),
      st('climate.living', 'heat', {
        friendly_name: 'Living thermostat',
        temperature: 21,
        current_temperature: 20.5,
      }),
      st('sensor.living_temperature', '20.5', {
        friendly_name: 'Living temperature',
        unit_of_measurement: '°C',
        device_class: 'temperature',
      }),
      st('binary_sensor.hall_motion', 'off', { friendly_name: 'Hall motion', device_class: 'motion' }),
      st('sensor.living_lamp_power', '12', { friendly_name: 'Lamp power', unit_of_measurement: 'W' }),
      st('script.good_night', 'off', { friendly_name: 'Good night' }),
      st('camera.door', 'idle', { friendly_name: 'Door camera' }),
    ],
    areas: [
      {
        area_id: 'living_room',
        name: 'Living room',
        floor_id: 'ground',
        labels: [],
        aliases: ['lounge'],
        icon: null,
      },
      { area_id: 'bedroom', name: 'Bedroom', floor_id: 'first', labels: ['quiet'], aliases: [], icon: null },
      { area_id: 'hall', name: 'Hall', floor_id: 'ground', labels: [], aliases: [], icon: null },
      { area_id: 'kitchen', name: 'Kitchen', floor_id: 'ground', labels: [], aliases: [], icon: null },
    ],
    floors: [
      { floor_id: 'ground', name: 'Ground floor', level: 0, icon: null },
      { floor_id: 'first', name: 'First floor', level: 1, icon: null },
    ],
    devices: [
      {
        id: 'dev_lamp',
        name: 'Lamp plug',
        name_by_user: null,
        area_id: 'living_room',
        manufacturer: 'Acme',
        model: 'P1',
        labels: [],
        disabled_by: null,
      },
      {
        id: 'dev_lock',
        name: 'Door lock',
        name_by_user: null,
        area_id: 'hall',
        manufacturer: 'Acme',
        model: 'L1',
        labels: ['security'],
        disabled_by: null,
      },
    ],
    entities: [
      {
        entity_id: 'light.living_ceiling',
        area_id: 'living_room',
        device_id: null,
        labels: [],
        name: null,
        platform: 'hue',
        disabled_by: null,
        hidden_by: null,
        entity_category: null,
      },
      {
        entity_id: 'light.living_lamp',
        area_id: null,
        device_id: 'dev_lamp',
        labels: ['favorite'],
        name: null,
        platform: 'hue',
        disabled_by: null,
        hidden_by: null,
        entity_category: null,
      },
      {
        entity_id: 'sensor.living_lamp_power',
        area_id: null,
        device_id: 'dev_lamp',
        labels: [],
        name: null,
        platform: 'hue',
        disabled_by: null,
        hidden_by: null,
        entity_category: 'diagnostic',
      },
      {
        entity_id: 'light.bedroom',
        area_id: 'bedroom',
        device_id: null,
        labels: [],
        name: null,
        platform: 'hue',
        disabled_by: null,
        hidden_by: null,
        entity_category: null,
      },
      {
        entity_id: 'switch.coffee',
        area_id: 'kitchen',
        device_id: null,
        labels: ['favorite'],
        name: null,
        platform: 'tuya',
        disabled_by: null,
        hidden_by: null,
        entity_category: null,
      },
      {
        entity_id: 'lock.front_door',
        area_id: null,
        device_id: 'dev_lock',
        labels: [],
        name: null,
        platform: 'zwave',
        disabled_by: null,
        hidden_by: null,
        entity_category: null,
      },
      {
        entity_id: 'climate.living',
        area_id: 'living_room',
        device_id: null,
        labels: [],
        name: null,
        platform: 'ecobee',
        disabled_by: null,
        hidden_by: null,
        entity_category: null,
      },
      {
        entity_id: 'sensor.living_temperature',
        area_id: 'living_room',
        device_id: null,
        labels: [],
        name: null,
        platform: 'ecobee',
        disabled_by: null,
        hidden_by: null,
        entity_category: null,
      },
      {
        entity_id: 'binary_sensor.hall_motion',
        area_id: 'hall',
        device_id: null,
        labels: [],
        name: null,
        platform: 'zha',
        disabled_by: null,
        hidden_by: null,
        entity_category: null,
      },
    ],
    labels: [
      { label_id: 'favorite', name: 'Favorite', color: 'yellow', icon: null },
      { label_id: 'security', name: 'Security', color: 'red', icon: null },
      { label_id: 'quiet', name: 'Quiet', color: null, icon: null },
    ],
    services: {
      light: {
        turn_on: {
          fields: {
            brightness: { selector: { number: { min: 0, max: 255 } } },
            brightness_pct: { selector: { number: { min: 0, max: 100 } } },
          },
          target: { entity: [{ domain: ['light'] }] },
        },
        turn_off: { fields: {}, target: { entity: [{ domain: ['light'] }] } },
        toggle: { fields: {}, target: { entity: [{ domain: ['light'] }] } },
      },
      switch: {
        turn_on: { fields: {}, target: { entity: [{ domain: ['switch'] }] } },
        turn_off: { fields: {}, target: { entity: [{ domain: ['switch'] }] } },
      },
      lock: {
        lock: { fields: {}, target: { entity: [{ domain: ['lock'] }] } },
        unlock: { fields: { code: { selector: { text: {} } } }, target: { entity: [{ domain: ['lock'] }] } },
      },
      climate: {
        set_temperature: {
          fields: { temperature: { required: true, selector: { number: { min: 5, max: 35 } } } },
          target: { entity: [{ domain: ['climate'] }] },
        },
      },
      homeassistant: {
        turn_off: { fields: {}, target: { entity: [{}] } },
      },
      script: {
        good_night: { fields: {} },
        turn_on: { fields: {}, target: { entity: [{ domain: ['script'] }] } },
      },
      notify: {
        notify: {
          fields: { message: { required: true, selector: { text: {} } }, title: { selector: { text: {} } } },
        },
      },
      weather: {
        get_forecasts: {
          fields: { type: { required: true } },
          target: { entity: [{ domain: ['weather'] }] },
          response: { optional: false },
        },
      },
    } as Record<string, Record<string, unknown>>,
  };
}

interface Sub {
  socket: WebSocket;
  id: number;
  kind: 'events' | 'trigger' | 'template';
  eventType?: string;
}

export class FakeHa {
  readonly home = defaultHome();
  readonly calls: Array<{
    domain: string;
    service: string;
    service_data: Record<string, unknown>;
    target?: unknown;
  }> = [];
  readonly sockets = new Set<WebSocket>();
  private subs: Sub[] = [];
  private server!: Server;
  private wss!: WebSocketServer;
  url = '';
  rejectAuth = false;

  async start(port = 0): Promise<this> {
    this.server = createServer((req, res) => {
      if (req.headers.authorization !== `Bearer ${FAKE_TOKEN}`) {
        res.writeHead(401).end();
        return;
      }
      if (req.url?.startsWith('/api/camera_proxy/')) {
        res.writeHead(200, { 'content-type': 'image/jpeg' }).end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
        return;
      }
      res.writeHead(404).end();
    });
    this.wss = new WebSocketServer({ server: this.server, path: '/api/websocket' });
    this.wss.on('connection', (ws) => this.onConnection(ws));
    await new Promise<void>((r) => this.server.listen(port, '127.0.0.1', () => r()));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  async stop(): Promise<void> {
    for (const s of this.sockets) s.terminate();
    await new Promise<void>((r) => this.wss.close(() => r()));
    await new Promise<void>((r) => this.server.close(() => r()));
  }

  /** Drop all connections (simulate HA restart). */
  dropConnections(): void {
    for (const s of this.sockets) s.terminate();
  }

  state(id: string): FakeState | undefined {
    return this.home.states.find((s) => s.entity_id === id);
  }

  /** Change a state as if a human did it in the HA UI. */
  humanSet(entityId: string, state: string, attributes?: Record<string, unknown>): void {
    this.setState(entityId, state, attributes, { id: randomUUID(), user_id: HUMAN_USER_ID, parent_id: null });
  }

  setState(
    entityId: string,
    state: string,
    attributes: Record<string, unknown> | undefined,
    context: FakeState['context'],
  ): void {
    const old = this.state(entityId);
    const next: FakeState = {
      entity_id: entityId,
      state,
      attributes: { ...(old?.attributes ?? {}), ...(attributes ?? {}) },
      last_changed: old && old.state === state ? old.last_changed : now(),
      last_updated: now(),
      context,
    };
    this.home.states = [...this.home.states.filter((s) => s.entity_id !== entityId), next];
    this.fireEvent(
      'state_changed',
      { entity_id: entityId, old_state: old ?? null, new_state: next },
      context,
    );
  }

  fireEvent(
    eventType: string,
    data: Record<string, unknown>,
    context: FakeState['context'] = { id: randomUUID(), user_id: null, parent_id: null },
  ): void {
    const event = { event_type: eventType, data, origin: 'LOCAL', time_fired: now(), context };
    for (const sub of this.subs) {
      if (sub.kind === 'events' && (sub.eventType === eventType || sub.eventType === undefined)) {
        sub.socket.send(JSON.stringify({ id: sub.id, type: 'event', event }));
      }
    }
  }

  /** Fire every trigger subscription with the given variables. */
  fireTrigger(variables: Record<string, unknown>): void {
    for (const sub of this.subs) {
      if (sub.kind === 'trigger')
        sub.socket.send(JSON.stringify({ id: sub.id, type: 'event', event: { variables } }));
    }
  }

  private onConnection(ws: WebSocket): void {
    this.sockets.add(ws);
    ws.on('close', () => {
      this.sockets.delete(ws);
      this.subs = this.subs.filter((s) => s.socket !== ws);
    });
    let authed = false;
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.10.0' }));
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (!authed) {
        if (msg.type === 'auth' && msg.access_token === FAKE_TOKEN && !this.rejectAuth) {
          authed = true;
          ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.10.0' }));
        } else {
          ws.send(JSON.stringify({ type: 'auth_invalid', message: 'Invalid access token' }));
          ws.close();
        }
        return;
      }
      this.handle(ws, msg);
    });
  }

  private result(ws: WebSocket, id: number, result: unknown): void {
    ws.send(JSON.stringify({ id, type: 'result', success: true, result }));
  }

  private error(ws: WebSocket, id: number, code: string, message: string): void {
    ws.send(JSON.stringify({ id, type: 'result', success: false, error: { code, message } }));
  }

  private handle(ws: WebSocket, msg: { id: number; type: string; [k: string]: any }): void {
    const h = this.home;
    switch (msg.type) {
      case 'supported_features':
        return this.result(ws, msg.id, null);
      case 'ping':
        return void ws.send(JSON.stringify({ id: msg.id, type: 'pong' }));
      case 'get_config':
        return this.result(ws, msg.id, {
          location_name: 'Test Home',
          time_zone: 'Asia/Shanghai',
          language: 'en',
          version: '2026.10.0',
          unit_system: { temperature: '°C' },
          components: ['light', 'switch', 'lock', 'climate'],
          state: 'RUNNING',
        });
      case 'auth/current_user':
        return this.result(ws, msg.id, { id: FAKE_USER_ID, name: 'Cangze', is_admin: true, is_owner: false });
      case 'get_states':
        return this.result(ws, msg.id, h.states);
      case 'get_services':
        return this.result(ws, msg.id, h.services);
      case 'config/area_registry/list':
        return this.result(ws, msg.id, h.areas);
      case 'config/floor_registry/list':
        return this.result(ws, msg.id, h.floors);
      case 'config/device_registry/list':
        return this.result(ws, msg.id, h.devices);
      case 'config/entity_registry/list':
        return this.result(ws, msg.id, h.entities);
      case 'config/label_registry/list':
        return this.result(ws, msg.id, h.labels);
      case 'subscribe_events':
        this.subs.push({ socket: ws, id: msg.id, kind: 'events', eventType: msg.event_type });
        return this.result(ws, msg.id, null);
      case 'subscribe_trigger':
        this.subs.push({ socket: ws, id: msg.id, kind: 'trigger' });
        return this.result(ws, msg.id, null);
      case 'unsubscribe_events':
        this.subs = this.subs.filter((s) => !(s.socket === ws && s.id === msg.subscription));
        return this.result(ws, msg.id, null);
      case 'render_template': {
        this.result(ws, msg.id, null);
        const tpl = String(msg.template);
        const m = tpl.match(/states\(['"]([^'"]+)['"]\)/);
        const out = m ? (this.state(m[1]!)?.state ?? 'unknown') : tpl.includes('{{') ? 'rendered' : tpl;
        if (tpl.includes('error')) {
          ws.send(
            JSON.stringify({
              id: msg.id,
              type: 'event',
              event: { error: 'TemplateError: boom', level: 'ERROR' },
            }),
          );
        } else {
          ws.send(JSON.stringify({ id: msg.id, type: 'event', event: { result: out, listeners: {} } }));
        }
        return;
      }
      case 'history/history_during_period': {
        const out: Record<string, unknown[]> = {};
        for (const id of msg.entity_ids as string[]) {
          const s = this.state(id);
          if (s) out[id] = [{ s: s.state, lu: Date.parse(s.last_updated) / 1000 }];
        }
        return this.result(ws, msg.id, out);
      }
      case 'call_service':
        return this.callService(ws, msg as never);
      default:
        return this.error(ws, msg.id, 'unknown_command', `Unknown command ${msg.type}`);
    }
  }

  private callService(
    ws: WebSocket,
    msg: {
      id: number;
      domain: string;
      service: string;
      service_data?: Record<string, unknown>;
      target?: { entity_id?: string[] };
      return_response?: boolean;
    },
  ) {
    const domainServices = this.home.services[msg.domain] as Record<string, unknown> | undefined;
    if (!domainServices?.[msg.service]) {
      return this.error(ws, msg.id, 'not_found', `Service ${msg.domain}.${msg.service} not found.`);
    }
    this.calls.push({
      domain: msg.domain,
      service: msg.service,
      service_data: msg.service_data ?? {},
      target: msg.target,
    });
    const context = { id: randomUUID(), user_id: FAKE_USER_ID, parent_id: null };
    const ids = msg.target?.entity_id ?? [];
    for (const id of ids) {
      const data = msg.service_data ?? {};
      if (msg.service === 'turn_on')
        this.setState(
          id,
          'on',
          data.brightness !== undefined ? { brightness: data.brightness } : undefined,
          context,
        );
      else if (msg.service === 'turn_off') this.setState(id, 'off', undefined, context);
      else if (msg.service === 'toggle')
        this.setState(id, this.state(id)?.state === 'on' ? 'off' : 'on', undefined, context);
      else if (msg.service === 'lock') this.setState(id, 'locked', undefined, context);
      else if (msg.service === 'unlock') this.setState(id, 'unlocked', undefined, context);
      else if (msg.service === 'set_temperature')
        this.setState(id, this.state(id)?.state ?? 'heat', { temperature: data.temperature }, context);
    }
    return this.result(ws, msg.id, { context, ...(msg.return_response ? { response: { ok: true } } : {}) });
  }
}

export async function waitFor(pred: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}
