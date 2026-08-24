import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { UserModel, IUser } from '../../models/User.js';
import { env } from '../../config/env.js';
import { isDbConnected } from '../../config/db.js';
import { logger } from '../../config/logger.js';

export interface TokenPayload {
  userId: string;
  email: string;
  name: string;
}

export class AuthService {
  async register(email: string, password: string, name: string): Promise<{ token: string; user: { id: string; email: string; name: string } }> {
    if (!isDbConnected()) {
      throw new Error('Database is offline. Anonymous demo mode is active.');
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await UserModel.findOne({ email: cleanEmail });
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await UserModel.create({
      email: cleanEmail,
      passwordHash,
      name: name.trim(),
    });

    const token = (jwt as any).sign(
      { userId: user._id.toString(), email: user.email, name: user.name },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    return {
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
      },
    };
  }

  async login(email: string, password: string): Promise<{ token: string; user: { id: string; email: string; name: string } }> {
    if (!isDbConnected()) {
      throw new Error('Database is offline. Anonymous demo mode is active.');
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await UserModel.findOne({ email: cleanEmail });
    if (!user) {
      throw new Error('Invalid email or password.');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid email or password.');
    }

    const token = (jwt as any).sign(
      { userId: user._id.toString(), email: user.email, name: user.name },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    return {
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
      },
    };
  }

  verifyToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    } catch {
      return null;
    }
  }

  createAnonymousSession(): string {
    return `sess_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
  }
}

export const authService = new AuthService();
