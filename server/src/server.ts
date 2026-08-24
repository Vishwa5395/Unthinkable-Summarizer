import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDB, disconnectDB } from './config/db.js';
import { cleanupService } from './services/cleanup/CleanupService.js';

async function bootstrap(): Promise<void> {
  // Connect to Database (gracefully non-blocking)
  await connectDB();

  // Start temporary file & session cleanup worker
  cleanupService.start();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        mode: env.NODE_ENV,
        aiProvider: env.AI_PROVIDER,
        ocrProvider: env.OCR_PROVIDER,
      },
      `⚡ Unthinkable Summarizer Server running at http://localhost:${env.PORT}`
    );
  });

  // Graceful Shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Gracefully shutting down server...');
    cleanupService.stop();
    server.close(async () => {
      await disconnectDB();
      logger.info('Server closed successfully. Exiting.');
      process.exit(0);
    });

    // Force exit if hanging
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal bootstrap failure');
  process.exit(1);
});
