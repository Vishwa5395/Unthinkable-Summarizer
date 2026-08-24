import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { cronSchedulerService } from '../src/services/cron/CronSchedulerService.js';
import { createApp } from '../src/app.js';

describe('Internal Cron Scheduler & Monitoring Suite', () => {
  const app = createApp();

  it('should initialize and register all 4 internal cron tasks', () => {
    const status = cronSchedulerService.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.tasks.length).toBe(4);

    const taskNames = status.tasks.map((t) => t.name);
    expect(taskNames).toContain('file_session_cleanup');
    expect(taskNames).toContain('extraction_cache_prune');
    expect(taskNames).toContain('queue_stalled_jobs_recovery');
    expect(taskNames).toContain('system_metrics_heartbeat');
  });

  it('should successfully execute file and session cleanup task on demand', async () => {
    const summary = await cronSchedulerService.triggerTask('file_session_cleanup');
    expect(summary).toBeDefined();
    expect(summary).toContain('expired');

    const status = cronSchedulerService.getStatus();
    const task = status.tasks.find((t) => t.name === 'file_session_cleanup');
    expect(task?.lastStatus).toBe('SUCCESS');
    expect(task?.totalRuns).toBeGreaterThan(0);
    expect(task?.lastRunAt).toBeDefined();
  });

  it('should successfully execute extraction cache pruning task on demand', async () => {
    const summary = await cronSchedulerService.triggerTask('extraction_cache_prune');
    expect(summary).toContain('Extraction cache');

    const status = cronSchedulerService.getStatus();
    const task = status.tasks.find((t) => t.name === 'extraction_cache_prune');
    expect(task?.lastStatus).toBe('SUCCESS');
  });

  it('should successfully execute queue stalled jobs recovery task', async () => {
    const summary = await cronSchedulerService.triggerTask('queue_stalled_jobs_recovery');
    expect(summary).toContain('stalled job(s)');
  });

  it('should successfully execute system heartbeat task', async () => {
    const summary = await cronSchedulerService.triggerTask('system_metrics_heartbeat');
    expect(summary).toContain('System Heartbeat');
    expect(summary).toContain('Heap');
  });

  it('should expose GET /api/health/cron monitoring endpoint', async () => {
    const res = await request(app).get('/api/health/cron');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tasks).toBeDefined();
    expect(res.body.data.tasks.length).toBe(4);
  });

  it('should expose POST /api/health/cron/run to trigger manual tasks', async () => {
    const res = await request(app)
      .post('/api/health/cron/run')
      .send({ task: 'file_session_cleanup' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.task).toBe('file_session_cleanup');
    expect(res.body.data.summary).toBeDefined();
  });

  it('should return 400 when triggering with an invalid task name', async () => {
    const res = await request(app)
      .post('/api/health/cron/run')
      .send({ task: 'non_existent_task' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CRON_TRIGGER_FAILED');
  });
});
