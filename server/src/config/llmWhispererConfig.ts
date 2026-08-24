import { env } from './env.js';

export type LLMWhispererMode = 'native_text' | 'low_cost' | 'high_quality' | 'form' | 'table';
export type LLMWhispererOutputMode = 'layout_preserving' | 'text' | 'line-printer';

export interface LLMWhispererConfigOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  maxConcurrent: number;
  pollIntervalMs: number;
}

export class LLMWhispererConfig {
  static getOptions(): LLMWhispererConfigOptions {
    return {
      apiKey: env.LLMWHISPERER_API_KEY.trim(),
      baseUrl: env.LLMWHISPERER_BASE_URL.replace(/\/+$/, ''),
      timeoutMs: env.LLMWHISPERER_TIMEOUT_MS,
      maxRetries: env.LLMWHISPERER_MAX_RETRIES,
      maxConcurrent: env.LLMWHISPERER_MAX_CONCURRENT,
      pollIntervalMs: env.LLMWHISPERER_POLL_INTERVAL_MS,
    };
  }

  static isConfigured(): boolean {
    const key = env.LLMWHISPERER_API_KEY.trim();
    return key.length > 0 && !key.includes('your_') && !key.includes('placeholder');
  }

  static getBaseUrl(): string {
    return env.LLMWHISPERER_BASE_URL.replace(/\/+$/, '');
  }
}
