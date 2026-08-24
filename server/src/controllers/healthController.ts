import { Request, Response } from 'express';
import { isDbConnected } from '../config/db.js';
import { env } from '../config/env.js';
import { ExtractionProviderFactory } from '../providers/extraction/ExtractionProviderFactory.js';

export function getHealth(_req: Request, res: Response): void {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: isDbConnected() ? 'connected' : 'memory-resilient-mode',
      documentExtractionProvider: ExtractionProviderFactory.getActiveProviderName(),
      extractionConfigured: ExtractionProviderFactory.isPrimaryConfigured(),
      aiMode: env.AI_PROVIDER,
      aiModel: env.AI_MODEL,
      ocrProvider: env.OCR_PROVIDER,
      maxFileSizeMb: env.MAX_FILE_SIZE_MB,
      maxFilesPerRequest: env.MAX_FILES_PER_REQUEST,
    },
  });
}
