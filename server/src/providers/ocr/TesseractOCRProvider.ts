import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { IOCRProvider, OCRResult, OCRWord } from './OCRProvider.js';
import { logger } from '../../config/logger.js';

export class TesseractOCRProvider implements IOCRProvider {
  public name = 'tesseract';
  private workerPromise: Promise<Tesseract.Worker> | null = null;

  private async getWorker(): Promise<Tesseract.Worker> {
    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        logger.info('Initializing Tesseract OCR worker...');
        const worker = await createWorker('eng');
        logger.info('Tesseract OCR worker initialized successfully');
        return worker;
      })();
    }
    return this.workerPromise;
  }

  /**
   * Adaptive Image Preprocessing:
   * Inspects image characteristics (resolution, channels, contrast) and applies
   * non-destructive normalization for printed text, scanned documents, and certificates.
   */
  async preprocessImage(
    imageBuffer: Buffer,
    options: { enhanceHandwriting?: boolean; isColorCertificate?: boolean } = {}
  ): Promise<Buffer> {
    try {
      let pipeline = sharp(imageBuffer).rotate(); // auto-rotate based on EXIF

      const metadata = await pipeline.metadata();
      const width = metadata.width || 1200;
      const height = metadata.height || 1600;

      // Upscale if too small, or downscale if excessively large for OCR efficiency
      if (width < 1000) {
        pipeline = pipeline.resize({ width: 1800, withoutEnlargement: false, fit: 'inside' });
      } else if (width > 2600 || height > 3400) {
        pipeline = pipeline.resize({ width: 2400, height: 3200, fit: 'inside' });
      }

      if (options.enhanceHandwriting) {
        // Handwriting enhancement: gentle contrast stretch and fine sharpening
        pipeline = pipeline
          .grayscale()
          .linear(1.2, -15)
          .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.0 });
      } else if (options.isColorCertificate) {
        // Preserve color context and apply mild sharpening
        pipeline = pipeline.sharpen({ sigma: 1.0 });
      } else {
        // Scanned & printed text cleanup: grayscale + adaptive contrast normalization
        pipeline = pipeline
          .grayscale()
          .normalize()
          .sharpen({ sigma: 1.0 });
      }

      return await pipeline.png({ compressionLevel: 6 }).toBuffer();
    } catch (err: any) {
      logger.warn({ error: err?.message }, 'Image preprocessing error. Using original buffer.');
      return imageBuffer;
    }
  }

  async recognizeText(
    imageBuffer: Buffer,
    options: { isHandwritingHint?: boolean; isColorCertificate?: boolean } = {}
  ): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      // Preprocess image adaptively
      const processedBuffer = await this.preprocessImage(imageBuffer, {
        enhanceHandwriting: options.isHandwritingHint,
        isColorCertificate: options.isColorCertificate,
      });

      const worker = await this.getWorker();
      const result = await worker.recognize(processedBuffer);

      const rawConfidence = result.data.confidence ?? 0;
      const normalizedConfidence = Math.max(0, Math.min(1, rawConfidence / 100));

      const words: OCRWord[] = (result.data.words || []).map((w: any) => ({
        text: w.text,
        confidence: Math.max(0, Math.min(1, (w.confidence ?? 0) / 100)),
        bbox: w.bbox
          ? {
              x0: w.bbox.x0,
              y0: w.bbox.y0,
              x1: w.bbox.x1,
              y1: w.bbox.y1,
            }
          : undefined,
      }));

      // Detect potential handwriting / low confidence signals honestly
      const lowConfidenceWords = words.filter((w) => w.confidence < 0.65).length;
      const isLikelyHandwritten =
        options.isHandwritingHint ||
        (words.length > 5 && lowConfidenceWords / words.length > 0.35 && normalizedConfidence < 0.75);

      let warning: string | undefined;
      if (normalizedConfidence < 0.60) {
        warning = 'LOW_CONFIDENCE_OCR: Text recognized with low confidence; manual verification recommended.';
      } else if (isLikelyHandwritten) {
        warning = 'HANDWRITING_DETECTED: Content appears handwritten; OCR interpreted best-effort without fabrication.';
      }

      const durationMs = Date.now() - startTime;
      logger.info(
        {
          wordsCount: words.length,
          confidence: normalizedConfidence.toFixed(2),
          isHandwritten: isLikelyHandwritten,
          durationMs,
        },
        'OCR completed'
      );

      return {
        text: result.data.text.trim(),
        confidence: normalizedConfidence,
        isHandwritten: isLikelyHandwritten,
        words,
        warning,
        durationMs,
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      logger.error({ error: error?.message, durationMs }, 'OCR recognition failed. Returning safe empty result.');
      return {
        text: '',
        confidence: 0,
        isHandwritten: false,
        words: [],
        warning: 'OCR extraction encountered an error; text could not be extracted from this image.',
        durationMs,
      };
    }
  }

  async terminate(): Promise<void> {
    if (this.workerPromise) {
      const worker = await this.workerPromise;
      await worker.terminate();
      this.workerPromise = null;
    }
  }
}

export const ocrProvider = new TesseractOCRProvider();
