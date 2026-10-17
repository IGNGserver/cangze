import { join } from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyWebsocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { createApp } from './app.ts';
import type { AppConfig } from './core/config.ts';
import { loadMasterKey, SecretBox } from './core/crypto.ts';
import { EventBus } from './core/events.ts';
import type { HubEvents } from './core/hub-events.ts';
import { createLogger, LogRing } from './core/logger.ts';
import { migrate, openDatabase, type Db } from './db/index.ts';
import type { RouteSpec } from './http/route.ts';
import { AuditService, decisionForError } from './modules/audit/service.ts';
import { adminPrincipal, installAuth } from './modules/auth/hook.ts';
import { authRoutes } from './modules/auth/routes.ts';
import { AuthService } from './modules/auth/service.ts';
import { HaGateway } from './modules/ha/gateway.ts';
import { haRoutes } from './modules/ha/routes.ts';
import { networkRoutes } from './modules/network/routes.ts';
import { NetworkPolicy } from './modules/network/policy.ts';
import { SecretsService } from './modules/secrets/service.ts';
import { SettingsService } from './modules/settings/service.ts';
import { StreamHub } from './modules/stream/hub.ts';
import { registerStream } from './modules/stream/routes.ts';
import { systemRoutes } from './modules/system/routes.ts';

export interface Services {
  config: AppConfig;
  logger: Logger;
  ring: LogRing;
  db: Db;
  bus: EventBus<HubEvents>;
  settings: SettingsService;
  secrets: SecretsService;
  auth: AuthService;
  network: NetworkPolicy;
  stream: StreamHub;
  audit: AuditService;
  ha: HaGateway;
  startedAt: Date;
}

export interface CreateServicesOptions {
  /** Use an in-memory database and a fixed master key (tests, OpenAPI generation). */
  memory?: boolean;
  logger?: Logger;
  ring?: LogRing;
}

export function createServices(config: AppConfig, opts: CreateServicesOptions = {}): Services {
  const ring = opts.ring ?? new LogRing();
  const logger = opts.logger ?? createLogger(config.logLevel, ring);
  const db = openDatabase({ file: opts.memory ? ':memory:' : join(config.dataDir, 'cangze.db') });
  const applied = migrate(db);
  if (applied.length) logger.info({ module: 'db', applied }, 'database migrated');

  const master = opts.memory
    ? { key: Buffer.alloc(32, 7), source: 'env' as const }
    : loadMasterKey(join(config.dataDir, 'master.key'), config.masterKey);
  if (master.source === 'created') {
    logger.warn({ module: 'secrets' }, 'generated a new master key in the data directory');
  }

  const bus = new EventBus<HubEvents>();
  const settings = new SettingsService(db, bus);
  const secrets = new SecretsService(db, new SecretBox(master.key));
  const auth = new AuthService(db, settings, bus, logger.child({ module: 'auth' }), !opts.memory);
  const network = new NetworkPolicy(settings, {
    publicOrigin: config.publicOrigin,
    allowedHosts: config.allowedHosts,
  });
  const stream = new StreamHub(logger);
  const audit = new AuditService(db, stream);
  const ha = new HaGateway(settings, secrets, stream, bus, logger.child({ module: 'ha' }));

  // Every write to Home Assistant, allowed or not, lands in the audit log.
  ha.addWriteObserver((req, outcome) => {
    audit.record({
      principal: req.principal,
      action: `${req.kind === 'service' ? 'call_service' : 'ha_config'}:${req.domain}.${req.service}`,
      target: req.entityIds.join(',') || null,
      args: req.data,
      decision: outcome.ok ? 'allowed' : decisionForError(outcome.error.code),
      reason: outcome.ok ? null : outcome.error.message,
      result: outcome.ok ? (outcome.result.response ?? null) : null,
      haContextId: outcome.ok ? outcome.result.contextId : null,
      durationMs: outcome.durationMs,
    });
  });

  return {
    config,
    logger,
    ring,
    db,
    bus,
    settings,
    secrets,
    auth,
    network,
    stream,
    audit,
    ha,
    startedAt: new Date(),
  };
}

export function buildRouteSpecs(s: Services): RouteSpec[] {
  return [
    ...systemRoutes({
      startedAt: s.startedAt,
      readiness: { db: () => s.db.prepare('SELECT 1').get() !== undefined },
      setupRequired: () => s.auth.setupRequired,
    }),
    ...authRoutes(s.auth, () => s.config.publicOrigin ?? null),
    ...networkRoutes(s.network, {
      publicOrigin: s.config.publicOrigin,
      trustedProxies: s.config.trustedProxies,
    }),
    ...haRoutes(s.ha, s.secrets, (req) => adminPrincipal(req as never)),
  ];
}

export async function buildServer(s: Services, webDir?: string): Promise<FastifyInstance> {
  return createApp({
    logger: s.logger,
    webDir,
    trustProxy: s.config.trustedProxies.length ? s.config.trustedProxies : false,
    routes: buildRouteSpecs(s),
    plugins: [
      async (app) => {
        await app.register(fastifyCookie);
        await app.register(fastifyWebsocket, { options: { maxPayload: 1024 * 1024 } });
        s.network.install(app);
        installAuth(app, s.auth, s.network);
        registerStream(app, s.stream, s.network);
      },
    ],
  });
}

export function startServices(s: Services): void {
  s.auth.init();
  s.stream.start();
  s.ha.start();
}

export async function stopServices(s: Services): Promise<void> {
  await s.ha.stop();
  s.stream.stop();
  s.db.close();
}
