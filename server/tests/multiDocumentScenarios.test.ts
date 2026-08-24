import { describe, it, expect } from 'vitest';
import { LLMWhispererExtractionProvider } from '../src/providers/extraction/LLMWhispererExtractionProvider.js';
import { contextRetrievalService } from '../src/services/retrieval/ContextRetrievalService.js';
import { deterministicAIProvider } from '../src/providers/ai/DeterministicAIProvider.js';
import { UnifiedDocument, DocumentBlock } from '../src/schemas/document.schema.js';

describe('Real Document Scenarios & Layout Preservation Tests', () => {
  const provider = new LLMWhispererExtractionProvider();

  it('Scenario 1: Normal selectable-text PDF (native_text mode)', () => {
    const raw = `# Product Specification\n\nThis document describes the high performance streaming architecture.\n\nKey Highlights:\n- Sub-second indexing\n- Full citation tracing`;
    const normalized = provider.normalizeResponse(raw, [{ confidence: 99 }], {}, {
      buffer: Buffer.from('pdf'),
      filename: 'spec.pdf',
      mimeType: 'application/pdf',
      fileHash: 's1',
      documentId: 'doc_s1',
      sessionId: 'sess1',
    }, 'native_text');

    expect(normalized.pages.length).toBe(1);
    expect(normalized.pages[0].blocks.some((b) => b.type === 'heading')).toBe(true);
    expect(normalized.pages[0].blocks.some((b) => b.type === 'list')).toBe(true);
  });

  it('Scenario 2: Two-column academic/research PDF', () => {
    const raw = `# Distributed Consensus in Peer-to-Peer Networks\n\n## Abstract\nWe propose an asymmetric consensus protocol that mitigates Byzantine failures.\n\n<<<\n\n## 1. Introduction\nDecentralized ledgers require resilient consensus under arbitrary network partitions.`;
    const normalized = provider.normalizeResponse(raw, [{ confidence: 95 }, { confidence: 95 }], {}, {
      buffer: Buffer.from('pdf'),
      filename: 'paper.pdf',
      mimeType: 'application/pdf',
      fileHash: 's2',
      documentId: 'doc_s2',
      sessionId: 'sess1',
    }, 'native_text');

    expect(normalized.pages.length).toBe(2);
    expect(normalized.pages[0].blocks[0].text).toContain('Distributed Consensus');
    expect(normalized.pages[1].blocks[0].text).toContain('Introduction');
  });

  it('Scenario 3: Scanned PDF (low_cost OCR mode)', () => {
    const raw = `# Archive Record 1994\n\nLegal settlement document scanned at 200 DPI.\n\nAll terms were mutually agreed upon.`;
    const normalized = provider.normalizeResponse(raw, [{ confidence: 82 }], {}, {
      buffer: Buffer.from('pdf'),
      filename: 'archive_scan.pdf',
      mimeType: 'application/pdf',
      fileHash: 's3',
      documentId: 'doc_s3',
      sessionId: 'sess1',
    }, 'low_cost');

    expect(normalized.features.isScanned).toBe(true);
    expect(normalized.pages[0].confidence).toBeGreaterThan(0.8);
  });

  it('Scenario 4: Image containing printed text', () => {
    const raw = `# Invoice Receipt\n\nItem: High-Performance GPU Cluster\nPrice: $25,000\nStatus: Paid`;
    const normalized = provider.normalizeResponse(raw, [{ confidence: 94 }], {}, {
      buffer: Buffer.from('img'),
      filename: 'invoice.png',
      mimeType: 'image/png',
      fileHash: 's4',
      documentId: 'doc_s4',
      sessionId: 'sess1',
    }, 'high_quality');

    expect(normalized.pages[0].text).toContain('$25,000');
  });

  it('Scenario 5: Handwritten document (high_quality mode)', () => {
    const raw = `# Lab Field Notes\n\nObserved chemical reaction at 45 degrees Celsius.\nReaction rate accelerated after catalyst addition.`;
    const normalized = provider.normalizeResponse(raw, [{ confidence: 75 }], {}, {
      buffer: Buffer.from('notes'),
      filename: 'handwritten_notes.jpg',
      mimeType: 'image/jpeg',
      fileHash: 's5',
      documentId: 'doc_s5',
      sessionId: 'sess1',
    }, 'high_quality');

    expect(normalized.features.hasHandwriting).toBe(true);
    expect(normalized.pages[0].isHandwritten).toBe(true);
  });

  it('Scenario 6: Table-heavy financial document (table mode)', () => {
    const raw = `# Balance Sheet Summary\n\n| Asset Class | 2024 Value | 2025 Value | Change |\n| Cash & Equiv | $50,000,000 | $65,000,000 | +30% |\n| Real Estate | $20,000,000 | $22,000,000 | +10% |\n| Total Assets | $70,000,000 | $87,000,000 | +24.3% |`;
    const normalized = provider.normalizeResponse(raw, [{ confidence: 97 }], {}, {
      buffer: Buffer.from('pdf'),
      filename: 'financials.pdf',
      mimeType: 'application/pdf',
      fileHash: 's6',
      documentId: 'doc_s6',
      sessionId: 'sess1',
    }, 'table');

    const tableBlock = normalized.pages[0].blocks.find((b) => b.type === 'table');
    expect(tableBlock).toBeDefined();
    expect(tableBlock?.tableData?.headers).toContain('Asset Class');
    expect(tableBlock?.tableData?.rows.length).toBe(3);
  });

  it('Scenario 7: Form with structured fields (form mode)', () => {
    const raw = `# Job Application Form\n\nCandidate Name: John Doe\nEmail: john@example.com\nPosition Applied: Senior Full Stack Engineer\nYears of Experience: 8 years\nWork Authorization: Yes`;
    const normalized = provider.normalizeResponse(raw, [{ confidence: 95 }], {}, {
      buffer: Buffer.from('pdf'),
      filename: 'job_application_form.pdf',
      mimeType: 'application/pdf',
      fileHash: 's7',
      documentId: 'doc_s7',
      sessionId: 'sess1',
    }, 'form');

    expect(normalized.pages[0].text).toContain('John Doe');
  });

  it('Scenario 8: Chart/diagram document with caption', () => {
    const raw = `# Infrastructure Throughput\n\nFigure 1: Comparison of request latency across microservices.\n\nPeak throughput reached 100,000 requests per second.`;
    const normalized = provider.normalizeResponse(raw, [{ confidence: 95 }], {}, {
      buffer: Buffer.from('pdf'),
      filename: 'throughput_chart.pdf',
      mimeType: 'application/pdf',
      fileHash: 's8',
      documentId: 'doc_s8',
      sessionId: 'sess1',
    }, 'native_text');

    const captionBlock = normalized.pages[0].blocks.find((b) => b.type === 'caption');
    expect(captionBlock).toBeDefined();
    expect(captionBlock?.text).toContain('Figure 1');
  });

  it('Scenario 9: Formula-heavy mathematical document', () => {
    const raw = `# Neural Network Loss Formulation\n\nThe cross-entropy loss function is defined as:\n\nL = - \\sum y_i * \\log(p_i)\n\nwhere y_i is ground truth and p_i is predicted probability.`;
    const normalized = provider.normalizeResponse(raw, [{ confidence: 98 }], {}, {
      buffer: Buffer.from('pdf'),
      filename: 'neural_loss.pdf',
      mimeType: 'application/pdf',
      fileHash: 's9',
      documentId: 'doc_s9',
      sessionId: 'sess1',
    }, 'native_text');

    const formulaBlock = normalized.pages[0].blocks.find((b) => b.type === 'formula');
    expect(formulaBlock).toBeDefined();
    expect(formulaBlock?.text).toContain('\\sum');
  });

  it('Scenario 10: Multi-document session comparison and grounded retrieval', async () => {
    const docA: UnifiedDocument = {
      id: 'doc_A',
      sessionId: 'multi_sess',
      filename: 'hiring_spec.pdf',
      originalName: 'hiring_spec.pdf',
      mimeType: 'application/pdf',
      size: 1000,
      hash: 'hashA',
      status: 'COMPLETE',
      progressPercent: 100,
      features: {
        pageCount: 1,
        wordCount: 80,
        readingTimeMinutes: 1,
        chartCount: 0,
        tableCount: 0,
        formulaCount: 0,
        imageCount: 0,
        hasHandwriting: false,
        isScanned: false,
        overallOcrConfidence: 1.0,
        documentType: 'Job Description',
        language: 'English',
      },
      pages: [
        {
          pageNumber: 1,
          width: 595,
          height: 842,
          text: 'Hiring Specification\n\nOffering compensation of Rs 3,00,000 for 6 months internship.',
          contentType: 'TEXT',
          confidence: 1.0,
          isHandwritten: false,
          hasFormulas: false,
          hasTables: false,
          hasCharts: false,
          blocks: [
            {
              id: 'docA-b1',
              pageNumber: 1,
              type: 'heading',
              text: 'Hiring Specification',
              bbox: { x: 0, y: 0, width: 595, height: 40 },
              confidence: 1.0,
              readingOrder: 1,
            },
            {
              id: 'docA-b2',
              pageNumber: 1,
              type: 'paragraph',
              text: 'Offering compensation of Rs 3,00,000 for 6 months internship.',
              bbox: { x: 0, y: 50, width: 595, height: 60 },
              confidence: 1.0,
              readingOrder: 2,
            },
          ],
          visualElements: [],
          detectedFeatures: [],
          wordCount: 10,
        },
      ],
      extractedText: 'Hiring Specification\n\nOffering compensation of Rs 3,00,000 for 6 months internship.',
      metadata: {},
      isAnonymous: true,
      createdAt: new Date().toISOString(),
    };

    const docB: UnifiedDocument = {
      id: 'doc_B',
      sessionId: 'multi_sess',
      filename: 'candidate_resume.pdf',
      originalName: 'candidate_resume.pdf',
      mimeType: 'application/pdf',
      size: 1000,
      hash: 'hashB',
      status: 'COMPLETE',
      progressPercent: 100,
      features: {
        pageCount: 1,
        wordCount: 90,
        readingTimeMinutes: 1,
        chartCount: 0,
        tableCount: 0,
        formulaCount: 0,
        imageCount: 0,
        hasHandwriting: false,
        isScanned: false,
        overallOcrConfidence: 1.0,
        documentType: 'Resume',
        language: 'English',
      },
      pages: [
        {
          pageNumber: 1,
          width: 595,
          height: 842,
          text: 'Candidate Resume\n\nExperienced Full Stack Engineer with expertise in TypeScript and Node.js.',
          contentType: 'TEXT',
          confidence: 1.0,
          isHandwritten: false,
          hasFormulas: false,
          hasTables: false,
          hasCharts: false,
          blocks: [
            {
              id: 'docB-b1',
              pageNumber: 1,
              type: 'heading',
              text: 'Candidate Resume',
              bbox: { x: 0, y: 0, width: 595, height: 40 },
              confidence: 1.0,
              readingOrder: 1,
            },
            {
              id: 'docB-b2',
              pageNumber: 1,
              type: 'paragraph',
              text: 'Experienced Full Stack Engineer with expertise in TypeScript and Node.js.',
              bbox: { x: 0, y: 50, width: 595, height: 60 },
              confidence: 1.0,
              readingOrder: 2,
            },
          ],
          visualElements: [],
          detectedFeatures: [],
          wordCount: 11,
        },
      ],
      extractedText: 'Candidate Resume\n\nExperienced Full Stack Engineer with expertise in TypeScript and Node.js.',
      metadata: {},
      isAnonymous: true,
      createdAt: new Date().toISOString(),
    };

    // Cross document comparison
    const multiAnalysis = await deterministicAIProvider.compareDocuments([docA, docB], {});
    expect(multiAnalysis.documentCount).toBe(2);
    expect(multiAnalysis.combinedSummary).toContain('hiring_spec.pdf');
    expect(multiAnalysis.combinedSummary).toContain('candidate_resume.pdf');

    // Cross document retrieval
    const chunks = contextRetrievalService.retrieveRelevantChunks([docA, docB], 'What is the offered compensation?', 2);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].documentId).toBe('doc_A');
    expect(chunks[0].text).toContain('3,00,000');
  });
});
