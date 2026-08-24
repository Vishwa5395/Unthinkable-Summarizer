import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

let isConnected = false;

export async function connectDB(): Promise<boolean> {
  if (isConnected) return true;

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });

    isConnected = true;
    logger.info({ uri: env.MONGODB_URI.replace(/\/\/.*@/, '//***:***@') }, 'Connected to MongoDB successfully');

    mongoose.connection.on('error', (err) => {
      logger.error({ err }, 'MongoDB connection runtime error');
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB connection lost. Reconnecting...');
      isConnected = false;
    });

    return true;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : 'Unknown DB error' },
      'MongoDB connection failed. Continuing in resilient memory-backed session mode.'
    );
    isConnected = false;
    return false;
  }
}

export function isDbConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

export async function disconnectDB(): Promise<void> {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('Disconnected from MongoDB');
  }
}
