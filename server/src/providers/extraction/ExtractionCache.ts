import { ExtractionResult } from './DocumentExtractionProvider.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

interface CacheEntry {
  result: ExtractionResult;
  timestamp: number;
}

export class ExtractionCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxEntries: number;
  private ttlMs: number;

  constructor(maxEntries: number = env.EXTRACTION_CACHE_MAX_ENTRIES, ttlHours: number = env.EXTRACTION_CACHE_TTL_HOURS) {
    this.maxEntries = Math.max(10, maxEntries);
    this.ttlMs = Math.max(1, ttlHours) * 60 * 60 * 1000;
  }

  get(fileHash: string): ExtractionResult | null {
    if (!fileHash) return null;

    const entry = this.cache.get(fileHash);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > this.ttlMs;
    if (isExpired) {
      this.cache.delete(fileHash);
      return null;
    }

    // Refresh LRU position (delete & re-insert)
    this.cache.delete(fileHash);
    this.cache.set(fileHash, entry);

    logger.info({ fileHash: fileHash.substring(0, 12) }, 'Extraction cache HIT: Reusing previous extraction result');
    return {
      ...entry.result,
      isCached: true,
    };
  }

  set(fileHash: string, result: ExtractionResult): void {
    if (!fileHash) return;

    // Evict oldest if capacity reached
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(fileHash, {
      result,
      timestamp: Date.now(),
    });

    logger.debug({ fileHash: fileHash.substring(0, 12), cacheSize: this.cache.size }, 'Stored extraction result in cache');
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const extractionCache = new ExtractionCache();
