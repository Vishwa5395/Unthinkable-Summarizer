import { PageModel, VisualElement, DocumentFeatures, ContentType, DocumentBlock } from '../../schemas/document.schema.js';
import { LayoutEngine } from '../../utils/LayoutEngine.js';
import { cleanText, countWords } from '../../utils/textProcessing.js';
import { ExtractionQualityEvaluator, PageQualityClassification } from './ExtractionQualityEvaluator.js';
import { PdfPageRenderer } from './PdfPageRenderer.js';
import { ocrProvider } from '../../providers/ocr/TesseractOCRProvider.js';
import { logger } from '../../config/logger.js';

export interface PdfExtractionDiagnostics {
  pages: number;
  nativePages: number;
  ocrPages: number;
  visualPages: number;
  nativeWordCount: number;
  ocrWordCount: number;
  finalWordCount: number;
  ocrPagesList: number[];
  averageOcrConfidence: number;
  extractionMethod: 'NATIVE' | 'OCR' | 'HYBRID';
  durationMs: number;
}

export interface PdfExtractionResult {
  pages: PageModel[];
  features: DocumentFeatures;
  extractedText: string;
  diagnostics?: PdfExtractionDiagnostics;
}

export class PdfExtractionService {
  async extractPdf(
    buffer: Buffer,
    filename: string,
    onProgress?: (progress: number, message: string) => void
  ): Promise<PdfExtractionResult> {
    const startTime = Date.now();
    logger.info({ filename, sizeBytes: buffer.length }, 'Starting robust two-stage hybrid PDF extraction & layout reconstruction');

    onProgress?.(10, 'Reading PDF structure, layout geometry and native content');

    // Load PDF using pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    });

    const pdfJsDoc = await loadingTask.promise;
    const pageCount = pdfJsDoc.numPages;

    const pages: PageModel[] = [];
    let totalNativeWordCount = 0;
    let totalOcrWordCount = 0;
    let totalCharts = 0;
    let totalTables = 0;
    let totalFormulas = 0;
    let totalImages = 0;
    let hasAnyHandwriting = false;
    let isScannedDoc = false;
    let ocrConfidenceSum = 0;
    let ocrPagesCount = 0;
    let nativePagesCount = 0;
    let visualPagesCount = 0;
    const ocrPagesList: number[] = [];

    for (let i = 0; i < pageCount; i++) {
      const pageNumber = i + 1;
      const progressPercent = 15 + Math.floor((i / pageCount) * 55);
      onProgress?.(progressPercent, `Analyzing layout and content on Page ${pageNumber} of ${pageCount}`);

      const page = await pdfJsDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();

      // Inspect operator list for images, vector paths, and graphical structures
      let pageHasImages = false;
      let pageHasVectors = false;
      try {
        const opList = await page.getOperatorList();
        for (let opIdx = 0; opIdx < opList.fnArray.length; opIdx++) {
          const fn = opList.fnArray[opIdx];
          if (
            fn === pdfjsLib.OPS.paintImageXObject ||
            fn === pdfjsLib.OPS.paintInlineImageXObject ||
            fn === pdfjsLib.OPS.paintImageMaskXObject
          ) {
            pageHasImages = true;
            totalImages++;
          } else if (
            fn === pdfjsLib.OPS.constructPath ||
            fn === pdfjsLib.OPS.stroke ||
            fn === pdfjsLib.OPS.fill
          ) {
            pageHasVectors = true;
          }
        }
      } catch {
        // Safe fallback
      }

      const visualElements: VisualElement[] = [];
      const detectedFeatures: string[] = [];

      // STAGE 1: Reconstruct Native Layout Hierarchically (Word -> Line -> Block with Column Awareness)
      const nativeLayout = LayoutEngine.reconstructPdfPageLayout(
        textContent.items as any,
        viewport.width,
        viewport.height,
        pageNumber,
        visualElements
      );

      let pageText = cleanText(nativeLayout.reconstructedText);
      let pageBlocks: DocumentBlock[] = nativeLayout.blocks;
      let pageWordCount = countWords(pageText);

      totalNativeWordCount += pageWordCount;

      const pageTables = pageBlocks.filter((b) => b.type === 'table').length;
      const pageFormulas = pageBlocks.filter((b) => b.type === 'formula').length;
      totalTables += pageTables;
      totalFormulas += pageFormulas;

      // STAGE 2: Multi-Signal Meaningful-Content Quality Evaluation
      const qualityResult = ExtractionQualityEvaluator.evaluatePage(pageText, {
        hasImages: pageHasImages,
        hasVectors: pageHasVectors,
        tableCount: pageTables,
        formulaCount: pageFormulas,
        blockCount: pageBlocks.length,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
      });

      let extractionMethod: 'NATIVE' | 'OCR' = 'NATIVE';
      let pageContentType: ContentType = 'TEXT';
      let pageConfidence = qualityResult.confidence;
      let pageIsHandwritten = false;
      let ocrText = '';

      if (qualityResult.needsOcr) {
        // Native text is insufficient, corrupted, or scanned -> Execute OCR Fallback on this page
        logger.info(
          {
            pageNumber,
            filename,
            classification: qualityResult.classification,
            reason: qualityResult.reason,
            nativeWords: pageWordCount,
          },
          'Page native extraction insufficient. Executing OCR fallback'
        );

        onProgress?.(
          progressPercent + 2,
          `Running OCR on Page ${pageNumber} of ${pageCount}`
        );

        ocrPagesCount++;
        ocrPagesList.push(pageNumber);
        isScannedDoc = true;

        // Render page or extract embedded image buffer
        const pageImageBuffer = await PdfPageRenderer.renderPageToImageBuffer(pdfJsDoc, pageNumber, 2.0);

        // Run OCR on rendered image
        const ocrResult = await ocrProvider.recognizeText(pageImageBuffer, {
          isHandwritingHint: pageIsHandwritten,
        });

        if (ocrResult.text && ocrResult.text.trim().length > 0) {
          // Reconstruct spatial layout from OCR word bounding boxes
          const ocrLayout = LayoutEngine.reconstructOcrPageLayout(
            ocrResult.words,
            Math.round(viewport.width),
            Math.round(viewport.height),
            pageNumber,
            visualElements
          );

          ocrText = cleanText(ocrLayout.reconstructedText || ocrResult.text);
          const ocrWords = countWords(ocrText);

          if (ocrWords > pageWordCount || qualityResult.classification === 'CORRUPTED_NATIVE') {
            // OCR produced superior readable content -> Precedence to OCR
            pageText = ocrText;
            pageBlocks = ocrLayout.blocks;
            pageWordCount = ocrWords;
            totalOcrWordCount += ocrWords;
            extractionMethod = 'OCR';
            pageContentType = ocrResult.isHandwritten ? 'HANDWRITTEN' : 'SCANNED';
            pageConfidence = ocrResult.confidence;
            pageIsHandwritten = ocrResult.isHandwritten;

            if (ocrResult.isHandwritten) {
              hasAnyHandwriting = true;
              detectedFeatures.push('Handwritten content');
            } else {
              detectedFeatures.push('Scanned page (OCR processed)');
            }

            ocrConfidenceSum += ocrResult.confidence;
          }
        } else {
          logger.debug({ pageNumber }, 'OCR on page produced no additional characters.');
          if (pageWordCount === 0 && (pageHasImages || pageHasVectors)) {
            pageContentType = 'IMAGE';
            visualPagesCount++;
            detectedFeatures.push('Visual / Diagram page');
          }
        }
      } else {
        nativePagesCount++;
        if (qualityResult.classification === 'VISUAL_HEAVY') {
          visualPagesCount++;
          pageContentType = 'MIXED';
          detectedFeatures.push('Visual-heavy / Technical content');
        }
      }

      // Feature Detection from final blocks
      if (pageTables > 0) {
        detectedFeatures.push(`${pageTables} Table(s)`);
      }
      if (pageFormulas > 0) {
        detectedFeatures.push('Mathematical formulas');
      }

      if (pageFormulas > 0 && pageTables > 0) {
        pageContentType = 'MIXED';
      } else if (pageFormulas > 0) {
        pageContentType = 'FORMULA';
      } else if (pageTables > 0) {
        pageContentType = 'TABLE';
      }

      // Check for chart / diagram keywords
      const hasChartKeywords = /\b(?:Figure\s+\d+|Chart\s+\d+|Graph\s+\d+|Diagram\s+\d+|Overview\s+Diagram)\b/i.test(pageText);
      if (hasChartKeywords) {
        totalCharts++;
        detectedFeatures.push('Chart / Diagram reference');
        visualElements.push({
          id: `vis-${pageNumber}-chart`,
          type: 'chart',
          description: `Diagram or visual chart identified on Page ${pageNumber}`,
          sourcePage: pageNumber,
          confidence: 0.9,
          extractedText: '',
          metadata: {},
        });
      }

      pages.push({
        pageNumber,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        text: pageText,
        ocrText,
        contentType: pageContentType,
        confidence: pageConfidence,
        isHandwritten: pageIsHandwritten,
        hasFormulas: pageFormulas > 0,
        hasTables: pageTables > 0,
        hasCharts: hasChartKeywords,
        blocks: pageBlocks,
        visualElements,
        detectedFeatures,
        wordCount: pageWordCount,
      });
    }

    // FINAL Word Count Calculation (after all native + OCR processing)
    const finalTotalWordCount = pages.reduce((sum, p) => sum + countWords(p.text), 0);
    const readingTimeMinutes = Math.max(1, Math.ceil(finalTotalWordCount / 200));
    const averageOcrConfidence = ocrPagesCount > 0 ? ocrConfidenceSum / ocrPagesCount : 1.0;

    let overallExtractionMethod: 'NATIVE' | 'OCR' | 'HYBRID' = 'NATIVE';
    if (ocrPagesCount === pageCount) {
      overallExtractionMethod = 'OCR';
    } else if (ocrPagesCount > 0) {
      overallExtractionMethod = 'HYBRID';
    }

    const features: DocumentFeatures = {
      pageCount,
      wordCount: finalTotalWordCount,
      readingTimeMinutes,
      chartCount: totalCharts,
      tableCount: totalTables,
      formulaCount: totalFormulas,
      imageCount: totalImages,
      hasHandwriting: hasAnyHandwriting,
      isScanned: isScannedDoc,
      overallOcrConfidence: averageOcrConfidence,
      documentType: isScannedDoc ? 'Scanned Document' : 'PDF Document',
      language: 'English',
    };

    const combinedExtractedText = pages.map((p) => p.text).filter(Boolean).join('\n\n');
    const durationMs = Date.now() - startTime;

    const diagnostics: PdfExtractionDiagnostics = {
      pages: pageCount,
      nativePages: nativePagesCount,
      ocrPages: ocrPagesCount,
      visualPages: visualPagesCount,
      nativeWordCount: totalNativeWordCount,
      ocrWordCount: totalOcrWordCount,
      finalWordCount: finalTotalWordCount,
      ocrPagesList,
      averageOcrConfidence,
      extractionMethod: overallExtractionMethod,
      durationMs,
    };

    logger.info(
      {
        filename,
        pages: pageCount,
        nativePages: nativePagesCount,
        ocrPages: ocrPagesCount,
        visualPages: visualPagesCount,
        nativeWords: totalNativeWordCount,
        ocrWords: totalOcrWordCount,
        finalWords: finalTotalWordCount,
        extractionMethod: overallExtractionMethod,
        averageOcrConfidence: (averageOcrConfidence * 100).toFixed(0) + '%',
        durationMs,
      },
      'Two-stage hybrid PDF extraction completed'
    );

    return {
      pages,
      features,
      extractedText: combinedExtractedText,
      diagnostics,
    };
  }
}

export const pdfExtractionService = new PdfExtractionService();
