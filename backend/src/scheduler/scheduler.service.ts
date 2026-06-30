import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { WorkflowEngine } from '../workflow/workflow.engine';
import { SchedulerRepository } from './scheduler.repository';
import {
  SchedulerRunDto,
  SchedulerStatusDto,
  SchedulerTrigger,
} from './scheduler.types';

/**
 * Scheduler & Automation Engine — decides WHEN workflow actions run.
 *
 * On a configurable interval it finds due (overdue, pending) activities and
 * drives each through the EXISTING Workflow Rules Engine using the event's
 * "no response" system outcome. The engine (unchanged) then applies the
 * configured action — retry per retry_config, reschedule, or escalate. The
 * scheduler therefore adds timing/automation without duplicating any workflow or
 * retry logic. Each cycle is recorded as a lightweight run log.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private static readonly INTERVAL_NAME = 'dinc-scheduler';

  private enabled = true;
  private intervalMs = 60_000;
  private batchLimit = 200;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
    private readonly repo: SchedulerRepository,
    private readonly engine: WorkflowEngine,
  ) {}

  onModuleInit(): void {
    this.enabled = (this.config.get<string>('SCHEDULER_ENABLED') ?? 'true') !== 'false';
    this.intervalMs = Number(this.config.get<string>('SCHEDULER_INTERVAL_MS')) || 60_000;
    this.batchLimit = Number(this.config.get<string>('SCHEDULER_BATCH_LIMIT')) || 200;

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
   * Runs one scheduler cycle: processes all due activities through the engine and
   * records the run. Guards against overlapping cycles (a long run won't stack).
   */
  async runCycle(trigger: SchedulerTrigger): Promise<SchedulerRunDto> {
    if (this.running) {
      this.logger.warn('Scheduler cycle skipped — previous cycle still running.');
      const last = await this.repo.recentRuns(1);
      return last[0] ?? SchedulerService.emptyRun(trigger);
    }
    this.running = true;
    const startedAt = new Date();
    let rulesProcessed = 0;
    let activitiesCreated = 0;
    let retries = 0;
    let escalations = 0;
    let failures = 0;
    const errors: string[] = [];

    let due: Awaited<ReturnType<SchedulerRepository['findDueActivities']>> = [];
    try {
      due = await this.repo.findDueActivities(this.batchLimit);
      for (const item of due) {
        try {
          const outcome = await this.repo.findNoResponseOutcome(item.event_id);
          if (!outcome) {
            failures += 1;
            continue;
          }
          // Reuse the engine: it decides + executes the action for this outcome.
          const result = await this.engine.execute({
            activityId: item.activity_id,
            enrollmentId: item.enrollment_id,
            programId: item.program_id,
            diseaseId: item.disease_id,
            eventId: item.event_id,
            outcomeTypeId: outcome.id,
            outcomeCategory: outcome.category,
            recordedBy: 'SYSTEM_SCHEDULER',
          });
          rulesProcessed += 1;
          if (result.nextActivityId) activitiesCreated += 1;
          if (result.action === 'RETRY_ACTIVITY') retries += 1;
          if (result.escalated) escalations += 1;
        } catch (error) {
          failures += 1;
          if (errors.length < 5) errors.push((error as Error).message);
        }
      }
    } catch (error) {
      failures += 1;
      errors.push((error as Error).message);
    } finally {
      this.running = false;
    }

    const run = await this.repo.insertRun({
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      trigger,
      dueFound: due.length,
      rulesProcessed,
      activitiesCreated,
      retries,
      escalations,
      failures,
      error: errors.length ? errors.join(' | ') : null,
    });
    this.logger.log(
      `Scheduler ${trigger} cycle: ${run.dueFound} due, ${run.rulesProcessed} processed, ` +
        `${run.retries} retries, ${run.escalations} escalations, ${run.failures} failures.`,
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
