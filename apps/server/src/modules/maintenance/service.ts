import { Cron } from 'croner';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Db } from '../../db/index.ts';
import type { HaGateway } from '../ha/gateway.ts';
import type { SettingsService } from '../settings/service.ts';

const RetentionSetting = z
  .object({
    auditDays: z.number().int().min(7).max(3650),
    runsDays: z.number().int().min(7).max(3650),
    usageDays: z.number().int().min(30).max(3650),
  })
  .default({ auditDays: 90, runsDays: 90, usageDays: 400 });

/** Daily housekeeping: retention for audit records, finished runs and usage, plus SQLite upkeep. */
export class MaintenanceService {
  readonly retention;
  private job: Cron | null = null;
  private active = false;

  constructor(
    private readonly db: Db,
    settings: SettingsService,
    private readonly ha: HaGateway,
    private readonly logger: Logger,
  ) {
    this.retention = settings.define('retention', RetentionSetting);
  }

  start(): void {
    this.active = true;
    this.job?.stop();
    this.job = new Cron(
      '15 4 * * *',
      { timezone: this.ha.getStatus().timeZone ?? undefined, protect: true },
      () => {
        this.run();
      },
    );
  }

  stop(): void {
    this.active = false;
    this.job?.stop();
  }

  /** Re-create the schedule (e.g. after the home's time zone became known). */
  rearm(): void {
    if (this.active) this.start();
  }

  run(now = Date.now()): { audit: number; runs: number; entries: number; usage: number } {
    const r = this.retention.get();
    const day = 86_400_000;
    const audit = this.db.prepare('DELETE FROM audit_log WHERE ts < ?').run(now - r.auditDays * day).changes;
    // Transcripts of old runs of isolated agents are their own branches and can go with the run.
    const oldRuns = this.db
      .prepare(
        "SELECT id FROM runs WHERE finished_at IS NOT NULL AND finished_at < ? AND status NOT IN ('queued', 'running', 'waiting_approval')",
      )
      .all(now - r.runsDays * day) as Array<{ id: string }>;
    let entries = 0;
    this.db.transaction(() => {
      for (const { id } of oldRuns) {
        const roots = this.db
          .prepare('SELECT COUNT(*) AS n FROM entries WHERE run_id = ? AND parent_id IS NULL')
          .get(id) as { n: number };
        if (roots.n > 0) entries += this.db.prepare('DELETE FROM entries WHERE run_id = ?').run(id).changes;
        this.db.prepare('DELETE FROM runs WHERE id = ?').run(id);
        this.db.prepare('DELETE FROM session_reports WHERE run_id = ? AND delivered_at IS NOT NULL').run(id);
      }
    })();
    const cutoffDay = new Date(now - r.usageDays * day).toISOString().slice(0, 10);
    const usage = this.db.prepare('DELETE FROM usage_ledger WHERE day < ?').run(cutoffDay).changes;
    this.db.pragma('optimize');
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    const result = { audit, runs: oldRuns.length, entries, usage };
    this.logger.info({ module: 'maintenance', ...result }, 'housekeeping done');
    return result;
  }
}
