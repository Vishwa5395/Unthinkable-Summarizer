import { countWords, cleanText } from '../../utils/textProcessing.js';

export type PageQualityClassification =
  | 'RELIABLE_NATIVE'
  | 'WEAK_NATIVE'
  | 'SCANNED'
  | 'CORRUPTED_NATIVE'
  | 'VISUAL_HEAVY';

export interface MultiSignalQualityResult {
  classification: PageQualityClassification;
  needsOcr: boolean;
  isMeaningful: boolean;
  confidence: number;
  reason: string;
  metrics: {
    wordCount: number;
    characterCount: number;
    alphanumericRatio: number;
    whitespaceRatio: number;
    repeatedCharRatio: number;
    avgTokenLength: number;
    printableRatio: number;
    blockCount: number;
    textDensity: number;
    hasImages: boolean;
    hasVectors: boolean;
    isFragmented: boolean;
    isCorruptedGlyphs: boolean;
    isVisualHeavy: boolean;
  };
}

export interface PageMetadataSignals {
  hasImages?: boolean;
  hasVectors?: boolean;
  tableCount?: number;
  formulaCount?: number;
  chartCount?: number;
  blockCount?: number;
  pageWidth?: number;
  pageHeight?: number;
}

export class ExtractionQualityEvaluator {
  /**
   * Evaluates if extracted text and spatial metadata from a single page is meaningful,
   * corrupted, scanned, or visual-heavy using multi-signal heuristics.
   */
  static evaluatePage(
    rawText: string,
    signals: PageMetadataSignals = {}
  ): MultiSignalQualityResult {
    const pageWidth = signals.pageWidth || 595;
    const pageHeight = signals.pageHeight || 842;
    const pageArea = (pageWidth * pageHeight) / 10000; // 100x100 pt units

    const text = rawText || '';
    const cleaned = cleanText(text);
    const totalChars = text.length;
    const wordCount = countWords(cleaned);

    const blocksCount = signals.blockCount ?? 0;
    const hasImages = !!signals.hasImages;
    const hasVectors = !!signals.hasVectors;
    const tableCount = signals.tableCount ?? 0;
    const formulaCount = signals.formulaCount ?? 0;
    const chartCount = signals.chartCount ?? 0;

    // 1. Edge Case: Completely empty text
    if (totalChars === 0 || wordCount === 0) {
      const isPureVisual = hasImages || hasVectors || chartCount > 0 || formulaCount > 0 || tableCount > 0;
      if (isPureVisual) {
        return {
          classification: 'SCANNED',
          needsOcr: true,
          isMeaningful: true,
          confidence: 0.85,
          reason: 'Page contains visual/image elements but 0 selectable text. OCR fallback required.',
          metrics: {
            wordCount: 0,
            characterCount: 0,
            alphanumericRatio: 0,
            whitespaceRatio: 0,
            repeatedCharRatio: 0,
            avgTokenLength: 0,
            printableRatio: 1,
            blockCount: blocksCount,
            textDensity: 0,
            hasImages,
            hasVectors,
            isFragmented: false,
            isCorruptedGlyphs: false,
            isVisualHeavy: true,
          },
        };
      }

      return {
        classification: 'SCANNED',
        needsOcr: true,
        isMeaningful: false,
        confidence: 0.0,
        reason: 'Empty page with 0 selectable words and no visual structures.',
        metrics: {
          wordCount: 0,
          characterCount: 0,
          alphanumericRatio: 0,
          whitespaceRatio: 0,
          repeatedCharRatio: 0,
          avgTokenLength: 0,
          printableRatio: 1,
          blockCount: 0,
          textDensity: 0,
          hasImages: false,
          hasVectors: false,
          isFragmented: false,
          isCorruptedGlyphs: false,
          isVisualHeavy: false,
        },
      };
    }

    // 2. Compute Character and Token Metrics
    const alphanumericMatches = text.match(/[\p{L}\p{N}]/gu) || [];
    const alphanumericCount = alphanumericMatches.length;
    const alphanumericRatio = alphanumericCount / Math.max(1, totalChars);

    const whitespaceCount = (text.match(/\s/g) || []).length;
    const whitespaceRatio = whitespaceCount / Math.max(1, totalChars);

    const printableMatches = text.match(/[\x20-\x7E\p{L}\p{N}\p{P}\p{S}\n\r\t]/gu) || [];
    const printableRatio = printableMatches.length / Math.max(1, totalChars);

    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const avgTokenLength =
      tokens.length > 0 ? tokens.reduce((sum, t) => sum + t.length, 0) / tokens.length : 0;

    // Detect repeated garbage characters (e.g. ".......", "######", "$$$$$")
    const repeatedCharMatches = text.match(/(.)\1{4,}/g) || [];
    const repeatedCharsLength = repeatedCharMatches.reduce((sum, m) => sum + m.length, 0);
    const repeatedCharRatio = repeatedCharsLength / Math.max(1, totalChars);

    // Text density per unit area
    const textDensity = alphanumericCount / Math.max(1, pageArea);

    // Fragmented text detection (e.g. single character tokens spread out)
    const singleCharTokens = tokens.filter((t) => t.length === 1 && !/^[aAiI0-9]$/.test(t)).length;
    const isFragmented = tokens.length > 5 && singleCharTokens / tokens.length > 0.45;

    // Glyph / encoding corruption detection (e.g. replacement chars  or non-printable garbage)
    const replacementChars = (text.match(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
    const isCorruptedGlyphs =
      replacementChars > 3 || printableRatio < 0.8 || (alphanumericRatio < 0.25 && totalChars > 20);

    // Check if visual-heavy (certificate, title page, formula sheet, chart page, diagram)
    const isVisualHeavy =
      chartCount > 0 ||
      formulaCount > 0 ||
      tableCount > 0 ||
      (hasImages && wordCount < 30) ||
      (hasVectors && wordCount < 30);

    // 3. Classify Page Quality
    if (isCorruptedGlyphs) {
      return {
        classification: 'CORRUPTED_NATIVE',
        needsOcr: true,
        isMeaningful: false,
        confidence: 0.2,
        reason: 'Native text exhibits glyph encoding corruption or low printable character ratio. OCR fallback required.',
        metrics: {
          wordCount,
          characterCount: totalChars,
          alphanumericRatio,
          whitespaceRatio,
          repeatedCharRatio,
          avgTokenLength,
          printableRatio,
          blockCount: blocksCount,
          textDensity,
          hasImages,
          hasVectors,
          isFragmented,
          isCorruptedGlyphs: true,
          isVisualHeavy,
        },
      };
    }

    if (repeatedCharRatio > 0.4 || (isFragmented && wordCount < 20)) {
      return {
        classification: 'WEAK_NATIVE',
        needsOcr: true,
        isMeaningful: false,
        confidence: 0.3,
        reason: 'Native text is fragmented or contains high repetitive noise patterns.',
        metrics: {
          wordCount,
          characterCount: totalChars,
          alphanumericRatio,
          whitespaceRatio,
          repeatedCharRatio,
          avgTokenLength,
          printableRatio,
          blockCount: blocksCount,
          textDensity,
          hasImages,
          hasVectors,
          isFragmented,
          isCorruptedGlyphs: false,
          isVisualHeavy,
        },
      };
    }

    // Check if sparse text on a scanned image (e.g. OCR in PDF returned only 2-3 watermark words)
    if (hasImages && wordCount < 10 && alphanumericCount < 40) {
      return {
        classification: 'SCANNED',
        needsOcr: true,
        isMeaningful: isVisualHeavy,
        confidence: 0.5,
        reason: 'Page is primarily an embedded raster image with minimal native text. Running OCR fallback for full extraction.',
        metrics: {
          wordCount,
          characterCount: totalChars,
          alphanumericRatio,
          whitespaceRatio,
          repeatedCharRatio,
          avgTokenLength,
          printableRatio,
          blockCount: blocksCount,
          textDensity,
          hasImages,
          hasVectors,
          isFragmented,
          isCorruptedGlyphs: false,
          isVisualHeavy,
        },
      };
    }

    if (isVisualHeavy && wordCount < 15) {
      return {
        classification: 'VISUAL_HEAVY',
        needsOcr: false,
        isMeaningful: true,
        confidence: 0.9,
        reason: 'Page is legitimate visual-heavy content (diagram, chart, formula, certificate) with concise text.',
        metrics: {
          wordCount,
          characterCount: totalChars,
          alphanumericRatio,
          whitespaceRatio,
          repeatedCharRatio,
          avgTokenLength,
          printableRatio,
          blockCount: blocksCount,
          textDensity,
          hasImages,
          hasVectors,
          isFragmented,
          isCorruptedGlyphs: false,
          isVisualHeavy: true,
        },
      };
    }

    // Standard Reliable Native Text
    return {
      classification: 'RELIABLE_NATIVE',
      needsOcr: false,
      isMeaningful: true,
      confidence: 0.98,
      reason: 'High quality structured native text with high alphanumeric ratio and natural token length.',
      metrics: {
        wordCount,
        characterCount: totalChars,
        alphanumericRatio,
        whitespaceRatio,
        repeatedCharRatio,
        avgTokenLength,
        printableRatio,
        blockCount: blocksCount,
        textDensity,
        hasImages,
        hasVectors,
        isFragmented: false,
        isCorruptedGlyphs: false,
        isVisualHeavy,
      },
    };
  }

  /**
   * Backward-compatible helper for single text strings
   */
  static evaluatePageText(
    text: string,
    pageWidth: number = 595,
    pageHeight: number = 842
  ): { isMeaningful: boolean; reason: string; wordCount: number; characterCount: number; confidence: number } {
    const res = this.evaluatePage(text, { pageWidth, pageHeight });
    return {
      isMeaningful: res.isMeaningful && !res.needsOcr,
      reason: res.reason,
      wordCount: res.metrics.wordCount,
      characterCount: res.metrics.characterCount,
      confidence: res.confidence,
    };
  }

  /**
   * Evaluates overall document extraction quality across all pages
   */
  static evaluateDocument(
    pages: Array<{ text: string; wordCount: number; hasImages?: boolean; visualElements?: any[] }>,
    totalWordCount: number
  ): { isMeaningful: boolean; reason: string; pagesNeedingOcr: number[] } {
    if (pages.length === 0) {
      return {
        isMeaningful: false,
        reason: 'Document has 0 pages',
        pagesNeedingOcr: [],
      };
    }

    const pagesNeedingOcr: number[] = [];
    let meaningfulPagesCount = 0;
    let visualPagesCount = 0;

    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const evalResult = this.evaluatePage(p.text, {
        hasImages: p.hasImages,
        chartCount: (p.visualElements || []).filter((v) => v.type === 'chart').length,
      });

      if (evalResult.needsOcr) {
        pagesNeedingOcr.push(i + 1);
      }
      if (evalResult.isMeaningful) {
        meaningfulPagesCount++;
      }
      if (evalResult.classification === 'VISUAL_HEAVY') {
        visualPagesCount++;
      }
    }

    const isMeaningful = meaningfulPagesCount > 0 || visualPagesCount > 0 || totalWordCount >= 5;

    return {
      isMeaningful,
      reason: isMeaningful
        ? `${meaningfulPagesCount}/${pages.length} meaningful pages (${pagesNeedingOcr.length} needing OCR)`
        : 'All pages lack meaningful readable content',
      pagesNeedingOcr,
    };
  }
}
