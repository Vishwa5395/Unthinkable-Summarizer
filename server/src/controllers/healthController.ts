import { Request, Response } from 'express';
import { isDbConnected } from '../config/db.js';
import { env } from '../config/env.js';
import { ExtractionProviderFactory } from '../providers/extraction/ExtractionProviderFactory.js';
import { cronSchedulerService } from '../services/cron/CronSchedulerService.js';
import { memoryStore } from '../models/MemoryStore.js';
import { processingQueue } from '../services/queue/ProcessingQueue.js';

export function getHealth(_req: Request, res: Response): void {
  const memUsage = process.memoryUsage();

  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
      database: isDbConnected() ? 'connected' : 'memory-resilient-mode',
      documentExtractionProvider: ExtractionProviderFactory.getActiveProviderName(),
      extractionConfigured: ExtractionProviderFactory.isPrimaryConfigured(),
      aiMode: env.AI_PROVIDER,
      aiModel: env.AI_MODEL,
      ocrProvider: env.OCR_PROVIDER,
      cronEnabled: env.CRON_ENABLED,
      system: {
        heapUsedMb: (memUsage.heapUsed / (1024 * 1024)).toFixed(1),
        rssMb: (memUsage.rss / (1024 * 1024)).toFixed(1),
        documentsInStore: memoryStore.getStats().totalDocuments,
        sessionsInStore: memoryStore.getStats().totalSessions,
        activeProcessingJobs: processingQueue.getActiveJobCount(),
      },
    },
  });
}

export function getCronStatus(_req: Request, res: Response): void {
  res.json({
    success: true,
    data: cronSchedulerService.getStatus(),
  });
}

export async function triggerCronTask(req: Request, res: Response): Promise<void> {
  try {
    const task = (req.body?.task || req.query?.task || 'file_session_cleanup') as string;
    const summary = await cronSchedulerService.triggerTask(task);
    res.json({
      success: true,
      data: {
        task,
        summary,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CRON_TRIGGER_FAILED',
        message: error?.message || 'Failed to trigger cron task',
      },
    });
  }
}
