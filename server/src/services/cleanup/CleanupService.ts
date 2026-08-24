import fs from 'fs/promises';
import path from 'path';
import { env } from '../../config/env.js';
import { memoryStore } from '../../models/MemoryStore.js';
import { logger } from '../../config/logger.js';

export class CleanupService {
  private timer: NodeJS.Timeout | null = null;

  start(intervalMs: number = 60 * 60 * 1000): void {
    if (this.timer) return;

    logger.info('Cleanup service worker started (hourly cycle)');
    this.timer = setInterval(() => {
      this.runCleanup();
    }, intervalMs);
  }

  async runCleanup(): Promise<void> {
    try {
      // 1. Prune expired memory store sessions
      const prunedSessions = memoryStore.pruneExpired();

      // 2. Prune old temporary files in uploads directory
      const tempDir = path.resolve(process.cwd(), env.UPLOAD_TEMP_DIR);
      let deletedFiles = 0;

      try {
        const files = await fs.readdir(tempDir);
        const maxAgeMs = env.ANONYMOUS_SESSION_TTL_HOURS * 60 * 60 * 1000;
        const now = Date.now();

        for (const file of files) {
          const filePath = path.join(tempDir, file);
          const stat = await fs.stat(filePath);
          if (now - stat.mtimeMs > maxAgeMs) {
            await fs.unlink(filePath);
            deletedFiles++;
          }
        }
      } catch (dirErr: any) {
        if (dirErr.code !== 'ENOENT') {
          logger.warn({ dirErr }, 'Cleanup file scan warning');
        }
      }

      if (prunedSessions > 0 || deletedFiles > 0) {
        logger.info({ prunedSessions, deletedFiles }, 'Cleanup cycle completed');
      }
    } catch (error) {
      logger.error({ error }, 'Error during scheduled cleanup');
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Cleanup service stopped');
    }
  }
}

export const cleanupService = new CleanupService();
