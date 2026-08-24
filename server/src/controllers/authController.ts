import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth/AuthService.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { isDbConnected } from '../config/db.js';

const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters long.'),
  name: z.string().min(2, 'Name must be at least 2 characters long.'),
});

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validated = registerSchema.parse(req.body);
    const result = await authService.register(validated.email, validated.password, validated.name);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validated = loginSchema.parse(req.body);
    const result = await authService.login(validated.email, validated.password);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      res.json({
        success: true,
        data: {
          authenticated: false,
          user: null,
          sessionId: req.sessionId,
          dbConnected: isDbConnected(),
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        authenticated: true,
        user: req.user,
        sessionId: req.sessionId,
        dbConnected: isDbConnected(),
      },
    });
  } catch (error) {
    next(error);
  }
}
