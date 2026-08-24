import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): Express {
  const app = express();

  // Security Headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", env.CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
          workerSrc: ["'self'", 'blob:', 'https://cdnjs.cloudflare.com'],
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
        if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1') || origin === env.CLIENT_URL) {
          callback(null, true);
        } else {
          callback(null, true); // Permissive for deployments & demos
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
    })
  );

  // Request Body Parsers
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

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

  // Static Client Hosting for Production / Docker Single-Container Deployment
  const candidateClientPaths = [
    path.resolve(process.cwd(), 'client/dist'),
    path.resolve(process.cwd(), '../client/dist'),
    path.resolve(__dirname, '../../client/dist'),
    path.resolve(__dirname, '../../../client/dist'),
  ];

  const clientDist = candidateClientPaths.find((p) => fs.existsSync(path.join(p, 'index.html')));

  if (clientDist) {
    logger.info({ clientDist }, 'Serving static client from production build');
    app.use(express.static(clientDist));

    // Client-side SPA fallback (excluding /api routes)
    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    // Development fallback root endpoint
    app.get('/', (_req: Request, res: Response) => {
      res.json({
        name: 'Unthinkable Summarizer API',
        version: '1.0.0',
        status: 'active',
        cron: '/api/health/cron',
        endpoints: {
          health: '/api/health',
          upload: 'POST /api/documents/upload',
          documents: '/api/documents/:id',
          analysis: '/api/documents/:id/analysis',
          questions: 'POST /api/documents/:id/questions',
        },
      });
    });
  }

  // 404 Route Handler for unmatched API routes
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
