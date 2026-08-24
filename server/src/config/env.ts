import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/unthinkable_summarizer'),
  JWT_SECRET: z.string().min(16).default('unthinkable_super_secret_jwt_key_min_32_chars_long_12345'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ANONYMOUS_SESSION_TTL_HOURS: z.coerce.number().default(24),
  MAX_FILE_SIZE_MB: z.coerce.number().default(25),
  MAX_FILES_PER_REQUEST: z.coerce.number().default(5),
  UPLOAD_TEMP_DIR: z.string().default('uploads/temp'),
  MAX_CONCURRENT_DOCUMENTS: z.coerce.number().default(2),
  MAX_CONCURRENT_AI_REQUESTS: z.coerce.number().default(1),

  // Document Extraction Configuration
  EXTRACTION_PROVIDER: z.enum(['llmwhisperer', 'local', 'auto']).default('auto'),
  LLMWHISPERER_API_KEY: z.string().optional().default(''),
  LLMWHISPERER_BASE_URL: z.string().default('https://llmwhisperer-api.us-central.unstract.com/api/v2'),
  LLMWHISPERER_TIMEOUT_MS: z.coerce.number().default(120000),
  LLMWHISPERER_MAX_RETRIES: z.coerce.number().default(1),
  LLMWHISPERER_MAX_CONCURRENT: z.coerce.number().default(2),
  LLMWHISPERER_POLL_INTERVAL_MS: z.coerce.number().default(2000),
  EXTRACTION_CACHE_MAX_ENTRIES: z.coerce.number().default(100),
  EXTRACTION_CACHE_TTL_HOURS: z.coerce.number().default(24),

  // AI Summarization & Q&A
  AI_PROVIDER: z.enum(['deterministic', 'openai-compatible']).default('deterministic'),
  AI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  AI_API_KEY: z.string().optional().default(''),
  AI_MODEL: z.string().default('gpt-4o-mini'),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().default(25000),
  AI_MAX_RETRIES: z.coerce.number().default(2),

  // Local OCR Provider (Fallback)
  OCR_PROVIDER: z.enum(['tesseract']).default('tesseract'),
  OCR_CONFIDENCE_THRESHOLD: z.coerce.number().default(60),
  OCR_ENABLE_HANDWRITING_ENHANCEMENT: z.coerce.boolean().default(true),

  // Internal Cron Scheduler
  CRON_ENABLED: z.coerce.boolean().default(true),
  CRON_CLEANUP_INTERVAL_MINUTES: z.coerce.number().default(30),
  CRON_HEARTBEAT_INTERVAL_MINUTES: z.coerce.number().default(15),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parsedEnv.error.format(), null, 2));
  throw new Error('Invalid environment configuration');
}

export const env = parsedEnv.data;
