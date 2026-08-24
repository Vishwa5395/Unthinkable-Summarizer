import { describe, it, expect } from 'vitest';
import { LayoutEngine, RawTextItem } from '../src/utils/LayoutEngine.js';
import { contextRetrievalService } from '../src/services/retrieval/ContextRetrievalService.js';
import { deterministicAIProvider } from '../src/providers/ai/DeterministicAIProvider.js';
import { UnifiedDocument } from '../src/schemas/document.schema.js';

describe('Document Layout Reconstruction & Spatial Intelligence', () => {
  const pageWidth = 600;
  const pageHeight = 800;

  it('1. Single-column PDF: should preserve top-to-bottom reading order with headings and paragraphs', () => {
    const rawItems: RawTextItem[] = [
      { str: 'Introduction to Distributed Systems', transform: [14, 0, 0, 14, 50, 720], width: 250, height: 14, fontName: 'Helvetica-Bold' },
      { str: 'A distributed system consists of multiple autonomous computers.', transform: [10, 0, 0, 10, 50, 680], width: 350, height: 10, fontName: 'Helvetica' },
      { str: 'They communicate through a computer network.', transform: [10, 0, 0, 10, 50, 660], width: 250, height: 10, fontName: 'Helvetica' },
      { str: 'System Architecture', transform: [14, 0, 0, 14, 50, 600], width: 140, height: 14, fontName: 'Helvetica-Bold' },
      { str: 'Nodes coordinate actions using consensus algorithms.', transform: [10, 0, 0, 10, 50, 560], width: 300, height: 10, fontName: 'Helvetica' },
    ];

    const result = LayoutEngine.reconstructPdfPageLayout(rawItems, pageWidth, pageHeight, 1);
    expect(result.blocks.length).toBe(4);
    expect(result.blocks[0].type).toBe('heading');
    expect(result.blocks[0].text).toContain('Introduction to Distributed Systems');
    expect(result.blocks[1].type).toBe('paragraph');
    expect(result.blocks[1].text).toContain('distributed system consists of multiple autonomous computers');
    expect(result.blocks[2].type).toBe('heading');
    expect(result.blocks[2].text).toContain('System Architecture');
    expect(result.blocks[3].type).toBe('paragraph');
  });

  it('2. Two-column PDF: should read Column 1 top-to-bottom before reading Column 2 (NOT across columns)', () => {
    // Page layout: Left Column (x=50..250), Right Column (x=350..550)
    // In raw PDF, items might appear sorted horizontally by Y band:
    // Left Heading (Y=650) -> Right Heading (Y=650) -> Left Para (Y=600) -> Right Para (Y=600)
    const rawItems: RawTextItem[] = [
      { str: 'Column 1 Heading', transform: [12, 0, 0, 12, 50, 650], width: 120, height: 12, fontName: 'Helvetica-Bold' },
      { str: 'Column 2 Heading', transform: [12, 0, 0, 12, 350, 650], width: 120, height: 12, fontName: 'Helvetica-Bold' },
      { str: 'Left column first paragraph text explaining concept A.', transform: [10, 0, 0, 10, 50, 600], width: 200, height: 10 },
      { str: 'Right column first paragraph text explaining concept B.', transform: [10, 0, 0, 10, 350, 600], width: 200, height: 10 },
      { str: 'Left column second paragraph with further details on A.', transform: [10, 0, 0, 10, 50, 550], width: 200, height: 10 },
      { str: 'Right column second paragraph with further details on B.', transform: [10, 0, 0, 10, 350, 550], width: 200, height: 10 },
    ];

    const result = LayoutEngine.reconstructPdfPageLayout(rawItems, pageWidth, pageHeight, 1);
    const blockTexts = result.blocks.map((b) => b.text);

    // Verify Column 1 content appears BEFORE Column 2 content in reconstructed reading order
    const leftHeadIdx = blockTexts.findIndex((t) => t.includes('Column 1 Heading'));
    const leftPara1Idx = blockTexts.findIndex((t) => t.includes('concept A'));
    const rightHeadIdx = blockTexts.findIndex((t) => t.includes('Column 2 Heading'));
    const rightPara1Idx = blockTexts.findIndex((t) => t.includes('concept B'));

    expect(leftHeadIdx).toBeLessThan(leftPara1Idx);
    expect(leftPara1Idx).toBeLessThan(rightHeadIdx);
    expect(rightHeadIdx).toBeLessThan(rightPara1Idx);
  });

  it('3. Table-heavy document: should reconstruct structured table headers, rows, and cells instead of flattening', () => {
    const rawItems: RawTextItem[] = [
      { str: 'Quarterly Financial Summary', transform: [14, 0, 0, 14, 50, 700], width: 200, height: 14, fontName: 'Helvetica-Bold' },
      { str: '| Metric | Q1 2025 | Q2 2025 | Growth |', transform: [10, 0, 0, 10, 50, 640], width: 350, height: 10 },
      { str: '| Revenue | $1.2M | $1.5M | +25% |', transform: [10, 0, 0, 10, 50, 615], width: 350, height: 10 },
      { str: '| Operating Profit | $300k | $420k | +40% |', transform: [10, 0, 0, 10, 50, 590], width: 350, height: 10 },
    ];

    const result = LayoutEngine.reconstructPdfPageLayout(rawItems, pageWidth, pageHeight, 1);
    const tableBlock = result.blocks.find((b) => b.type === 'table');
    expect(tableBlock).toBeDefined();
    expect(tableBlock?.tableData).toBeDefined();
    expect(tableBlock?.tableData?.headers).toContain('Metric');
    expect(tableBlock?.tableData?.headers).toContain('Growth');
    expect(tableBlock?.tableData?.rows.length).toBe(2);
    expect(tableBlock?.tableData?.rows[0]).toContain('Revenue');
    expect(tableBlock?.tableData?.rows[0]).toContain('+25%');
  });

  it('4. Figure, Chart & Caption association: should link caption block to its associated figure/chart', () => {
    const rawItems: RawTextItem[] = [
      { str: 'Performance Benchmarks', transform: [14, 0, 0, 14, 50, 700], width: 200, height: 14, fontName: 'Helvetica-Bold' },
      { str: '| Model | Latency | Accuracy |', transform: [10, 0, 0, 10, 50, 600], width: 250, height: 10 },
      { str: '| Unthinkable | 42ms | 99.4% |', transform: [10, 0, 0, 10, 50, 575], width: 250, height: 10 },
      { str: 'Figure 1: Latency and accuracy comparison across document models.', transform: [9, 0, 0, 9, 50, 540], width: 350, height: 9 },
    ];

    const result = LayoutEngine.reconstructPdfPageLayout(rawItems, pageWidth, pageHeight, 1);
    const captionBlock = result.blocks.find((b) => b.type === 'caption');
    const tableBlock = result.blocks.find((b) => b.type === 'table');

    expect(captionBlock).toBeDefined();
    expect(tableBlock).toBeDefined();
    expect(captionBlock?.captionFor).toBe(tableBlock?.id);
    expect(tableBlock?.associatedCaptionId).toBe(captionBlock?.id);
  });

  it('5. Formula-heavy document: should preserve mathematical formulas in context', () => {
    const rawItems: RawTextItem[] = [
      { str: 'Energy Conservation Law', transform: [14, 0, 0, 14, 50, 700], width: 180, height: 14, fontName: 'Helvetica-Bold' },
      { str: 'The fundamental equation of mass-energy equivalence is stated as:', transform: [10, 0, 0, 10, 50, 660], width: 350, height: 10 },
      { str: 'E = m * c^2', transform: [11, 0, 0, 11, 80, 620], width: 80, height: 11 },
      { str: 'where E represents energy, m represents mass, and c is the speed of light.', transform: [10, 0, 0, 10, 50, 580], width: 400, height: 10 },
    ];

    const result = LayoutEngine.reconstructPdfPageLayout(rawItems, pageWidth, pageHeight, 1);
    const formulaBlock = result.blocks.find((b) => b.type === 'formula');
    expect(formulaBlock).toBeDefined();
    expect(formulaBlock?.text).toContain('E = m * c^2');
    expect(formulaBlock?.readingOrder).toBe(3);
  });

  it('6. Header/Footer isolation: should isolate running headers and page numbers from main body text', () => {
    const rawItems: RawTextItem[] = [
      { str: 'CONFIDENTIAL - UNTHINKABLE INTERNAL', transform: [8, 0, 0, 8, 50, 770], width: 180, height: 8, fontName: 'Helvetica' },
      { str: 'Executive Report on Infrastructure', transform: [16, 0, 0, 16, 50, 700], width: 300, height: 16, fontName: 'Helvetica-Bold' },
      { str: 'Our cloud platform handled 500 million operations flawlessly.', transform: [10, 0, 0, 10, 50, 650], width: 350, height: 10 },
      { str: 'Page 1 of 12', transform: [8, 0, 0, 8, 260, 30], width: 60, height: 8, fontName: 'Helvetica' },
    ];

    const result = LayoutEngine.reconstructPdfPageLayout(rawItems, pageWidth, pageHeight, 1);
    const headerBlock = result.blocks.find((b) => b.type === 'header');
    const footerBlock = result.blocks.find((b) => b.type === 'footer');

    expect(headerBlock).toBeDefined();
    expect(footerBlock).toBeDefined();
    expect(headerBlock?.isHeaderOrFooter).toBe(true);
    expect(footerBlock?.isHeaderOrFooter).toBe(true);
    // Main text should not be polluted by header/footer
    expect(result.reconstructedText).not.toContain('CONFIDENTIAL');
    expect(result.reconstructedText).not.toContain('Page 1 of 12');
    expect(result.reconstructedText).toContain('Executive Report on Infrastructure');
  });

  it('7. OCR layout reconstruction: should reconstruct words into lines, paragraphs and compute normalized bounding boxes', () => {
    const ocrWords = [
      { text: 'Handwritten', confidence: 0.95, bbox: { x0: 50, y0: 100, x1: 150, y1: 120 } },
      { text: 'Meeting', confidence: 0.92, bbox: { x0: 160, y0: 100, x1: 230, y1: 120 } },
      { text: 'Notes', confidence: 0.90, bbox: { x0: 240, y0: 100, x1: 290, y1: 120 } },
      { text: 'Action', confidence: 0.88, bbox: { x0: 50, y0: 150, x1: 100, y1: 170 } },
      { text: 'Items:', confidence: 0.85, bbox: { x0: 110, y0: 150, x1: 160, y1: 170 } },
      { text: '1.', confidence: 0.90, bbox: { x0: 50, y0: 190, x1: 65, y1: 210 } },
      { text: 'Deploy', confidence: 0.70, bbox: { x0: 75, y0: 190, x1: 130, y1: 210 } },
      { text: 'pipeline', confidence: 0.65, bbox: { x0: 140, y0: 190, x1: 200, y1: 210 } },
    ];

    const result = LayoutEngine.reconstructOcrPageLayout(ocrWords, 1000, 1500, 1);
    expect(result.blocks.length).toBeGreaterThanOrEqual(2);
    expect(result.blocks[0].text).toContain('Handwritten Meeting Notes');
    expect(result.blocks[0].bbox.normalized).toBeDefined();
    expect(result.blocks[0].bbox.normalized?.x).toBeGreaterThanOrEqual(0);
    expect(result.blocks[0].bbox.normalized?.width).toBeGreaterThan(0);
  });

  it('8. Spatial Citations & Multi-Document retrieval: should return blockId, pageNumber and boundingBox for grounded QA', async () => {
    const mockDoc: UnifiedDocument = {
      id: 'doc_spatial_test',
      sessionId: 'sess_1',
      filename: 'financials.pdf',
      originalName: 'financials.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      hash: 'hash123',
      status: 'COMPLETE',
      progressPercent: 100,
      features: {
        pageCount: 1,
        wordCount: 150,
        readingTimeMinutes: 1,
        chartCount: 0,
        tableCount: 1,
        formulaCount: 0,
        imageCount: 0,
        hasHandwriting: false,
        isScanned: false,
        overallOcrConfidence: 1.0,
        documentType: 'Financial / Quarterly Report',
        language: 'English',
      },
      pages: [
        {
          pageNumber: 1,
          width: 600,
          height: 800,
          text: 'Financial Results\n\nRevenue for Q4 reached $10,000,000 representing 45% annual growth.',
          contentType: 'TEXT',
          confidence: 1.0,
          isHandwritten: false,
          hasFormulas: false,
          hasTables: false,
          hasCharts: false,
          blocks: [
            {
              id: 'page-1-block-1',
              pageNumber: 1,
              type: 'heading',
              text: 'Financial Results',
              bbox: { x: 50, y: 50, width: 200, height: 20, normalized: { x: 0.083, y: 0.0625, width: 0.333, height: 0.025 } },
              confidence: 1.0,
              readingOrder: 1,
              level: 1,
            },
            {
              id: 'page-1-block-2',
              pageNumber: 1,
              type: 'paragraph',
              text: 'Revenue for Q4 reached $10,000,000 representing 45% annual growth.',
              bbox: { x: 50, y: 100, width: 450, height: 40, normalized: { x: 0.083, y: 0.125, width: 0.75, height: 0.05 } },
              confidence: 1.0,
              readingOrder: 2,
            },
          ],
          visualElements: [],
          detectedFeatures: [],
          wordCount: 12,
        },
      ],
      extractedText: 'Financial Results\n\nRevenue for Q4 reached $10,000,000 representing 45% annual growth.',
      metadata: {},
      isAnonymous: true,
      createdAt: new Date().toISOString(),
    };

    const chunks = contextRetrievalService.retrieveRelevantChunks([mockDoc], 'What was the Q4 revenue and growth?', 2);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].blockId).toBe('page-1-block-2');
    expect(chunks[0].boundingBox?.normalized).toBeDefined();

    const qa = await deterministicAIProvider.answerQuestion('What was the Q4 revenue?', {
      document: mockDoc,
      retrievedChunks: chunks,
    });

    expect(qa.answer).toContain('$10,000,000');
    expect(qa.citations.length).toBeGreaterThan(0);
    expect(qa.citations[0].blockId).toBe('page-1-block-2');
    expect(qa.citations[0].boundingBox?.normalized?.width).toBe(0.75);
  });
});
