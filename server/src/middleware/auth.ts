import { Request, Response, NextFunction } from 'express';
import { authService, TokenPayload } from '../services/auth/AuthService.js';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  sessionId?: string;
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const sessionHeader = req.headers['x-session-id'] as string;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = authService.verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }

  req.sessionId = sessionHeader || (req.user ? `user_${req.user.userId}` : authService.createAnonymousSession());
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication is required for this action. Please sign in or register.',
      },
    });
    return;
  }

  const token = authHeader.substring(7);
  const decoded = authService.verifyToken(token);

  if (!decoded) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Your session has expired or the token is invalid. Please sign in again.',
      },
    });
    return;
  }

  req.user = decoded;
  req.sessionId = `user_${decoded.userId}`;
  next();
}
