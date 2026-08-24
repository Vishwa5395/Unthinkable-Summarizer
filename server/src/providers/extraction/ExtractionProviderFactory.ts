import { IDocumentExtractionProvider, ExtractionInput, ExtractionResult } from './DocumentExtractionProvider.js';
import { llmWhispererExtractionProvider, LLMWhispererExtractionProvider } from './LLMWhispererExtractionProvider.js';
import { localFallbackExtractionProvider, LocalFallbackExtractionProvider } from './LocalFallbackExtractionProvider.js';
import { extractionCache } from './ExtractionCache.js';
import { LLMWhispererConfig } from '../../config/llmWhispererConfig.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface ExtractionExecutionResult {
  result: ExtractionResult;
  providerUsed: string;
  isFallback: boolean;
  isCached: boolean;
}

export class ExtractionProviderFactory {
  private static primaryProvider: IDocumentExtractionProvider = llmWhispererExtractionProvider;
  private static fallbackProvider: IDocumentExtractionProvider = localFallbackExtractionProvider;

  static getActiveProviderName(): string {
    if (env.EXTRACTION_PROVIDER === 'local') {
      return 'LocalFallback';
    }
    if (LLMWhispererConfig.isConfigured()) {
      return 'LLMWhisperer';
    }
    return 'LocalFallback';
  }

  static isPrimaryConfigured(): boolean {
    return LLMWhispererConfig.isConfigured();
  }

  /**
   * Execute extraction with automatic caching, deduplication, and local fallback
   */
  static async extractWithFallback(
    input: ExtractionInput,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ExtractionExecutionResult> {
    const { fileHash, documentId, filename } = input;

    // 1. Check Extraction Cache (SHA-256 deduplication)
    const cached = extractionCache.get(fileHash);
    if (cached) {
      logger.info(
        { documentId, filename, fileHash: fileHash.substring(0, 12), provider: cached.providerUsed },
        'Returning cached document extraction result'
      );
      onProgress?.(100, 'Extraction loaded from session cache');
      return {
        result: cached,
        providerUsed: cached.providerUsed,
        isFallback: cached.providerUsed === 'local-fallback',
        isCached: true,
      };
    }

    // 2. Check if user explicitly configured local-only mode
    if (env.EXTRACTION_PROVIDER === 'local') {
      logger.info({ documentId }, 'EXTRACTION_PROVIDER=local explicitly set; using LocalFallback provider');
      const result = await this.fallbackProvider.extractDocument(input, onProgress);
      extractionCache.set(fileHash, result);
      return {
        result,
        providerUsed: this.fallbackProvider.name,
        isFallback: true,
        isCached: false,
      };
    }

    // 3. Attempt LLMWhisperer as PRIMARY provider
    const isPrimaryAvailable = await this.primaryProvider.isAvailable();

    if (isPrimaryAvailable) {
      try {
        logger.info({ documentId, filename }, 'Attempting extraction via primary LLMWhisperer provider');
        const result = await this.primaryProvider.extractDocument(input, onProgress);

        // Verify that primary extraction produced meaningful content
        if (result.features.wordCount > 0 && result.extractedText.trim().length > 0) {
          extractionCache.set(fileHash, result);
          return {
            result,
            providerUsed: this.primaryProvider.name,
            isFallback: false,
            isCached: false,
          };
        }

        logger.warn(
          { documentId, filename, words: result.features.wordCount },
          'Primary extraction provider returned 0 words. Falling back to local OCR pipeline.'
        );
      } catch (err: any) {
        logger.warn(
          { documentId, filename, error: err.message },
          'Primary extraction provider (LLMWhisperer) failed. Activating LocalFallback extraction pipeline.'
        );
        onProgress?.(40, 'LLMWhisperer unavailable; falling back to local extraction engine');
      }
    } else {
      logger.info(
        { documentId, isConfigured: LLMWhispererConfig.isConfigured() },
        'LLMWhisperer not available or not configured. Using LocalFallback extraction pipeline.'
      );
    }

    // 4. Fallback to Local Extraction (PDF.js + OCR + LayoutEngine)
    const fallbackResult = await this.fallbackProvider.extractDocument(input, onProgress);

    // Cache fallback result too
    extractionCache.set(fileHash, fallbackResult);

    return {
      result: fallbackResult,
      providerUsed: this.fallbackProvider.name,
      isFallback: true,
      isCached: false,
    };
  }
}
