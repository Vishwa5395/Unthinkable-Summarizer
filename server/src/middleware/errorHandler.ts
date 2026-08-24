import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || (err instanceof ZodError ? 400 : 500);

  logger.error(
    {
      path: req.path,
      method: req.method,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    },
    'Handled API request error'
  );

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters provided.',
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  // User-friendly messages for upload/Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: `File exceeds the maximum upload size limit of ${process.env.MAX_FILE_SIZE_MB || 25} MB.`,
      },
    });
    return;
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    res.status(400).json({
      success: false,
      error: {
        code: 'TOO_MANY_FILES',
        message: `You can upload at most ${process.env.MAX_FILES_PER_REQUEST || 5} documents per batch.`,
      },
    });
    return;
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'PROCESSING_ERROR',
      message: err.message || 'An error occurred while processing the request.',
    },
  });
}
