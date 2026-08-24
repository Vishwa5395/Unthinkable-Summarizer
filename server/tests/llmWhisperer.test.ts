import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { LLMWhispererExtractionProvider } from '../src/providers/extraction/LLMWhispererExtractionProvider.js';
import { ExtractionCache } from '../src/providers/extraction/ExtractionCache.js';
import { ExtractionProviderFactory } from '../src/providers/extraction/ExtractionProviderFactory.js';
import { ExtractionInput } from '../src/providers/extraction/DocumentExtractionProvider.js';
import { LLMWhispererConfig } from '../src/config/llmWhispererConfig.js';

describe('LLMWhisperer Extraction Provider & Cache Suite', () => {
  let provider: LLMWhispererExtractionProvider;
  let cache: ExtractionCache;

  beforeEach(() => {
    provider = new LLMWhispererExtractionProvider();
    cache = new ExtractionCache(10, 1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Intelligent Mode Selection', () => {
    it('should select native_text for digital PDF files with embedded fonts', () => {
      const input: ExtractionInput = {
        buffer: Buffer.from('%PDF-1.4 ... /Font /Type /Page ... contents', 'latin1'),
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        fileHash: 'hash1',
        documentId: 'doc1',
        sessionId: 'sess1',
      };
      const mode = provider.selectExtractionMode(input);
      expect(mode).toBe('native_text');
    });

    it('should select table for financial and quarterly balance sheet documents', () => {
      const input: ExtractionInput = {
        buffer: Buffer.from('test'),
        filename: 'Q4_Financial_Balance_Sheet.pdf',
        mimeType: 'application/pdf',
        fileHash: 'hash2',
        documentId: 'doc2',
        sessionId: 'sess1',
      };
      const mode = provider.selectExtractionMode(input);
      expect(mode).toBe('table');
    });

    it('should select form for application and tax forms', () => {
      const input: ExtractionInput = {
        buffer: Buffer.from('test'),
        filename: 'W2_Tax_Application_Form.pdf',
        mimeType: 'application/pdf',
        fileHash: 'hash3',
        documentId: 'doc3',
        sessionId: 'sess1',
      };
      const mode = provider.selectExtractionMode(input);
      expect(mode).toBe('form');
    });

    it('should select high_quality for handwritten notes and sketches', () => {
      const input: ExtractionInput = {
        buffer: Buffer.from('test'),
        filename: 'Handwritten_Meeting_Notes.pdf',
        mimeType: 'application/pdf',
        fileHash: 'hash4',
        documentId: 'doc4',
        sessionId: 'sess1',
      };
      const mode = provider.selectExtractionMode(input);
      expect(mode).toBe('high_quality');
    });

    it('should select high_quality for image files', () => {
      const input: ExtractionInput = {
        buffer: Buffer.from('image bytes'),
        filename: 'receipt.png',
        mimeType: 'image/png',
        fileHash: 'hash5',
        documentId: 'doc5',
        sessionId: 'sess1',
      };
      const mode = provider.selectExtractionMode(input);
      expect(mode).toBe('high_quality');
    });
  });

  describe('2. Metadata & Layout-Preserving Normalization', () => {
    it('should normalize multi-page LLMWhisperer output with tables and formulas', () => {
      const rawText = `# Executive Overview\n\nWe achieved 30% growth.\n\n| Quarter | Revenue | Profit |\n| Q1 | $10M | $2M |\n| Q2 | $15M | $4M |\n\n<<<\n\n# Engineering Architecture\n\nThe fundamental latency equation:\n\nE = m * c^2\n\n- Low latency queries\n- High throughput vector indexing`;

      const input: ExtractionInput = {
        buffer: Buffer.from('test'),
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        fileHash: 'hash_norm',
        documentId: 'doc_norm',
        sessionId: 'sess1',
      };

      const normalized = provider.normalizeResponse(rawText, [{ confidence: 96 }, { confidence: 92 }], {}, input, 'native_text');

      expect(normalized.pages.length).toBe(2);
      expect(normalized.pages[0].pageNumber).toBe(1);
      expect(normalized.pages[1].pageNumber).toBe(2);

      // Page 1 should have heading, paragraph, and table
      const p1Blocks = normalized.pages[0].blocks;
      expect(p1Blocks.some((b) => b.type === 'heading' && b.text.includes('Executive Overview'))).toBe(true);
      expect(p1Blocks.some((b) => b.type === 'table' && b.tableData?.headers.includes('Revenue'))).toBe(true);
      expect(normalized.pages[0].hasTables).toBe(true);

      // Page 2 should have heading, formula, and list
      const p2Blocks = normalized.pages[1].blocks;
      expect(p2Blocks.some((b) => b.type === 'heading' && b.text.includes('Engineering Architecture'))).toBe(true);
      expect(p2Blocks.some((b) => b.type === 'formula' && b.text.includes('E = m * c^2'))).toBe(true);
      expect(p2Blocks.some((b) => b.type === 'list')).toBe(true);
      expect(normalized.pages[1].hasFormulas).toBe(true);
    });
  });

  describe('3. Asynchronous API v2 Workflow', () => {
    it('should handle 202 Accepted async job polling and retrieval', async () => {
      vi.spyOn(LLMWhispererConfig, 'getOptions').mockReturnValue({
        apiKey: 'mock_test_key_123',
        baseUrl: 'https://llmwhisperer-api.us-central.unstract.com/api/v2',
        timeoutMs: 10000,
        maxRetries: 1,
        maxConcurrent: 2,
        pollIntervalMs: 10,
      });

      const mockFetch = vi.fn();

      // 1. Initial POST /whisper returns 202 Accepted with whisper_hash
      mockFetch.mockResolvedValueOnce({
        status: 202,
        ok: true,
        json: async () => ({ whisper_hash: 'hash_abc123' }),
      });

      // 2. GET /whisper-status returns status 'processing'
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ status: 'processing' }),
      });

      // 3. GET /whisper-status returns status 'processed'
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ status: 'processed' }),
      });

      // 4. GET /whisper-retrieve returns extracted result
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({
          result_text: '# Async Extracted Document\n\nProcessed via official LLMWhisperer API v2 pipeline.',
          confidence_metadata: [{ page_no: 1, confidence: 98 }],
          metadata: { page_count: 1 },
        }),
      });

      global.fetch = mockFetch;

      const input: ExtractionInput = {
        buffer: Buffer.from('mock pdf bytes'),
        filename: 'async_test.pdf',
        mimeType: 'application/pdf',
        fileHash: 'hash_async',
        documentId: 'doc_async',
        sessionId: 'sess_async',
      };

      const res = await provider.extractDocument(input);

      expect(res.providerUsed).toBe('llmwhisperer');
      expect(res.pages.length).toBe(1);
      expect(res.pages[0].text).toContain('Async Extracted Document');
      expect(res.pages[0].blocks.length).toBeGreaterThan(0);
    });

    it('should throw error and activate cooldown when rate-limited (429)', async () => {
      vi.spyOn(LLMWhispererConfig, 'getOptions').mockReturnValue({
        apiKey: 'mock_test_key_123',
        baseUrl: 'https://llmwhisperer-api.us-central.unstract.com/api/v2',
        timeoutMs: 10000,
        maxRetries: 0,
        maxConcurrent: 2,
        pollIntervalMs: 10,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        status: 429,
        ok: false,
        text: async () => 'Rate limit exceeded',
      });
      global.fetch = mockFetch;

      const input: ExtractionInput = {
        buffer: Buffer.from('bytes'),
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        fileHash: 'hash_429',
        documentId: 'doc_429',
        sessionId: 'sess1',
      };

      await expect(provider.extractDocument(input)).rejects.toThrow(/Rate Limit/i);
    });
  });

  describe('4. Extraction Cache & Deduplication', () => {
    it('should cache results by SHA-256 and return cached results with 0 API calls', () => {
      const mockResult = {
        pages: [],
        features: {
          pageCount: 1,
          wordCount: 50,
          readingTimeMinutes: 1,
          chartCount: 0,
          tableCount: 0,
          formulaCount: 0,
          imageCount: 0,
          hasHandwriting: false,
          isScanned: false,
          overallOcrConfidence: 1.0,
          documentType: 'PDF',
          language: 'English',
        },
        extractedText: 'Cached content',
        providerUsed: 'llmwhisperer',
      };

      cache.set('sha256_abcdef', mockResult);

      const hit = cache.get('sha256_abcdef');
      expect(hit).toBeDefined();
      expect(hit?.isCached).toBe(true);
      expect(hit?.extractedText).toBe('Cached content');

      const miss = cache.get('non_existent_hash');
      expect(miss).toBeNull();
    });
  });

  describe('5. Extraction Provider Factory with Failover', () => {
    it('should gracefully fall back to LocalFallback provider when LLMWhisperer fails or is unconfigured', async () => {
      let fixturePath = path.resolve(process.cwd(), '../test-fixtures/sample-job-description.pdf');
      try {
        await fs.access(fixturePath);
      } catch {
        fixturePath = path.resolve(process.cwd(), 'test-fixtures/sample-job-description.pdf');
      }
      const realPdfBuffer = await fs.readFile(fixturePath);

      const input: ExtractionInput = {
        buffer: realPdfBuffer,
        filename: 'sample-job-description.pdf',
        mimeType: 'application/pdf',
        fileHash: 'hash_fallback_real_pdf',
        documentId: 'doc_fallback_test',
        sessionId: 'sess_fb',
      };

      const result = await ExtractionProviderFactory.extractWithFallback(input);
      expect(result.providerUsed).toBe('local-fallback');
      expect(result.isFallback).toBe(true);
      expect(result.result.pages.length).toBe(2);
      expect(result.result.extractedText).toContain('SENIOR SOFTWARE ENGINEER');
    });
  });
});
