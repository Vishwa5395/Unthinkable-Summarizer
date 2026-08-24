import fs from 'fs/promises';
import path from 'path';
import { env } from '../../config/env.js';
import { memoryStore } from '../../models/MemoryStore.js';
import { extractionCache } from '../../providers/extraction/ExtractionCache.js';
import { processingQueue } from '../queue/ProcessingQueue.js';
import { logger } from '../../config/logger.js';

export interface CronTaskStatus {
  name: string;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastStatus: 'SUCCESS' | 'FAILED' | 'IDLE' | 'RUNNING';
  totalRuns: number;
  errorCount: number;
  lastSummary: string | null;
  lastError: string | null;
}

export class CronSchedulerService {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private runningFlags: Map<string, boolean> = new Map();
  private metrics: Map<string, CronTaskStatus> = new Map();
  private isStarted: boolean = false;

  constructor() {
    this.initTaskRegistry();
  }

  private initTaskRegistry(): void {
    const defaultTasks = [
      {
        name: 'file_session_cleanup',
        intervalMinutes: env.CRON_CLEANUP_INTERVAL_MINUTES || 30,
      },
      {
        name: 'extraction_cache_prune',
        intervalMinutes: 60,
      },
      {
        name: 'queue_stalled_jobs_recovery',
        intervalMinutes: 10,
      },
      {
        name: 'system_metrics_heartbeat',
        intervalMinutes: env.CRON_HEARTBEAT_INTERVAL_MINUTES || 15,
      },
    ];

    for (const t of defaultTasks) {
      this.metrics.set(t.name, {
        name: t.name,
        intervalMinutes: t.intervalMinutes,
        lastRunAt: null,
        lastDurationMs: null,
        lastStatus: 'IDLE',
        totalRuns: 0,
        errorCount: 0,
        lastSummary: null,
        lastError: null,
      });
      this.runningFlags.set(t.name, false);
    }
  }

  public start(): void {
    if (this.isStarted || !env.CRON_ENABLED) {
      if (!env.CRON_ENABLED) {
        logger.info('Internal cron scheduler is disabled via CRON_ENABLED=false');
      }
      return;
    }

    this.isStarted = true;
    logger.info('Starting internal cron scheduler service');

    // 1. Schedule File & Session Cleanup
    this.scheduleTask('file_session_cleanup', env.CRON_CLEANUP_INTERVAL_MINUTES * 60 * 1000, () =>
      this.runFileAndSessionCleanup()
    );

    // 2. Schedule Extraction Cache Pruning
    this.scheduleTask('extraction_cache_prune', 60 * 60 * 1000, () =>
      this.runExtractionCachePruning()
    );

    // 3. Schedule Queue Stalled Jobs Recovery
    this.scheduleTask('queue_stalled_jobs_recovery', 10 * 60 * 1000, () =>
      this.runQueueStalledJobRecovery()
    );

    // 4. Schedule System Metrics Heartbeat
    this.scheduleTask('system_metrics_heartbeat', env.CRON_HEARTBEAT_INTERVAL_MINUTES * 60 * 1000, () =>
      this.runSystemHeartbeat()
    );

    // Run an initial quick cleanup after 10 seconds of startup
    setTimeout(() => {
      this.runFileAndSessionCleanup().catch((err) =>
        logger.warn({ err }, 'Initial cron startup cleanup warning')
      );
    }, 10000);
  }

  private scheduleTask(name: string, intervalMs: number, taskFn: () => Promise<string>): void {
    const timer = setInterval(async () => {
      await this.executeWithLock(name, taskFn);
    }, intervalMs);

    this.timers.set(name, timer);
  }

  public async triggerTask(name: string): Promise<string> {
    switch (name) {
      case 'file_session_cleanup':
        return await this.executeWithLock(name, () => this.runFileAndSessionCleanup());
      case 'extraction_cache_prune':
        return await this.executeWithLock(name, () => this.runExtractionCachePruning());
      case 'queue_stalled_jobs_recovery':
        return await this.executeWithLock(name, () => this.runQueueStalledJobRecovery());
      case 'system_metrics_heartbeat':
        return await this.executeWithLock(name, () => this.runSystemHeartbeat());
      default:
        throw new Error(`CRON_TASK_NOT_FOUND: Unknown cron task name '${name}'`);
    }
  }

  private async executeWithLock(name: string, taskFn: () => Promise<string>): Promise<string> {
    if (this.runningFlags.get(name)) {
      logger.warn({ task: name }, 'Cron task already running; skipping concurrent run');
      return 'SKIPPED_ALREADY_RUNNING';
    }

    this.runningFlags.set(name, true);
    const metric = this.metrics.get(name);
    if (metric) metric.lastStatus = 'RUNNING';

    const startTime = Date.now();

    try {
      const summary = await taskFn();
      const durationMs = Date.now() - startTime;

      if (metric) {
        metric.lastRunAt = new Date().toISOString();
        metric.lastDurationMs = durationMs;
        metric.lastStatus = 'SUCCESS';
        metric.totalRuns += 1;
        metric.lastSummary = summary;
        metric.lastError = null;
      }

      logger.info({ task: name, durationMs, summary }, 'Cron task completed successfully');
      return summary;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      if (metric) {
        metric.lastRunAt = new Date().toISOString();
        metric.lastDurationMs = durationMs;
        metric.lastStatus = 'FAILED';
        metric.totalRuns += 1;
        metric.errorCount += 1;
        metric.lastError = error?.message || 'Unknown error';
      }

      logger.error({ task: name, durationMs, error: error?.message }, 'Cron task failed');
      throw error;
    } finally {
      this.runningFlags.set(name, false);
    }
  }

  /**
   * Task 1: Purge expired memory sessions and orphaned temporary upload files
   */
  private async runFileAndSessionCleanup(): Promise<string> {
    // 1. Prune expired sessions in MemoryStore
    const prunedSessions = memoryStore.pruneExpired();

    // 2. Prune old temporary files in uploads directory
    const tempDir = path.resolve(process.cwd(), env.UPLOAD_TEMP_DIR);
    let deletedFiles = 0;
    let checkedFiles = 0;

    try {
      const files = await fs.readdir(tempDir);
      const maxAgeMs = env.ANONYMOUS_SESSION_TTL_HOURS * 60 * 60 * 1000;
      const now = Date.now();

      for (const file of files) {
        checkedFiles++;
        const filePath = path.join(tempDir, file);
        try {
          const stat = await fs.stat(filePath);
          if (now - stat.mtimeMs > maxAgeMs) {
            await fs.unlink(filePath);
            deletedFiles++;
          }
        } catch {
          // File might have already been cleaned
        }
      }
    } catch (dirErr: any) {
      if (dirErr.code !== 'ENOENT') {
        logger.warn({ dirErr }, 'Cleanup file scan directory warning');
      }
    }

    return `Pruned ${prunedSessions} expired session(s); deleted ${deletedFiles} / ${checkedFiles} expired temporary file(s).`;
  }

  /**
   * Task 2: Prune expired extraction caches
   */
  private async runExtractionCachePruning(): Promise<string> {
    const statsBefore = extractionCache.getStats();
    extractionCache.pruneExpired();
    const statsAfter = extractionCache.getStats();
    const pruned = statsBefore.entries - statsAfter.entries;
    return `Extraction cache pruned ${Math.max(0, pruned)} expired entry(ies). Total remaining: ${statsAfter.entries}.`;
  }

  /**
   * Task 3: Recover or fail stalled queue jobs
   */
  private async runQueueStalledJobRecovery(): Promise<string> {
    const queueJobs = processingQueue.getAllJobStatuses();
    let recoveredCount = 0;
    const now = Date.now();
    const maxProcessingDurationMs = 10 * 60 * 1000; // 10 minutes timeout

    for (const job of queueJobs) {
      if (
        job.status === 'EXTRACTING' ||
        job.status === 'OCR' ||
        job.status === 'VALIDATING' ||
        job.status === 'NORMALIZING' ||
        job.status === 'ANALYZING'
      ) {
        const jobAge = now - new Date(job.updatedAt).getTime();
        if (jobAge > maxProcessingDurationMs) {
          await processingQueue.updateJobState(
            job.documentId,
            'FAILED',
            'Processing timed out after 10 minutes during background analysis',
            100
          );
          recoveredCount++;
        }
      }
    }

    return `Checked ${queueJobs.length} queue job(s). Recovered/failed ${recoveredCount} stalled job(s).`;
  }

  /**
   * Task 4: System memory and activity metrics heartbeat
   */
  private async runSystemHeartbeat(): Promise<string> {
    const memUsage = process.memoryUsage();
    const heapUsedMb = (memUsage.heapUsed / (1024 * 1024)).toFixed(1);
    const rssMb = (memUsage.rss / (1024 * 1024)).toFixed(1);
    const docCount = memoryStore.getStats().totalDocuments;
    const sessionCount = memoryStore.getStats().totalSessions;
    const activeJobs = processingQueue.getActiveJobCount();

    const summary = `System Heartbeat: Heap ${heapUsedMb}MB, RSS ${rssMb}MB | Documents: ${docCount}, Sessions: ${sessionCount}, Active Queue Jobs: ${activeJobs}`;
    logger.info(summary);
    return summary;
  }

  public getStatus(): {
    isStarted: boolean;
    enabled: boolean;
    tasks: CronTaskStatus[];
  } {
    return {
      isStarted: this.isStarted,
      enabled: env.CRON_ENABLED,
      tasks: Array.from(this.metrics.values()),
    };
  }

  public stop(): void {
    for (const [name, timer] of this.timers.entries()) {
      clearInterval(timer);
      logger.info({ task: name }, 'Stopped cron task');
    }
    this.timers.clear();
    this.isStarted = false;
    logger.info('Internal cron scheduler service stopped');
  }
}

export const cronSchedulerService = new CronSchedulerService();
