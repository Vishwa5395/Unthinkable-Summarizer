import { IAIProvider } from './AIProvider.js';
import { deterministicAIProvider } from './DeterministicAIProvider.js';
import { openAICompatibleProvider } from './OpenAICompatibleProvider.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export class AIProviderFactory {
  static getPrimaryProvider(): IAIProvider {
    if (env.AI_PROVIDER === 'openai-compatible') {
      return openAICompatibleProvider;
    }
    return deterministicAIProvider;
  }

  static getFallbackProvider(): IAIProvider {
    return deterministicAIProvider;
  }

  static async executeWithFallback<T>(
    operationName: string,
    operation: (provider: IAIProvider) => Promise<T>
  ): Promise<{ result: T; providerUsed: string; isFallback: boolean }> {
    const primary = this.getPrimaryProvider();

    if (primary.name !== 'deterministic') {
      try {
        const isAvail = await primary.isAvailable();
        if (isAvail) {
          const result = await operation(primary);
          return { result, providerUsed: primary.name, isFallback: false };
        }
      } catch (error: any) {
        logger.warn(
          { operationName, provider: primary.name, error: error?.message },
          'Primary AI provider failed. Executing graceful fallback to deterministic NLP engine.'
        );
      }
    }

    // Fallback to deterministic NLP
    const fallback = this.getFallbackProvider();
    const result = await operation(fallback);
    return { result, providerUsed: fallback.name, isFallback: primary.name !== 'deterministic' };
  }
}
