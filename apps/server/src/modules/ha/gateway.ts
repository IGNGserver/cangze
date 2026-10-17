import type {
  HaArea,
  HaDevice,
  HaEntityState,
  HaFloor,
  HaLabel,
  HaService,
  HaStateEvent,
  HaStatus,
  HaTarget,
} from '@cangze/contracts';
import {
  createConnection,
  createLongLivedTokenAuth,
  ERR_INVALID_AUTH,
  type Connection,
  type HassEvent,
  type MessageBase,
} from 'home-assistant-js-websocket';
import type { Logger } from 'pino';
import { Agent, fetch as undiciFetch } from 'undici';
import { z } from 'zod';
import { AppError, unavailable } from '../../core/errors.ts';
import type { EventBus } from '../../core/events.ts';
import type { HubEvents } from '../../core/hub-events.ts';
import { principalId, type Principal } from '../../core/principal.ts';
import type { SecretsService } from '../secrets/service.ts';
import type { SettingsService } from '../settings/service.ts';
import type { StreamHub } from '../stream/hub.ts';
import { domainOf, HaRegistry, type EntityRegistryEntry } from './registry.ts';
import { socketFactory, toWsUrl } from './socket.ts';

const HaConnectionSetting = z
  .object({ url: z.string(), tokenSecretId: z.string(), verifyTls: z.boolean().default(true) })
  .nullable()
  .default(null);

export interface ServiceCallInput {
  domain: string;
  service: string;
  target?: HaTarget;
  data?: Record<string, unknown>;
  returnResponse?: boolean;
}

/** A write about to be sent to HA, after target expansion. Guards may reject it by throwing. */
export interface WriteRequest {
  principal: Principal;
  kind: 'service' | 'config';
  domain: string;
  service: string;
  /** Concrete entities the call can affect (empty for target-less services). */
  entityIds: string[];
  data: Record<string, unknown>;
  /** Short human readable description for audit and approvals. */
  summary: string;
}

export interface WriteResult {
  entityIds: string[];
  contextId: string | null;
  response?: unknown;
}

export type WriteGuard = (req: WriteRequest) => Promise<void> | void;
export type WriteObserver = (
  req: WriteRequest,
  outcome:
    | { ok: true; result: WriteResult; durationMs: number }
    | { ok: false; error: AppError; durationMs: number },
) => void;

const TARGET_KEYS = ['entity_id', 'device_id', 'area_id', 'floor_id', 'label_id'] as const;

/**
 * The only module that talks to Home Assistant. Keeps the connection alive, mirrors states and
 * registries, fans out events, and funnels every write through guards (policy, coordination) and
 * observers (audit, coordination bookkeeping).
 */
export class HaGateway {
  readonly registry = new HaRegistry();
  readonly connection;
  private conn: Connection | null = null;
  private status: HaStatus = {
    state: 'unconfigured',
    url: null,
    error: null,
    haVersion: null,
    locationName: null,
    timeZone: null,
    language: null,
    user: null,
    entityCount: 0,
    connectedAt: null,
    verifyTls: true,
  };
  private services: Record<string, Record<string, RawService>> = {};
  private readonly guards: WriteGuard[] = [];
  private readonly observers: WriteObserver[] = [];
  private readonly eventListeners = new Map<string, Set<(ev: HassEvent) => void>>();
  private readonly eventUnsubs = new Map<string, () => Promise<void>>();
  private pendingStates = new Map<string, HaStateEvent>();
  private flushTimer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryDelay = 2000;
  private generation = 0;
  private haUserId: string | null = null;
  private dispatcher: Agent | null = null;

  constructor(
    settings: SettingsService,
    private readonly secrets: SecretsService,
    private readonly stream: StreamHub,
    private readonly bus: EventBus<HubEvents>,
    private readonly logger: Logger,
  ) {
    this.connection = settings.define('ha.connection', HaConnectionSetting);
  }

  // ---------------------------------------------------------------- lifecycle

  getStatus(): HaStatus {
    return { ...this.status, entityCount: this.registry.states.size };
  }

  get connected(): boolean {
    return this.status.state === 'connected' && this.conn !== null;
  }

  /** User id of the HA account Cangze connects as; used to tell Cangze's own writes from humans'. */
  get ownUserId(): string | null {
    return this.haUserId;
  }

  get isHaAdmin(): boolean {
    return this.status.user?.isAdmin ?? false;
  }

  start(): void {
    void this.connect();
  }

  async stop(): Promise<void> {
    this.generation++;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.conn?.close();
    this.conn = null;
    await this.dispatcher?.close().catch(() => undefined);
    this.dispatcher = null;
  }

  async configure(input: { url: string; token?: string; verifyTls: boolean }): Promise<HaStatus> {
    const url = normalizeUrl(input.url);
    const current = this.connection.get();
    let tokenSecretId = current?.tokenSecretId;
    if (input.token) tokenSecretId = this.secrets.put('ha_token', input.token, tokenSecretId);
    if (!tokenSecretId) throw new AppError(400, 'token_required', 'A long-lived access token is required');
    this.connection.set({ url, tokenSecretId, verifyTls: input.verifyTls });
    await this.stop();
    await this.connect();
    return this.getStatus();
  }

  async clear(): Promise<void> {
    const current = this.connection.get();
    await this.stop();
    this.secrets.delete(current?.tokenSecretId);
    this.connection.set(null);
    this.registry.setStates([]);
    this.setStatus({
      state: 'unconfigured',
      url: null,
      error: null,
      user: null,
      haVersion: null,
      connectedAt: null,
    });
  }

  /** Connects with the given parameters without persisting anything. */
  async test(input: { url: string; token?: string; verifyTls: boolean }) {
    const url = normalizeUrl(input.url);
    const token = input.token ?? this.secrets.reveal(this.connection.get()?.tokenSecretId);
    if (!token)
      return {
        ok: false,
        error: 'A long-lived access token is required',
        haVersion: null,
        locationName: null,
        user: null,
      };
    let conn: Connection | null = null;
    try {
      conn = await createConnection({
        auth: createLongLivedTokenAuth(url, token),
        createSocket: socketFactory({ wsUrl: toWsUrl(url), token, verifyTls: input.verifyTls }),
        setupRetry: 0,
      });
      const [config, user] = await Promise.all([
        conn.sendMessagePromise<{ version: string; location_name: string }>({ type: 'get_config' }),
        conn.sendMessagePromise<{ name: string; is_admin: boolean }>({ type: 'auth/current_user' }),
      ]);
      return {
        ok: true,
        error: null,
        haVersion: config.version,
        locationName: config.location_name,
        user: { name: user.name, isAdmin: user.is_admin },
      };
    } catch (err) {
      return { ok: false, error: describeError(err), haVersion: null, locationName: null, user: null };
    } finally {
      conn?.close();
    }
  }

  private setStatus(patch: Partial<HaStatus>): void {
    this.status = { ...this.status, ...patch };
    this.stream.publish('ha:status', this.getStatus());
    this.bus.emit('ha.status', { state: this.status.state });
  }

  private scheduleRetry(gen: number): void {
    if (gen !== this.generation) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 60_000);
    this.retryTimer = setTimeout(() => void this.connect(), delay);
    this.retryTimer.unref();
  }

  private async connect(): Promise<void> {
    const cfg = this.connection.get();
    const gen = ++this.generation;
    if (!cfg) {
      this.setStatus({ state: 'unconfigured', url: null });
      return;
    }
    const token = this.secrets.reveal(cfg.tokenSecretId);
    if (!token) {
      this.setStatus({ state: 'error', url: cfg.url, error: 'Stored token is missing' });
      return;
    }
    this.dispatcher = cfg.verifyTls ? null : new Agent({ connect: { rejectUnauthorized: false } });
    this.setStatus({ state: 'connecting', url: cfg.url, error: null, verifyTls: cfg.verifyTls });
    try {
      const conn = await createConnection({
        auth: createLongLivedTokenAuth(cfg.url, token),
        createSocket: socketFactory({ wsUrl: toWsUrl(cfg.url), token, verifyTls: cfg.verifyTls }),
        setupRetry: 0,
      });
      if (gen !== this.generation) {
        conn.close();
        return;
      }
      this.conn = conn;
      this.retryDelay = 2000;
      conn.addEventListener('disconnected', () => {
        if (gen !== this.generation) return;
        this.logger.warn({ module: 'ha' }, 'connection lost, reconnecting');
        this.setStatus({ state: 'disconnected' });
      });
      conn.addEventListener('ready', () => {
        if (gen !== this.generation) return;
        this.logger.info({ module: 'ha' }, 'reconnected');
        void this.loadAll(gen).then(() => this.setStatus({ state: 'connected', error: null }));
      });
      conn.addEventListener('reconnect-error', (_c, err) => {
        if (gen !== this.generation) return;
        if (err === ERR_INVALID_AUTH)
          this.setStatus({ state: 'auth_invalid', error: 'Home Assistant rejected the token' });
      });
      await conn.subscribeEvents<HassEvent>((ev) => this.onStateChanged(ev), 'state_changed');
      for (const type of [
        'area_registry_updated',
        'device_registry_updated',
        'entity_registry_updated',
        'floor_registry_updated',
        'label_registry_updated',
        'service_registered',
        'service_removed',
      ]) {
        await conn.subscribeEvents(() => this.scheduleRefresh(gen), type);
      }
      // re-establish event subscriptions requested by triggers before (re)connect
      for (const type of this.eventListeners.keys()) await this.ensureEventSubscription(type);
      await this.loadAll(gen);
      this.setStatus({
        state: 'connected',
        error: null,
        haVersion: conn.haVersion,
        connectedAt: new Date().toISOString(),
      });
      this.logger.info(
        { module: 'ha', version: conn.haVersion, entities: this.registry.states.size },
        'connected to Home Assistant',
      );
    } catch (err) {
      if (gen !== this.generation) return;
      const invalid = err === ERR_INVALID_AUTH;
      this.setStatus({ state: invalid ? 'auth_invalid' : 'error', error: describeError(err) });
      this.logger.warn({ module: 'ha', error: describeError(err) }, 'cannot connect to Home Assistant');
      if (!invalid) this.scheduleRetry(gen);
    }
  }

  private scheduleRefresh(gen: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.loadRegistries(gen), 1000);
    this.refreshTimer.unref();
  }

  private async loadAll(gen: number): Promise<void> {
    const conn = this.conn;
    if (!conn || gen !== this.generation) return;
    const [config, user, states] = await Promise.all([
      conn.sendMessagePromise<{
        location_name: string;
        time_zone: string;
        language: string;
        version: string;
      }>({
        type: 'get_config',
      }),
      conn.sendMessagePromise<{ id: string; name: string; is_admin: boolean }>({ type: 'auth/current_user' }),
      conn.sendMessagePromise<HaEntityState[]>({ type: 'get_states' }),
    ]);
    this.haUserId = user.id;
    this.registry.setStates(states);
    this.status = {
      ...this.status,
      locationName: config.location_name,
      timeZone: config.time_zone,
      language: config.language ?? null,
      haVersion: config.version,
      user: { id: user.id, name: user.name, isAdmin: user.is_admin },
    };
    await this.loadRegistries(gen);
    this.bus.emit('ha.ready', { timeZone: config.time_zone });
  }

  private async loadRegistries(gen: number): Promise<void> {
    const conn = this.conn;
    if (!conn || gen !== this.generation) return;
    const safe = <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
    const [areas, floors, devices, entities, labels, services] = await Promise.all([
      safe(conn.sendMessagePromise<RawArea[]>({ type: 'config/area_registry/list' }), []),
      safe(conn.sendMessagePromise<RawFloor[]>({ type: 'config/floor_registry/list' }), []),
      safe(conn.sendMessagePromise<RawDevice[]>({ type: 'config/device_registry/list' }), []),
      safe(conn.sendMessagePromise<RawEntity[]>({ type: 'config/entity_registry/list' }), []),
      safe(conn.sendMessagePromise<RawLabel[]>({ type: 'config/label_registry/list' }), []),
      safe(conn.sendMessagePromise<Record<string, Record<string, RawService>>>({ type: 'get_services' }), {}),
    ]);
    this.registry.setAreas(
      areas.map((a) => ({
        area_id: a.area_id,
        name: a.name,
        floor_id: a.floor_id ?? null,
        icon: a.icon ?? null,
        labels: a.labels ?? [],
        aliases: a.aliases ?? [],
      })),
    );
    this.registry.setFloors(
      floors.map((f) => ({
        floor_id: f.floor_id,
        name: f.name,
        level: f.level ?? null,
        icon: f.icon ?? null,
      })),
    );
    this.registry.setDevices(
      devices.map((d) => ({
        id: d.id,
        name: d.name ?? null,
        name_by_user: d.name_by_user ?? null,
        area_id: d.area_id ?? null,
        manufacturer: d.manufacturer ?? null,
        model: d.model ?? null,
        labels: d.labels ?? [],
        disabled_by: d.disabled_by ?? null,
      })),
    );
    this.registry.setEntities(
      entities.map((e): EntityRegistryEntry => ({
        entity_id: e.entity_id,
        name: e.name ?? null,
        original_name: e.original_name ?? null,
        device_id: e.device_id ?? null,
        area_id: e.area_id ?? null,
        platform: e.platform ?? null,
        labels: e.labels ?? [],
        disabled_by: e.disabled_by ?? null,
        hidden_by: e.hidden_by ?? null,
        entity_category: e.entity_category ?? null,
      })),
    );
    this.registry.setLabels(
      labels.map((l) => ({
        label_id: l.label_id,
        name: l.name,
        color: l.color ?? null,
        icon: l.icon ?? null,
      })),
    );
    this.services = services;
  }

  private requireConn(): Connection {
    if (!this.conn || this.status.state !== 'connected') {
      throw unavailable('Home Assistant is not connected', 'ha_unavailable');
    }
    return this.conn;
  }

  // ---------------------------------------------------------------- events

  private onStateChanged(ev: HassEvent): void {
    const data = ev.data as {
      entity_id: string;
      new_state: HaEntityState | null;
      old_state: HaEntityState | null;
    };
    if (data.new_state) this.registry.states.set(data.entity_id, data.new_state);
    else this.registry.states.delete(data.entity_id);
    this.bus.emit('ha.state_changed', {
      entityId: data.entity_id,
      oldState: data.old_state,
      newState: data.new_state,
      context: ev.context,
      timeFired: ev.time_fired,
    });
    this.pendingStates.set(data.entity_id, {
      entity_id: data.entity_id,
      state: data.new_state?.state ?? null,
      attributes: data.new_state?.attributes ?? null,
      last_changed: data.new_state?.last_changed ?? null,
      last_updated: data.new_state?.last_updated ?? null,
    });
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushStates(), 250);
      this.flushTimer.unref();
    }
    const listeners = this.eventListeners.get('state_changed');
    if (listeners) for (const l of listeners) l(ev);
  }

  private flushStates(): void {
    this.flushTimer = null;
    if (!this.pendingStates.size) return;
    const batch = [...this.pendingStates.values()];
    this.pendingStates = new Map();
    this.stream.publish('ha:states', { updates: batch });
  }

  /** Listen to an HA event type (shared subscription per type). Returns an unsubscribe function. */
  onEvent(eventType: string, listener: (ev: HassEvent) => void): () => void {
    let set = this.eventListeners.get(eventType);
    if (!set) {
      set = new Set();
      this.eventListeners.set(eventType, set);
      if (this.conn) void this.ensureEventSubscription(eventType);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) {
        this.eventListeners.delete(eventType);
        const unsub = this.eventUnsubs.get(eventType);
        this.eventUnsubs.delete(eventType);
        void unsub?.().catch(() => undefined);
      }
    };
  }

  private async ensureEventSubscription(eventType: string): Promise<void> {
    if (eventType === 'state_changed' || this.eventUnsubs.has(eventType) || !this.conn) return;
    try {
      const unsub = await this.conn.subscribeEvents<HassEvent>((ev) => {
        for (const l of this.eventListeners.get(eventType) ?? []) l(ev);
      }, eventType);
      this.eventUnsubs.set(eventType, unsub);
    } catch (err) {
      this.logger.warn({ module: 'ha', eventType, error: describeError(err) }, 'event subscription failed');
    }
  }

  /** Subscribe to an HA trigger (any trigger platform). The callback receives `variables.trigger`. */
  async subscribeTrigger(
    trigger: unknown,
    cb: (variables: Record<string, unknown>) => void,
  ): Promise<() => Promise<void>> {
    const conn = this.requireConn();
    return conn.subscribeMessage<{ variables: Record<string, unknown> }>((msg) => cb(msg.variables ?? {}), {
      type: 'subscribe_trigger',
      trigger,
    });
  }

  // ---------------------------------------------------------------- reads

  listServices(domain?: string): HaService[] {
    const out: HaService[] = [];
    for (const [d, services] of Object.entries(this.services)) {
      if (domain && d !== domain) continue;
      for (const [name, svc] of Object.entries(services)) out.push(toService(d, name, svc));
    }
    return out.sort((a, b) => `${a.domain}.${a.service}`.localeCompare(`${b.domain}.${b.service}`));
  }

  getService(domain: string, service: string): HaService | null {
    const svc = this.services[domain]?.[service];
    return svc ? toService(domain, service, svc) : null;
  }

  /** Raw read-only WebSocket command (history, logbook, statistics, todo, …). Not for writes. */
  async query<T>(message: MessageBase): Promise<T> {
    if (WRITE_COMMANDS.some((p) => message.type.startsWith(p))) {
      throw new AppError(500, 'internal', `query() must not be used for write command ${message.type}`);
    }
    return this.requireConn().sendMessagePromise<T>(message);
  }

  async history(entityIds: string[], start: Date, end: Date, withAttributes = false) {
    const res = await this.query<
      Record<string, Array<{ s: string; lu: number; lc?: number; a?: Record<string, unknown> }>>
    >({
      type: 'history/history_during_period',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      entity_ids: entityIds,
      minimal_response: !withAttributes,
      no_attributes: !withAttributes,
      significant_changes_only: false,
    });
    const out: Record<string, Array<{ t: number; s: string; a?: Record<string, unknown> }>> = {};
    for (const [id, points] of Object.entries(res)) {
      out[id] = points.map((p) => ({
        t: Math.round((p.lu ?? p.lc ?? 0) * 1000),
        s: p.s,
        ...(p.a ? { a: p.a } : {}),
      }));
    }
    return out;
  }

  async renderTemplate(template: string, timeoutSec = 5): Promise<string> {
    const conn = this.requireConn();
    return new Promise((resolve, reject) => {
      let unsub: (() => Promise<void>) | null = null;
      let done = false;
      const timer = setTimeout(
        () => finish(new AppError(504, 'ha_timeout', 'Template rendering timed out')),
        timeoutSec * 1000 + 1000,
      );
      const finish = (err: Error | null, value?: string) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        void unsub?.().catch(() => undefined);
        if (err) reject(err);
        else resolve(value ?? '');
      };
      conn
        .subscribeMessage<{ result?: unknown; error?: string }>(
          (msg) => {
            if (msg.error) finish(new AppError(400, 'template_error', msg.error));
            else finish(null, typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result));
          },
          { type: 'render_template', template, report_errors: true, timeout: timeoutSec },
          { resubscribe: false },
        )
        .then((u) => {
          unsub = u;
          if (done) void u().catch(() => undefined);
        })
        .catch((err: unknown) => finish(new AppError(400, 'template_error', describeError(err))));
    });
  }

  /** Authenticated REST request against HA (camera snapshots, calendars, config API). */
  async rest(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<Response> {
    const cfg = this.connection.get();
    const token = this.secrets.reveal(cfg?.tokenSecretId);
    if (!cfg || !token) throw unavailable('Home Assistant is not configured', 'ha_unavailable');
    const url = new URL(path.replace(/^\//, ''), cfg.url.replace(/\/?$/, '/'));
    const res = await undiciFetch(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      dispatcher: this.dispatcher ?? undefined,
      signal: AbortSignal.timeout(20_000),
    });
    return res as unknown as Response;
  }

  // ---------------------------------------------------------------- writes

  addWriteGuard(guard: WriteGuard): void {
    this.guards.push(guard);
  }

  addWriteObserver(observer: WriteObserver): void {
    this.observers.push(observer);
  }

  /** Expand a call's target (including legacy target keys in data) to entity ids. */
  expandTarget(domain: string, target: HaTarget | undefined, data: Record<string, unknown> = {}) {
    const merged: HaTarget = { ...(target ?? {}) };
    const cleanData: Record<string, unknown> = { ...data };
    for (const key of TARGET_KEYS) {
      if (key in cleanData) {
        const extra = cleanData[key] as string | string[];
        const prev = merged[key];
        merged[key] = [
          ...(prev ? (Array.isArray(prev) ? prev : [prev]) : []),
          ...(Array.isArray(extra) ? extra : [extra]),
        ];
        delete cleanData[key];
      }
    }
    const hasTarget = TARGET_KEYS.some(
      (k) => merged[k] !== undefined && (!Array.isArray(merged[k]) || merged[k]!.length),
    );
    return { entityIds: this.registry.resolveTarget(merged, domain), hasTarget, data: cleanData };
  }

  /**
   * Call an HA service on behalf of a principal. The target is expanded, guards run on the
   * concrete entity list, and the call is sent with explicit `entity_id`s only.
   */
  async callService(principal: Principal, input: ServiceCallInput): Promise<WriteResult> {
    const { entityIds, hasTarget, data } = this.expandTarget(input.domain, input.target, input.data);
    if (hasTarget && entityIds.length === 0) {
      throw new AppError(400, 'empty_target', 'The target does not match any entity');
    }
    const req: WriteRequest = {
      principal,
      kind: 'service',
      domain: input.domain,
      service: input.service,
      entityIds,
      data,
      summary: `${input.domain}.${input.service}${entityIds.length ? ' → ' + summarizeIds(entityIds) : ''}`,
    };
    return this.runWrite(req, async () => {
      const conn = this.requireConn();
      const msg: MessageBase = {
        type: 'call_service',
        domain: input.domain,
        service: input.service,
        service_data: data,
        ...(hasTarget ? { target: { entity_id: entityIds } } : {}),
        ...(input.returnResponse ? { return_response: true } : {}),
      };
      const res = await conn.sendMessagePromise<{ context?: { id: string }; response?: unknown }>(msg);
      return { entityIds, contextId: res?.context?.id ?? null, response: res?.response };
    });
  }

  /**
   * Any other write (config API, helper creation, registry edits). `perform` runs only after all
   * guards accepted the request.
   */
  async configWrite<T>(
    principal: Principal,
    meta: {
      domain: string;
      action: string;
      entityIds?: string[];
      data?: Record<string, unknown>;
      summary: string;
    },
    perform: (ctx: { conn: Connection; rest: HaGateway['rest'] }) => Promise<T>,
  ): Promise<T> {
    const req: WriteRequest = {
      principal,
      kind: 'config',
      domain: meta.domain,
      service: meta.action,
      entityIds: meta.entityIds ?? [],
      data: meta.data ?? {},
      summary: meta.summary,
    };
    let value: T | undefined;
    await this.runWrite(req, async () => {
      value = await perform({ conn: this.requireConn(), rest: this.rest.bind(this) });
      return { entityIds: req.entityIds, contextId: null };
    });
    return value as T;
  }

  private async runWrite(req: WriteRequest, send: () => Promise<WriteResult>): Promise<WriteResult> {
    const started = Date.now();
    try {
      for (const guard of this.guards) await guard(req);
      const result = await send();
      for (const o of this.observers)
        safeObserve(o, req, { ok: true, result, durationMs: Date.now() - started }, this.logger);
      return result;
    } catch (err) {
      const error = toAppError(err);
      for (const o of this.observers)
        safeObserve(o, req, { ok: false, error, durationMs: Date.now() - started }, this.logger);
      this.logger.info(
        { module: 'ha', principal: principalId(req.principal), call: req.summary, code: error.code },
        'write rejected or failed',
      );
      throw error;
    }
  }
}

const WRITE_COMMANDS = [
  'call_service',
  'execute_script',
  'config/',
  'input_',
  'counter/',
  'timer/',
  'todo/item/create',
  'todo/item/update',
  'todo/item/delete',
  'todo/item/move',
  'fire_event',
  'conversation/process',
];

function safeObserve(
  o: WriteObserver,
  req: WriteRequest,
  outcome: Parameters<WriteObserver>[1],
  logger: Logger,
) {
  try {
    o(req, outcome);
  } catch (err) {
    logger.error({ module: 'ha', err }, 'write observer failed');
  }
}

function summarizeIds(ids: string[]): string {
  return ids.length <= 3 ? ids.join(', ') : `${ids.slice(0, 3).join(', ')} (+${ids.length - 3})`;
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    const e = err as { code: string | number; message: string };
    return new AppError(502, `ha_${String(e.code)}`, e.message);
  }
  return new AppError(502, 'ha_error', describeError(err));
}

export function describeError(err: unknown): string {
  if (err === ERR_INVALID_AUTH) return 'Home Assistant rejected the access token';
  if (err === 1) return 'Cannot connect to Home Assistant';
  if (err === 3) return 'Connection to Home Assistant was lost';
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err)
    return String((err as { message: unknown }).message);
  return String(err);
}

function normalizeUrl(url: string): string {
  const u = new URL(url.trim());
  if (u.protocol !== 'http:' && u.protocol !== 'https:')
    throw new AppError(400, 'bad_url', 'URL must start with http:// or https://');
  return u.origin + u.pathname.replace(/\/+$/, '');
}

interface RawService {
  name?: string;
  description?: string;
  target?: unknown;
  fields?: Record<
    string,
    {
      name?: string;
      description?: string;
      required?: boolean;
      example?: unknown;
      default?: unknown;
      selector?: Record<string, unknown>;
      advanced?: boolean;
      fields?: Record<string, unknown>;
    }
  >;
  response?: { optional: boolean };
}

function toService(domain: string, service: string, svc: RawService): HaService {
  const fields: HaService['fields'] = {};
  for (const [k, f] of Object.entries(svc.fields ?? {})) {
    // collapsed sections nest their fields
    if (f.fields && !f.selector) {
      for (const [k2, f2] of Object.entries(
        f.fields as Record<
          string,
          RawService['fields'] extends infer R ? (R extends Record<string, infer F> ? F : never) : never
        >,
      )) {
        fields[k2] = pickField(f2);
      }
      continue;
    }
    fields[k] = pickField(f);
  }
  return {
    domain,
    service,
    name: svc.name ?? null,
    description: svc.description ?? null,
    hasTarget: svc.target !== undefined && svc.target !== null,
    fields,
    response: svc.response ? (svc.response.optional ? 'optional' : 'only') : 'none',
  };
}

function pickField(f: {
  name?: string;
  description?: string;
  required?: boolean;
  example?: unknown;
  default?: unknown;
  selector?: Record<string, unknown>;
  advanced?: boolean;
}) {
  return {
    ...(f.name ? { name: f.name } : {}),
    ...(f.description ? { description: f.description } : {}),
    ...(f.required ? { required: true } : {}),
    ...(f.example !== undefined ? { example: f.example } : {}),
    ...(f.default !== undefined ? { default: f.default } : {}),
    ...(f.selector ? { selector: f.selector } : {}),
    ...(f.advanced ? { advanced: true } : {}),
  };
}

interface RawArea {
  area_id: string;
  name: string;
  floor_id?: string | null;
  icon?: string | null;
  labels?: string[];
  aliases?: string[];
}
interface RawFloor {
  floor_id: string;
  name: string;
  level?: number | null;
  icon?: string | null;
}
interface RawDevice {
  id: string;
  name?: string | null;
  name_by_user?: string | null;
  area_id?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  labels?: string[];
  disabled_by?: string | null;
}
interface RawEntity {
  entity_id: string;
  name?: string | null;
  original_name?: string | null;
  device_id?: string | null;
  area_id?: string | null;
  platform?: string | null;
  labels?: string[];
  disabled_by?: string | null;
  hidden_by?: string | null;
  entity_category?: string | null;
}
interface RawLabel {
  label_id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
}

export type { HaArea, HaDevice, HaFloor, HaLabel };
export { domainOf };
