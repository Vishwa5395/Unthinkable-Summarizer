import sharp from 'sharp';
import { PageModel, VisualElement, DocumentFeatures, ContentType } from '../../schemas/document.schema.js';
import { ocrProvider } from '../../providers/ocr/TesseractOCRProvider.js';
import { LayoutEngine } from '../../utils/LayoutEngine.js';
import { cleanText, countWords } from '../../utils/textProcessing.js';
import { logger } from '../../config/logger.js';

export interface ImageExtractionResult {
  pages: PageModel[];
  features: DocumentFeatures;
  extractedText: string;
}

export class ImageExtractionService {
  async extractImage(
    buffer: Buffer,
    filename: string,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ImageExtractionResult> {
    const startTime = Date.now();
    logger.info({ filename, sizeBytes: buffer.length }, 'Starting Image extraction & spatial OCR pipeline');

    onProgress?.(25, 'Preprocessing image and analyzing visual layout');

    // Inspect image metadata
    const imageInfo = await sharp(buffer).metadata();
    const imageWidth = imageInfo.width || 1200;
    const imageHeight = imageInfo.height || 1600;

    // Run OCR with handwriting enhancement
    onProgress?.(50, 'Running optical character and handwriting recognition');
    const ocrResult = await ocrProvider.recognizeText(buffer, { isHandwritingHint: true });

    // Feature Detection
    const detectedFeatures: string[] = [];
    const visualElements: VisualElement[] = [];

    // Reconstruct Layout Hierarchically from OCR word bounding boxes
    const layoutResult = LayoutEngine.reconstructOcrPageLayout(
      ocrResult.words,
      imageWidth,
      imageHeight,
      1,
      visualElements
    );

    const cleanRecognizedText = cleanText(layoutResult.reconstructedText || ocrResult.text);
    const wordCount = countWords(cleanRecognizedText);
    const blocks = layoutResult.blocks;

    let contentType: ContentType = 'IMAGE';

    if (ocrResult.isHandwritten) {
      contentType = 'HANDWRITTEN';
      detectedFeatures.push('Handwritten text');
      visualElements.push({
        id: 'vis-1-handwriting',
        type: 'handwriting',
        description: 'Handwritten notes or annotations detected',
        extractedText: cleanRecognizedText.substring(0, 100),
        confidence: ocrResult.confidence,
        sourcePage: 1,
        boundingBox: {
          x: 0,
          y: 0,
          width: imageWidth,
          height: imageHeight,
          normalized: { x: 0, y: 0, width: 1, height: 1 },
        },
        metadata: {},
      });
    } else if (cleanRecognizedText.length > 50) {
      contentType = 'TEXT';
      detectedFeatures.push('Printed text image');
    }

    const pageTables = blocks.filter((b) => b.type === 'table').length;
    const pageFormulas = blocks.filter((b) => b.type === 'formula').length;

    if (pageFormulas > 0) {
      detectedFeatures.push('Formulas / Math expressions');
    }
    if (pageTables > 0) {
      detectedFeatures.push('Table or tabular structure');
    }

    const page: PageModel = {
      pageNumber: 1,
      width: imageWidth,
      height: imageHeight,
      text: cleanRecognizedText,
      ocrText: cleanRecognizedText,
      contentType,
      confidence: ocrResult.confidence,
      isHandwritten: ocrResult.isHandwritten,
      hasFormulas: pageFormulas > 0,
      hasTables: pageTables > 0,
      hasCharts: false,
      blocks,
      visualElements,
      detectedFeatures,
      wordCount,
    };

    const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

    const features: DocumentFeatures = {
      pageCount: 1,
      wordCount,
      readingTimeMinutes,
      chartCount: 0,
      tableCount: pageTables,
      formulaCount: pageFormulas,
      imageCount: 1,
      hasHandwriting: ocrResult.isHandwritten,
      isScanned: false,
      overallOcrConfidence: ocrResult.confidence,
      documentType: ocrResult.isHandwritten ? 'Handwritten Image Note' : 'Document Image',
      language: 'English',
    };

    onProgress?.(85, 'Finalizing image intelligence extraction');

    const durationMs = Date.now() - startTime;
    logger.info(
      { filename, wordCount, blocksCount: blocks.length, confidence: ocrResult.confidence.toFixed(2), durationMs },
      'Image extraction & spatial layout reconstruction completed'
    );

    return {
      pages: [page],
      features,
      extractedText: cleanRecognizedText,
    };
  }
}

export const imageExtractionService = new ImageExtractionService();
