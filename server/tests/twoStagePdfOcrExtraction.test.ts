import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExtractionQualityEvaluator } from '../src/services/document/ExtractionQualityEvaluator.js';
import { pdfExtractionService } from '../src/services/document/PdfExtractionService.js';
import { imageExtractionService } from '../src/services/document/ImageExtractionService.js';
import { ocrProvider } from '../src/providers/ocr/TesseractOCRProvider.js';
import { deterministicAIProvider } from '../src/providers/ai/DeterministicAIProvider.js';
import { documentPipelineService } from '../src/services/document/DocumentPipelineService.js';
import { memoryStore } from '../src/models/MemoryStore.js';
import { UnifiedDocument } from '../src/schemas/document.schema.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';

describe('Two-Stage Hybrid PDF Extraction & Meaningful-Content Suite', () => {
  beforeEach(() => {
    vi.spyOn(ocrProvider, 'recognizeText').mockImplementation(async (buf, opts) => {
      return {
        text: 'Mocked OCR extracted text for testing',
        confidence: 0.9,
        isHandwritten: !!opts?.isHandwritingHint,
        words: [
          { text: 'Mocked', confidence: 0.9, bbox: { x0: 10, y0: 10, x1: 50, y1: 30 } },
          { text: 'OCR', confidence: 0.9, bbox: { x0: 60, y0: 10, x1: 90, y1: 30 } },
          { text: 'extracted', confidence: 0.9, bbox: { x0: 100, y0: 10, x1: 150, y1: 30 } },
          { text: 'text', confidence: 0.9, bbox: { x0: 160, y0: 10, x1: 200, y1: 30 } },
        ],
        durationMs: 10,
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  async function createDigitalPdf(pagesText: string[]): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const text of pagesText) {
      const page = pdfDoc.addPage([600, 800]);
      const lines = text.split('\n');
      let y = 700;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          page.drawText(trimmed, {
            x: 50,
            y,
            size: 12,
            font,
            color: rgb(0, 0, 0),
          });
          y -= 25;
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  // Helper to generate an image-only / scanned PDF (embedded raster image, no text stream)
  async function createScannedPdfWithImage(imageBuffer: Buffer): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const pngImage = await pdfDoc.embedPng(imageBuffer);
    const page = pdfDoc.addPage([600, 800]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: 600,
      height: 800,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  // Helper to generate a test image containing rendered text
  async function createTextImage(text: string): Promise<Buffer> {
    const svgText = `
      <svg width="600" height="800" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="white"/>
        <text x="50" y="100" font-family="Arial" font-size="20" fill="black">${text}</text>
      </svg>
    `;
    return await sharp(Buffer.from(svgText)).png().toBuffer();
  }

  describe('1. ExtractionQualityEvaluator', () => {
    it('should identify empty or whitespace text as non-meaningful', () => {
      const emptyEval = ExtractionQualityEvaluator.evaluatePageText('');
      expect(emptyEval.isMeaningful).toBe(false);
      expect(emptyEval.wordCount).toBe(0);

      const wsEval = ExtractionQualityEvaluator.evaluatePageText('   \n\t  \n  ');
      expect(wsEval.isMeaningful).toBe(false);
      expect(wsEval.wordCount).toBe(0);
    });

    it('should reject repetitive noise or garbage characters', () => {
      const noiseText = '........ ????? $$$$$ ##### @@@@@ ......';
      const noiseEval = ExtractionQualityEvaluator.evaluatePageText(noiseText);
      expect(noiseEval.isMeaningful).toBe(false);
    });

    it('should validate meaningful paragraphs with sufficient text density', () => {
      const validText = 'The quarterly earnings report indicates revenue grew by 24% year-over-year with strong operating cash flow.';
      const validEval = ExtractionQualityEvaluator.evaluatePageText(validText);
      expect(validEval.isMeaningful).toBe(true);
      expect(validEval.wordCount).toBeGreaterThan(10);
    });
  });

  describe('2. Scenario 1: Normal Text PDF (Native Extraction)', () => {
    it('should successfully extract native text and not trigger unnecessary OCR', async () => {
      const digitalPdfBuffer = await createDigitalPdf([
        'Executive Summary:\nSoftware engineering platform performance improved by 45%.\nOperating margins expanded significantly across all cloud deployment zones.\nZero downtime reported in the last fiscal quarter.',
      ]);

      const result = await pdfExtractionService.extractPdf(digitalPdfBuffer, 'test_digital.pdf');
      expect(result.features.wordCount).toBeGreaterThan(15);
      expect(result.features.pageCount).toBe(1);
      expect(result.features.isScanned).toBe(false);
      expect(result.pages[0].text).toContain('Software engineering platform');
      expect(result.diagnostics?.extractionMethod).toBe('NATIVE');
    });
  });

  describe('3. Scenario 2 & 10: Completely Scanned PDF & OCR Fallback', () => {
    it('should detect 0 native words and automatically activate OCR on rendered pages', async () => {
      const imageBuf = await createTextImage('Invoice 4920 for Cloud Services and Technical Architecture');
      const scannedPdfBuffer = await createScannedPdfWithImage(imageBuf);

      // Mock OCR provider recognition to return recognized words
      const ocrSpy = vi.spyOn(ocrProvider, 'recognizeText').mockResolvedValueOnce({
        text: 'Invoice 4920 for Cloud Services and Technical Architecture',
        confidence: 0.94,
        isHandwritten: false,
        words: [
          { text: 'Invoice', confidence: 0.95, bbox: { x0: 50, y0: 80, x1: 120, y1: 100 } },
          { text: '4920', confidence: 0.95, bbox: { x0: 130, y0: 80, x1: 180, y1: 100 } },
          { text: 'for', confidence: 0.95, bbox: { x0: 190, y0: 80, x1: 220, y1: 100 } },
          { text: 'Cloud', confidence: 0.95, bbox: { x0: 230, y0: 80, x1: 290, y1: 100 } },
          { text: 'Services', confidence: 0.95, bbox: { x0: 300, y0: 80, x1: 380, y1: 100 } },
        ],
        durationMs: 150,
      });

      const result = await pdfExtractionService.extractPdf(scannedPdfBuffer, 'scanned_invoice.pdf');

      expect(ocrSpy).toHaveBeenCalled();
      expect(result.features.wordCount).toBeGreaterThan(0);
      expect(result.features.isScanned).toBe(true);
      expect(result.pages[0].contentType).toBe('SCANNED');
      expect(result.pages[0].text).toContain('Invoice');
      expect(result.diagnostics?.extractionMethod).toBe('OCR');
      ocrSpy.mockRestore();
    });
  });

  describe('4. Scenario 3: Mixed Hybrid PDF', () => {
    it('should preserve native text on page 1 and run OCR on scanned page 2', async () => {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Page 1: Native Text (drawn inside body area)
      const page1 = pdfDoc.addPage([600, 800]);
      page1.drawText('Page 1: Digital Project Overview', { x: 50, y: 700, size: 12, font, color: rgb(0, 0, 0) });
      page1.drawText('Architecture Diagrams and Milestones.', { x: 50, y: 675, size: 12, font, color: rgb(0, 0, 0) });

      // Page 2: Scanned image only
      const imageBuf = await createTextImage('Page 2 Scanned Appendix with Receipt and Stamp');
      const pngImage = await pdfDoc.embedPng(imageBuf);
      const page2 = pdfDoc.addPage([600, 800]);
      page2.drawImage(pngImage, { x: 0, y: 0, width: 600, height: 800 });

      const mixedBuffer = Buffer.from(await pdfDoc.save());

      const ocrSpy = vi.spyOn(ocrProvider, 'recognizeText').mockResolvedValueOnce({
        text: 'Page 2 Scanned Appendix with Receipt and Stamp',
        confidence: 0.92,
        isHandwritten: false,
        words: [
          { text: 'Page', confidence: 0.95, bbox: { x0: 50, y0: 80, x1: 100, y1: 100 } },
          { text: '2', confidence: 0.95, bbox: { x0: 110, y0: 80, x1: 120, y1: 100 } },
          { text: 'Scanned', confidence: 0.95, bbox: { x0: 130, y0: 80, x1: 200, y1: 100 } },
          { text: 'Appendix', confidence: 0.95, bbox: { x0: 210, y0: 80, x1: 290, y1: 100 } },
        ],
        durationMs: 120,
      });

      const result = await pdfExtractionService.extractPdf(mixedBuffer, 'mixed_document.pdf');

      expect(result.pages.length).toBe(2);
      expect(result.pages[0].text).toContain('Digital Project Overview');
      expect(result.pages[1].text).toContain('Scanned Appendix');
      expect(result.features.wordCount).toBeGreaterThan(10);
      expect(result.diagnostics?.extractionMethod).toBe('HYBRID');
      expect(result.diagnostics?.ocrPagesList).toContain(2);
      ocrSpy.mockRestore();
    });
  });

  describe('5. Scenario 4 & 5: Image Extraction & Handwriting Detection', () => {
    it('should extract text from printed and handwritten image files', async () => {
      const printedImage = await createTextImage('Certified Document Signature and Approval');

      const ocrSpy = vi.spyOn(ocrProvider, 'recognizeText').mockResolvedValueOnce({
        text: 'Certified Document Signature and Approval',
        confidence: 0.95,
        isHandwritten: true,
        words: [
          { text: 'Certified', confidence: 0.95, bbox: { x0: 50, y0: 80, x1: 140, y1: 100 } },
          { text: 'Document', confidence: 0.95, bbox: { x0: 150, y0: 80, x1: 240, y1: 100 } },
        ],
        durationMs: 90,
      });

      const result = await imageExtractionService.extractImage(printedImage, 'note.png');

      expect(result.features.hasHandwriting).toBe(true);
      expect(result.pages[0].contentType).toBe('HANDWRITTEN');
      expect(result.features.wordCount).toBeGreaterThan(0);
      ocrSpy.mockRestore();
    });
  });

  describe('6. Scenario 6, 7 & 8: Tables, Formulas, and Charts Preservation', () => {
    it('should preserve tabular and formula features during layout reconstruction', async () => {
      const pdfBuffer = await createDigitalPdf([
        'Revenue Table\n| Q1 | $10M |\n| Q2 | $20M |\n\nFormula: E = mc^2\nFigure 1: Architecture Diagram',
      ]);

      const result = await pdfExtractionService.extractPdf(pdfBuffer, 'tech_report.pdf');
      expect(result.pages[0].hasTables).toBe(true);
      expect(result.pages[0].hasFormulas).toBe(true);
      expect(result.pages[0].hasCharts).toBe(true);
      expect(result.features.tableCount).toBeGreaterThan(0);
      expect(result.features.formulaCount).toBeGreaterThan(0);
    });
  });

  describe('7. Scenario 9: Empty/Corrupt Document Explicit Failure', () => {
    it('should reject zero-content documents without generating fake summaries', async () => {
      const emptyDoc: UnifiedDocument = {
        id: 'doc_empty_fail',
        sessionId: 'sess_fail',
        filename: 'empty.pdf',
        originalName: 'empty.pdf',
        mimeType: 'application/pdf',
        size: 100,
        hash: 'hash_empty',
        status: 'PROCESSING',
        progressPercent: 0,
        features: {
          pageCount: 1,
          wordCount: 0,
          readingTimeMinutes: 0,
          chartCount: 0,
          tableCount: 0,
          formulaCount: 0,
          imageCount: 0,
          hasHandwriting: false,
          isScanned: false,
          overallOcrConfidence: 0,
          documentType: 'PDF Document',
          language: 'English',
        },
        pages: [],
        extractedText: '',
        metadata: {},
        isAnonymous: true,
        createdAt: new Date().toISOString(),
      };

      // AI Provider must explicitly reject 0-content documents
      await expect(
        deterministicAIProvider.analyzeDocument(emptyDoc, { mode: 'balanced' })
      ).rejects.toThrow('DOCUMENT_CONTENT_UNREADABLE');
    });
  });

  describe('8. Scenario 11 & 12: Deduplication & Page Citations', () => {
    it('should not duplicate text when both native and OCR are processed and preserve page associations', async () => {
      const digitalPdfBuffer = await createDigitalPdf([
        'Page One:\nFinancial results for first fiscal quarter of 2026.\nRevenue reached record high across all categories.',
        'Page Two:\nTechnical milestone deliverables and release dates.\nConsolidated microservices achieved zero downtime.',
      ]);

      const result = await pdfExtractionService.extractPdf(digitalPdfBuffer, 'dedup_test.pdf');
      expect(result.pages.length).toBe(2);
      expect(result.pages[0].pageNumber).toBe(1);
      expect(result.pages[1].pageNumber).toBe(2);

      // Verify no duplicate repetitions on page 1
      const countPageOneOccurrences = (result.pages[0].text.match(/Financial results/g) || []).length;
      expect(countPageOneOccurrences).toBe(1);
    });
  });

  describe('9. Complete End-to-End Resolution of "1 page with 0 words" Bug', () => {
    it('should extract text from 0-selectable-text scanned PDF, update word count > 0, and generate grounded summary without placeholder text', async () => {
      // Create a scanned PDF that has 0 native text streams
      const scannedImageBuf = await createTextImage('Quarterly Operating Performance and Key Metrics Report');
      const scannedPdfBuffer = await createScannedPdfWithImage(scannedImageBuf);

      const ocrSpy = vi.spyOn(ocrProvider, 'recognizeText').mockResolvedValueOnce({
        text: 'Quarterly Operating Performance and Key Metrics Report: Total revenue achieved $50M with zero enterprise client churn across EMEA and APAC regions.',
        confidence: 0.96,
        isHandwritten: false,
        words: [
          { text: 'Quarterly', confidence: 0.96, bbox: { x0: 50, y0: 80, x1: 120, y1: 100 } },
          { text: 'Operating', confidence: 0.96, bbox: { x0: 130, y0: 80, x1: 200, y1: 100 } },
          { text: 'Performance', confidence: 0.96, bbox: { x0: 210, y0: 80, x1: 300, y1: 100 } },
          { text: 'Total', confidence: 0.96, bbox: { x0: 50, y0: 110, x1: 100, y1: 130 } },
          { text: 'revenue', confidence: 0.96, bbox: { x0: 110, y0: 110, x1: 170, y1: 130 } },
          { text: 'achieved', confidence: 0.96, bbox: { x0: 180, y0: 110, x1: 240, y1: 130 } },
          { text: '$50M', confidence: 0.96, bbox: { x0: 250, y0: 110, x1: 300, y1: 130 } },
        ],
        durationMs: 110,
      });

      // 1. Extract PDF with two-stage pipeline
      const extractionResult = await pdfExtractionService.extractPdf(scannedPdfBuffer, 'q4_scanned.pdf');

      // Assert that wordCount is NOT 0!
      expect(extractionResult.features.wordCount).toBeGreaterThan(5);
      expect(extractionResult.features.isScanned).toBe(true);
      expect(extractionResult.pages[0].text).toContain('$50M');

      // 2. Feed extracted document into AI analysis
      const unifiedDoc: UnifiedDocument = {
        id: 'doc_regression_verify',
        sessionId: 'sess_verify',
        filename: 'q4_scanned.pdf',
        originalName: 'q4_scanned.pdf',
        mimeType: 'application/pdf',
        size: scannedPdfBuffer.length,
        hash: 'hash_reg_verify',
        status: 'COMPLETE',
        progressPercent: 100,
        features: extractionResult.features,
        pages: extractionResult.pages,
        extractedText: extractionResult.extractedText,
        metadata: {},
        isAnonymous: true,
        createdAt: new Date().toISOString(),
      };

      const analysis = await deterministicAIProvider.analyzeDocument(unifiedDoc, { mode: 'brief' });

      // Assert that the generated summary is REAL and grounded, NOT a fake placeholder!
      expect(analysis.summary).toContain('$50M');
      expect(analysis.summary).not.toContain('contains 1 page(s) with 0 words');
      expect(analysis.summary).not.toContain('Primary content is categorized as');
      expect(analysis.summaries?.brief.wordCount).toBeGreaterThan(5);

      ocrSpy.mockRestore();
    });
  });
});
