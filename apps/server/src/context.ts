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
import { approvalRoutes } from './modules/approvals/routes.ts';
import { ApprovalsService } from './modules/approvals/service.ts';
import { AuditService, decisionForError } from './modules/audit/service.ts';
import { adminPrincipal, installAuth } from './modules/auth/hook.ts';
import { authRoutes } from './modules/auth/routes.ts';
import { AuthService } from './modules/auth/service.ts';
import { ConversationStore } from './modules/conversations/store.ts';
import { AgentRunner } from './modules/engine/runner.ts';
import { HaGateway } from './modules/ha/gateway.ts';
import { haRoutes } from './modules/ha/routes.ts';
import { networkRoutes } from './modules/network/routes.ts';
import { NetworkPolicy } from './modules/network/policy.ts';
import { PolicyEngine } from './modules/policy/engine.ts';
import { policyRoutes } from './modules/policy/routes.ts';
import { providerRoutes } from './modules/providers/routes.ts';
import { ProvidersService } from './modules/providers/service.ts';
import { SecretsService } from './modules/secrets/service.ts';
import { sessionRoutes } from './modules/sessions/routes.ts';
import { SessionsService } from './modules/sessions/service.ts';
import { SettingsService } from './modules/settings/service.ts';
import { StreamHub } from './modules/stream/hub.ts';
import { registerStream } from './modules/stream/routes.ts';
import { systemRoutes } from './modules/system/routes.ts';
import { haTools } from './modules/tools/ha-tools.ts';
import { ToolRegistry } from './modules/tools/registry.ts';
import { UsageLedger } from './modules/usage/ledger.ts';

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
  approvals: ApprovalsService;
  policy: PolicyEngine;
  providers: ProvidersService;
  conversations: ConversationStore;
  tools: ToolRegistry;
  usage: UsageLedger;
  runner: AgentRunner;
  sessions: SessionsService;
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

  const approvals = new ApprovalsService(db, stream);
  const policy = new PolicyEngine(settings, ha, approvals);
  policy.install();
  const providers = new ProvidersService(db, secrets, settings, logger.child({ module: 'providers' }));
  const conversations = new ConversationStore(db);
  const tools = new ToolRegistry();
  tools.register(haTools(ha));
  const usage = new UsageLedger(db);
  const runner = new AgentRunner(providers.models, conversations, stream, logger.child({ module: 'engine' }));
  const sessions = new SessionsService(
    db,
    conversations,
    runner,
    providers,
    ha,
    tools,
    approvals,
    stream,
    usage,
    logger.child({ module: 'sessions' }),
  );

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
    approvals,
    policy,
    providers,
    conversations,
    tools,
    usage,
    runner,
    sessions,
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
    ...providerRoutes(s.providers),
    ...sessionRoutes(s.sessions, s.tools),
    ...approvalRoutes(s.approvals),
    ...policyRoutes(s.policy),
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
  s.approvals.expireAbandoned();
  s.stream.start();
  s.ha.start();
}

export async function stopServices(s: Services): Promise<void> {
  s.sessions.abortAll();
  await s.ha.stop();
  s.stream.stop();
  s.db.close();
}
