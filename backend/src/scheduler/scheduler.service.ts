import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SchedulerRepository } from './scheduler.repository';
import {
  SchedulerRunDto,
  SchedulerStatusDto,
  SchedulerTrigger,
} from './scheduler.types';

/**
 * Metadata-driven Scheduler Engine (Step 6B) — decides WHEN runtime work
 * materialises, reading only dinc_metadata.v_schedule_rule_effective.
 *
 * On a configurable interval it runs ONE transactional sweep (see
 * SchedulerRepository.runSweep): seeds newly satisfied schedule rules
 * (registration / birth-date / event-completion anchors, overrides and
 * HIGH_RISK contexts), continues RECURRING occurrence streams, and raises
 * follow-up tasks for overdue events via the programme's call-outcome rules.
 * Each cycle is recorded in the existing scheduler_runs log (see
 * scheduler.types.ts for the counter mapping).
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private static readonly INTERVAL_NAME = 'dinc-scheduler';

  private enabled = true;
  private intervalMs = 60_000;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
    private readonly repo: SchedulerRepository,
  ) {}

  onModuleInit(): void {
    this.enabled = (this.config.get<string>('SCHEDULER_ENABLED') ?? 'true') !== 'false';
    this.intervalMs = Number(this.config.get<string>('SCHEDULER_INTERVAL_MS')) || 60_000;

    if (!this.enabled) {
      this.logger.log('Scheduler disabled (SCHEDULER_ENABLED=false).');
      return;
    }
    const handle = setInterval(() => {
      void this.runCycle('AUTO');
    }, this.intervalMs);
    this.registry.addInterval(SchedulerService.INTERVAL_NAME, handle);
    this.logger.log(`Scheduler enabled — every ${this.intervalMs}ms.`);
  }

  onModuleDestroy(): void {
    if (this.registry.doesExist('interval', SchedulerService.INTERVAL_NAME)) {
      this.registry.deleteInterval(SchedulerService.INTERVAL_NAME);
    }
  }

  /**
   * Runs one scheduler cycle: a single transactional metadata-driven sweep,
   * then records the run. Guards against overlapping cycles. A sweep failure
   * rolls back everything it did and is recorded as a failed run.
   */
  async runCycle(trigger: SchedulerTrigger): Promise<SchedulerRunDto> {
    if (this.running) {
      this.logger.warn('Scheduler cycle skipped — previous cycle still running.');
      const last = await this.repo.recentRuns(1);
      return last[0] ?? SchedulerService.emptyRun(trigger);
    }
    this.running = true;
    const startedAt = new Date();

    let rulesEvaluated = 0;
    let seeded = 0;
    let recurring = 0;
    let overdueFound = 0;
    let followups = 0;
    let failures = 0;
    let error: string | null = null;

    try {
      const sweep = await this.repo.runSweep();
      rulesEvaluated = sweep.rulesEvaluated;
      seeded = sweep.seeded.length;
      recurring = sweep.recurring.length;
      overdueFound = sweep.overdueFound;
      followups = sweep.followupsCreated;
      for (const e of [...sweep.seeded, ...sweep.recurring]) {
        this.logger.log(
          `created ${e.eventCode} occurrence ${e.occurrence} due ${e.dueDate}` +
            (e.conditionContext ? ` [${e.conditionContext}]` : ''),
        );
      }
    } catch (err) {
      failures = 1;
      error = (err as Error).message;
      this.logger.error(`Sweep failed (rolled back): ${error}`);
    } finally {
      this.running = false;
    }

    const run = await this.repo.insertRun({
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      trigger,
      dueFound: overdueFound,
      rulesProcessed: rulesEvaluated,
      activitiesCreated: seeded,
      retries: recurring,
      escalations: followups,
      failures,
      error,
    });
    this.logger.log(
      `Scheduler ${trigger} cycle: ${rulesEvaluated} rules, ${seeded} seeded, ` +
        `${recurring} recurring, ${overdueFound} overdue, ${followups} follow-ups, ` +
        `${failures} failures.`,
    );
    return run;
  }

  async getStatus(): Promise<SchedulerStatusDto> {
    const [recentRuns, totals] = await Promise.all([
      this.repo.recentRuns(20),
      this.repo.totals(),
    ]);
    const lastRun = recentRuns[0] ?? null;
    const nextRunEstimate =
      this.enabled
        ? new Date(
            (lastRun ? new Date(lastRun.startedAt).getTime() : Date.now()) + this.intervalMs,
          ).toISOString()
        : null;
    return {
      enabled: this.enabled,
      intervalMs: this.intervalMs,
      lastRun,
      nextRunEstimate,
      recentRuns,
      totals,
    };
  }

  private static emptyRun(trigger: SchedulerTrigger): SchedulerRunDto {
    const now = new Date().toISOString();
    return {
      id: '',
      startedAt: now,
      finishedAt: now,
      trigger,
      dueFound: 0,
      rulesProcessed: 0,
      activitiesCreated: 0,
      retries: 0,
      escalations: 0,
      failures: 0,
      error: 'Skipped — a cycle was already running.',
    };
  }
}
