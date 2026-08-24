import { IDocumentExtractionProvider, ExtractionInput, ExtractionResult } from './DocumentExtractionProvider.js';
import { pdfExtractionService } from '../../services/document/PdfExtractionService.js';
import { imageExtractionService } from '../../services/document/ImageExtractionService.js';
import { logger } from '../../config/logger.js';

export class LocalFallbackExtractionProvider implements IDocumentExtractionProvider {
  public name = 'local-fallback';

  async isAvailable(): Promise<boolean> {
    return true; // Always available offline
  }

  async extractDocument(
    input: ExtractionInput,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ExtractionResult> {
    const { buffer, filename, mimeType, documentId } = input;
    const isPdf = mimeType.includes('pdf') || filename.toLowerCase().endsWith('.pdf');

    logger.info({ documentId, filename, isPdf }, 'Executing LocalFallback extraction pipeline');

    if (isPdf) {
      const res = await pdfExtractionService.extractPdf(buffer, filename, onProgress);
      return {
        pages: res.pages,
        features: res.features,
        extractedText: res.extractedText,
        providerUsed: this.name,
        modeUsed: 'local-pdfjs-layout',
      };
    } else {
      const res = await imageExtractionService.extractImage(buffer, filename, onProgress);
      return {
        pages: res.pages,
        features: res.features,
        extractedText: res.extractedText,
        providerUsed: this.name,
        modeUsed: 'local-tesseract-ocr',
      };
    }
  }
}

export const localFallbackExtractionProvider = new LocalFallbackExtractionProvider();
