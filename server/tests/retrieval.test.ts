import { describe, it, expect } from 'vitest';
import { contextRetrievalService } from '../src/services/retrieval/ContextRetrievalService.js';
import { UnifiedDocument } from '../src/schemas/document.schema.js';

describe('Context Retrieval & In-Document Search', () => {
  const mockDoc: UnifiedDocument = {
    id: 'doc_test_123',
    sessionId: 'sess_test',
    filename: 'unthinkable_guide.pdf',
    originalName: 'unthinkable_guide.pdf',
    mimeType: 'application/pdf',
    size: 4096,
    hash: 'abc123hash',
    status: 'COMPLETE',
    progressPercent: 100,
    features: {
      pageCount: 3,
      wordCount: 150,
      readingTimeMinutes: 1,
      chartCount: 1,
      tableCount: 1,
      formulaCount: 0,
      imageCount: 0,
      hasHandwriting: false,
      isScanned: false,
      overallOcrConfidence: 1.0,
      documentType: 'Technical Guide',
      language: 'English',
    },
    pages: [
      {
        pageNumber: 1,
        text: 'Overview of Unthinkable Summarizer. The system processes multimodal documents seamlessly.',
        ocrText: '',
        contentType: 'TEXT',
        confidence: 1.0,
        isHandwritten: false,
        hasFormulas: false,
        hasTables: false,
        hasCharts: false,
        visualElements: [],
        detectedFeatures: [],
        wordCount: 15,
      },
      {
        pageNumber: 2,
        text: 'Architecture details. The system integrates BM25 search ranking and selective page rendering.',
        ocrText: '',
        contentType: 'TEXT',
        confidence: 1.0,
        isHandwritten: false,
        hasFormulas: false,
        hasTables: false,
        hasCharts: true,
        visualElements: [],
        detectedFeatures: [],
        wordCount: 14,
      },
      {
        pageNumber: 3,
        text: 'Compensation & Hiring details. Total package is ₹3,00,000 for full-stack software engineers.',
        ocrText: '',
        contentType: 'TEXT',
        confidence: 1.0,
        isHandwritten: false,
        hasFormulas: false,
        hasTables: true,
        hasCharts: false,
        visualElements: [],
        detectedFeatures: [],
        wordCount: 14,
      },
    ],
    extractedText: 'Overview of Unthinkable Summarizer. Architecture details. Compensation details.',
    metadata: {},
    isAnonymous: true,
    createdAt: new Date().toISOString(),
  };

  it('should retrieve relevant chunks with BM25 ranking and page citations', () => {
    const chunks = contextRetrievalService.retrieveRelevantChunks([mockDoc], 'What is the compensation package?', 3);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].pageNumber).toBe(3);
    expect(chunks[0].text).toContain('₹3,00,000');
    expect(chunks[0].score).toBeGreaterThan(0);
  });

  it('should perform instant in-document keyword search across pages', () => {
    const searchResults = contextRetrievalService.searchInDocument(mockDoc, 'architecture');

    expect(searchResults.length).toBe(1);
    expect(searchResults[0].pageNumber).toBe(2);
    expect(searchResults[0].matchCount).toBe(1);
    expect(searchResults[0].snippets[0].toLowerCase()).toContain('architecture');
  });
});
