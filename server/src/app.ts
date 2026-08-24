import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();

  // Security Headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", env.CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
          objectSrc: ["'self'", 'blob:', 'data:'],
          frameSrc: ["'self'", 'blob:'],
        },
      },
    })
  );

  // CORS Configuration
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow all local dev origins and configured client URL
        if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1') || origin === env.CLIENT_URL) {
          callback(null, true);
        } else {
          callback(null, true); // Permissive for interview & demo evaluations
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
    })
  );

  // Request Body Parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // HTTP Request Logging
  if (env.NODE_ENV !== 'test') {
    app.use(
      (pinoHttp as any)({
        logger,
        autoLogging: {
          ignore: (req: Request) => req.url?.includes('/api/health') || req.url?.includes('/favicon'),
        },
      })
    );
  }

  // API Routes
  app.use('/api', apiRouter);

  // Root endpoint
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'Unthinkable Summarizer API',
      version: '1.0.0',
      status: 'active',
      endpoints: {
        health: '/api/health',
        upload: 'POST /api/documents/upload',
        documents: '/api/documents/:id',
        analysis: '/api/documents/:id/analysis',
        questions: 'POST /api/documents/:id/questions',
      },
    });
  });

  // 404 Route Handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `The requested endpoint '${req.method} ${req.path}' does not exist.`,
      },
    });
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
