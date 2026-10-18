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
import { createAgentEvaluator } from './modules/agents/evaluator.ts';
import { agentRoutes } from './modules/agents/routes.ts';
import { RunsService } from './modules/agents/runs.ts';
import { AgentsService } from './modules/agents/service.ts';
import { agentManagementTools, memoryTools } from './modules/agents/tools.ts';
import { approvalRoutes } from './modules/approvals/routes.ts';
import { backupRoutes } from './modules/backup/routes.ts';
import { BackupService } from './modules/backup/service.ts';
import { ApprovalsService } from './modules/approvals/service.ts';
import { AuditService, decisionForError } from './modules/audit/service.ts';
import { adminPrincipal, installAuth } from './modules/auth/hook.ts';
import { authRoutes } from './modules/auth/routes.ts';
import { AuthService } from './modules/auth/service.ts';
import { ConversationStore } from './modules/conversations/store.ts';
import { CoordinationService } from './modules/coordination/service.ts';
import { AgentRunner } from './modules/engine/runner.ts';
import { HaGateway } from './modules/ha/gateway.ts';
import { logRoutes } from './modules/logs/routes.ts';
import { MaintenanceService } from './modules/maintenance/service.ts';
import { haRoutes } from './modules/ha/routes.ts';
import { networkRoutes } from './modules/network/routes.ts';
import { NetworkPolicy } from './modules/network/policy.ts';
import { notificationRoutes } from './modules/notifications/routes.ts';
import { NotificationsService } from './modules/notifications/service.ts';
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
import { Scheduler } from './modules/scheduler/service.ts';
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
  notifications: NotificationsService;
  coordination: CoordinationService;
  agents: AgentsService;
  runs: RunsService;
  scheduler: Scheduler;
  backup: BackupService;
  maintenance: MaintenanceService;
  masterKey: Buffer;
  startedAt: Date;
}

export interface CreateServicesOptions {
  /** Use an in-memory database and a fixed master key (tests, OpenAPI generation). */
  memory?: boolean;
  logger?: Logger;
  ring?: LogRing;
  /** Called when a restore was staged; production restarts the process. */
  onRestartRequested?: () => void;
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
  // Guard order: conflicts first (cheap, no human involved), then permissions and approvals.
  const coordination = new CoordinationService(settings, ha, bus);
  coordination.install();
  policy.install();
  const notifications = new NotificationsService(db, stream);
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
  const agents = new AgentsService(db, conversations, tools, providers, stream);
  const runs = new RunsService(
    db,
    agents,
    conversations,
    runner,
    providers,
    ha,
    tools,
    approvals,
    sessions,
    notifications,
    usage,
    stream,
    settings,
    logger.child({ module: 'runs' }),
  );
  runs.setExtraTools((agentId) => memoryTools(agents, agentId));
  tools.register(agentManagementTools(agents, runs, () => tools));
  policy.setAgentEvaluator(createAgentEvaluator(agents, policy, ha));
  coordination.setAgentInfo((p) => {
    try {
      const def = agents.definition(p.agentId, p.revision);
      return {
        priority: def.priority,
        respectManualMinutes: def.respectManualMinutes,
        chainDepth: runs.chainDepth(p.runId),
      };
    } catch {
      return null;
    }
  });
  const scheduler = new Scheduler(
    db,
    agents,
    runs,
    ha,
    coordination,
    bus,
    logger.child({ module: 'scheduler' }),
  );
  const backup = new BackupService(
    db,
    config.dataDir,
    master.key,
    settings,
    secrets,
    ha,
    notifications,
    logger.child({ module: 'backup' }),
    opts.onRestartRequested ?? (() => logger.warn('restart requested but no supervisor hook installed')),
  );
  const maintenance = new MaintenanceService(db, settings, ha, logger.child({ module: 'maintenance' }));
  // Schedules follow the home's time zone, which is known once Home Assistant is connected.
  bus.on('ha.ready', () => {
    backup.arm();
    maintenance.rearm();
  });
  sessions.addPromptSections(() => {
    const rows = agents.rows();
    if (!rows.length) {
      return [
        {
          title: 'Subagents',
          body: 'None yet. You can create persistent background agents with agent_create when the user wants something watched or done on a schedule.',
        },
      ];
    }
    const lines = rows.map((r) => {
      const def = agents.definition(r.id);
      return `- ${r.name} (id ${r.id}, slug ${r.slug}, ${r.enabled ? 'enabled' : 'disabled'}, revision ${r.current_revision}): ${def.description || def.instructions.slice(0, 120)}`;
    });
    return [
      {
        title: 'Subagents',
        body: `${lines.join('\n')}\nManage them with the agent_* tools; dispatch work with agent_run.`,
      },
    ];
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
    approvals,
    policy,
    providers,
    conversations,
    tools,
    usage,
    runner,
    sessions,
    notifications,
    coordination,
    agents,
    runs,
    scheduler,
    backup,
    maintenance,
    masterKey: master.key,
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
    ...agentRoutes(s.agents, s.runs, s.scheduler, s.usage, s.ha),
    ...notificationRoutes(s.notifications),
    ...backupRoutes(s.backup, s.secrets),
    ...logRoutes(s.ring, s.audit, s.usage, s.db, s.maintenance),
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
  s.runs.start();
  s.scheduler.start();
  s.providers.warmUp();
  s.backup.start();
  s.maintenance.start();
}

export async function stopServices(s: Services): Promise<void> {
  s.backup.stop();
  s.maintenance.stop();
  s.scheduler.stop();
  s.runs.stop();
  s.sessions.abortAll();
  await s.ha.stop();
  s.stream.stop();
  s.db.close();
}
