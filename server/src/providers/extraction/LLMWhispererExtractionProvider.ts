import { IDocumentExtractionProvider, ExtractionInput, ExtractionResult } from './DocumentExtractionProvider.js';
import { LLMWhispererConfig, LLMWhispererMode } from '../../config/llmWhispererConfig.js';
import { PageModel, DocumentBlock, DocumentFeatures, BlockType, TableStructure, ContentType } from '../../schemas/document.schema.js';
import { cleanText } from '../../utils/textProcessing.js';
import { logger } from '../../config/logger.js';

export class LLMWhispererExtractionProvider implements IDocumentExtractionProvider {
  public name = 'llmwhisperer';
  private inCooldownUntil: number = 0;

  async isAvailable(): Promise<boolean> {
    if (!LLMWhispererConfig.isConfigured()) {
      return false;
    }
    if (Date.now() < this.inCooldownUntil) {
      return false;
    }
    return true;
  }

  /**
   * Intelligent Mode Selection based on document characteristics
   */
  public selectExtractionMode(input: ExtractionInput): LLMWhispererMode {
    if (input.preferredMode && ['native_text', 'low_cost', 'high_quality', 'form', 'table'].includes(input.preferredMode)) {
      return input.preferredMode as LLMWhispererMode;
    }

    const { filename, mimeType, buffer } = input;
    const lowerName = filename.toLowerCase();

    // 1. Check for Financial / Table-heavy documents
    if (
      lowerName.includes('financial') ||
      lowerName.includes('balance_sheet') ||
      lowerName.includes('income_statement') ||
      lowerName.includes('q1') ||
      lowerName.includes('q2') ||
      lowerName.includes('q3') ||
      lowerName.includes('q4') ||
      lowerName.includes('quarterly') ||
      lowerName.includes('table') ||
      lowerName.includes('pricing') ||
      lowerName.includes('invoice')
    ) {
      return 'table';
    }

    // 2. Check for Form / Application documents
    if (
      lowerName.includes('form') ||
      lowerName.includes('application') ||
      lowerName.includes('questionnaire') ||
      lowerName.includes('tax') ||
      lowerName.includes('w2') ||
      lowerName.includes('1040')
    ) {
      return 'form';
    }

    // 3. Check for Handwritten / Difficult scans
    if (
      lowerName.includes('handwriting') ||
      lowerName.includes('handwritten') ||
      lowerName.includes('note') ||
      lowerName.includes('memo') ||
      lowerName.includes('sketch') ||
      lowerName.includes('scan_poor')
    ) {
      return 'high_quality';
    }

    // 4. Images (JPG/PNG/WEBP)
    const isImage = mimeType.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(filename);
    if (isImage) {
      return 'high_quality';
    }

    // 5. Digital Text PDF
    const isPdf = mimeType.includes('pdf') || lowerName.endsWith('.pdf');
    if (isPdf) {
      // Quick inspect first 4KB for font/text markers
      const sample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('latin1');
      const hasFontMarkers = sample.includes('/Font') || sample.includes('/Type /Page') || sample.includes('/Contents');
      if (hasFontMarkers) {
        return 'native_text';
      }
      return 'low_cost';
    }

    return 'native_text';
  }

  /**
   * Main Document Extraction Pipeline using LLMWhisperer API v2
   */
  async extractDocument(
    input: ExtractionInput,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ExtractionResult> {
    const startTime = Date.now();
    const config = LLMWhispererConfig.getOptions();

    if (!config.apiKey) {
      throw new Error('LLMWhisperer API key is not configured');
    }

    if (Date.now() < this.inCooldownUntil) {
      const remainingSec = Math.ceil((this.inCooldownUntil - Date.now()) / 1000);
      throw new Error(`LLMWhisperer in rate-limit cooldown (${remainingSec}s remaining). Fallback required.`);
    }

    const mode = this.selectExtractionMode(input);
    logger.info(
      { documentId: input.documentId, filename: input.filename, mode, sizeBytes: input.buffer.length },
      'Submitting document to LLMWhisperer API v2'
    );

    onProgress?.(20, `Submitting document to LLMWhisperer (Mode: ${mode})`);

    // Build URL parameters
    const params = new URLSearchParams({
      mode,
      output_mode: 'layout_preserving',
      page_seperator: '<<<',
      store_metadata_for_highlighting: 'true',
    });

    if (mode === 'table') {
      params.append('mark_vertical_lines', 'true');
      params.append('mark_horizontal_lines', 'true');
    }

    const url = `${config.baseUrl}/whisper?${params.toString()}`;

    // Step 1: Submit to /whisper with bounded retries
    let submitResponse: Response;
    let attempt = 0;

    while (true) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

        submitResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'unstract-key': config.apiKey,
            'Content-Type': 'application/octet-stream',
          },
          body: input.buffer as any,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        break;
      } catch (err: any) {
        attempt++;
        if (attempt > config.maxRetries) {
          logger.error({ err: err.message, documentId: input.documentId }, 'Failed to submit document to LLMWhisperer');
          throw err;
        }
        await new Promise((res) => setTimeout(res, Math.pow(2, attempt) * 1000));
      }
    }

    // Handle HTTP status codes
    if (submitResponse.status === 429) {
      this.inCooldownUntil = Date.now() + 60000;
      throw new Error('LLMWhisperer Rate Limit reached (429). Entering 60s cooldown.');
    }

    if (submitResponse.status === 401 || submitResponse.status === 403) {
      throw new Error(`LLMWhisperer Authentication Failed (HTTP ${submitResponse.status}). Invalid API key.`);
    }

    if (!submitResponse.ok) {
      const errText = await submitResponse.text().catch(() => '');
      throw new Error(`LLMWhisperer API error HTTP ${submitResponse.status}: ${errText.substring(0, 200)}`);
    }

    // Step 2: Handle Synchronous (200) vs Asynchronous (202) Response
    let rawResultText = '';
    let rawConfidenceMeta: any[] = [];
    let rawMetadata: Record<string, unknown> = {};

    const submitJson = (await submitResponse.json().catch(() => null)) as any;

    if (submitResponse.status === 200 && submitJson && (submitJson.result_text || submitJson.extraction)) {
      // Synchronous completion
      rawResultText = submitJson.result_text || submitJson.extraction || '';
      rawConfidenceMeta = submitJson.confidence_metadata || [];
      rawMetadata = submitJson.metadata || {};
    } else if (submitJson && submitJson.whisper_hash) {
      // Asynchronous completion: Poll /whisper-status then GET /whisper-retrieve
      const whisperHash = submitJson.whisper_hash;
      logger.info({ whisperHash, documentId: input.documentId }, 'LLMWhisperer accepted job asynchronously; polling status');

      const retrievedData = await this.pollAndRetrieve(whisperHash, config, onProgress);
      rawResultText = retrievedData.result_text || '';
      rawConfidenceMeta = retrievedData.confidence_metadata || [];
      rawMetadata = retrievedData.metadata || {};
    } else if (typeof submitJson === 'string') {
      rawResultText = submitJson;
    } else {
      throw new Error('LLMWhisperer returned unexpected response format');
    }

    onProgress?.(80, 'Normalizing structured layout and tables from LLMWhisperer');

    // Step 3: Normalize LLMWhisperer Output into Unified Document Model
    const normalized = this.normalizeResponse(rawResultText, rawConfidenceMeta, rawMetadata, input, mode);

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        documentId: input.documentId,
        pageCount: normalized.pages.length,
        wordCount: normalized.features.wordCount,
        mode,
        durationMs,
      },
      'LLMWhisperer extraction & layout normalization completed successfully'
    );

    return {
      pages: normalized.pages,
      features: normalized.features,
      extractedText: normalized.extractedText,
      providerUsed: this.name,
      modeUsed: mode,
      rawMetadata: {
        ...rawMetadata,
        mode,
        durationMs,
      },
    };
  }

  /**
   * Helper: Poll /whisper-status until 'processed' and retrieve with /whisper-retrieve
   */
  private async pollAndRetrieve(
    whisperHash: string,
    config: { apiKey: string; baseUrl: string; timeoutMs: number; pollIntervalMs: number },
    onProgress?: (progress: number, message: string) => void
  ): Promise<{ result_text: string; metadata?: any; confidence_metadata?: any[] }> {
    const startTime = Date.now();
    let pollCount = 0;

    while (Date.now() - startTime < config.timeoutMs) {
      pollCount++;
      await new Promise((res) => setTimeout(res, config.pollIntervalMs));

      const progressVal = Math.min(75, 30 + pollCount * 5);
      onProgress?.(progressVal, 'Processing layout and extracting text with LLMWhisperer');

      const statusUrl = `${config.baseUrl}/whisper-status?whisper_hash=${encodeURIComponent(whisperHash)}`;
      const statusRes = await fetch(statusUrl, {
        headers: { 'unstract-key': config.apiKey },
      });

      if (statusRes.status === 429) {
        this.inCooldownUntil = Date.now() + 60000;
        throw new Error('LLMWhisperer Rate Limit reached during polling (429)');
      }

      if (!statusRes.ok) {
        logger.warn({ status: statusRes.status }, 'Status check warning from LLMWhisperer');
        continue;
      }

      const statusData = (await statusRes.json()) as any;
      const status = statusData?.status;

      if (status === 'processed') {
        // Ready for retrieval
        const retrieveUrl = `${config.baseUrl}/whisper-retrieve?whisper_hash=${encodeURIComponent(whisperHash)}&text_only=false`;
        const retrieveRes = await fetch(retrieveUrl, {
          headers: { 'unstract-key': config.apiKey },
        });

        if (!retrieveRes.ok) {
          throw new Error(`LLMWhisperer retrieval failed (HTTP ${retrieveRes.status})`);
        }

        const retrieveData = (await retrieveRes.json()) as any;
        return retrieveData;
      }

      if (status === 'error' || status === 'failed') {
        throw new Error(`LLMWhisperer document processing failed: ${statusData?.message || 'Unknown provider error'}`);
      }
    }

    throw new Error(`LLMWhisperer processing timed out after ${Math.round(config.timeoutMs / 1000)}s`);
  }

  /**
   * Helper: Normalize raw LLMWhisperer output into Unified Document Schema
   */
  public normalizeResponse(
    rawText: string,
    confidenceMeta: any[],
    metadata: Record<string, unknown>,
    input: ExtractionInput,
    mode: LLMWhispererMode
  ): {
    pages: PageModel[];
    features: DocumentFeatures;
    extractedText: string;
  } {
    if (!rawText || !rawText.trim()) {
      return {
        pages: [],
        features: {
          pageCount: 1,
          wordCount: 0,
          readingTimeMinutes: 1,
          chartCount: 0,
          tableCount: 0,
          formulaCount: 0,
          imageCount: 0,
          hasHandwriting: false,
          isScanned: false,
          overallOcrConfidence: 1.0,
          documentType: 'General Document',
          language: 'English',
        },
        extractedText: '',
      };
    }

    // Split pages by LLMWhisperer separator ('<<<' or form feeds '\x0c')
    const rawPages = rawText
      .split(/(?:<<<|\x0c)/)
      .map((p) => p.trim())
      .filter(Boolean);

    const pages: PageModel[] = [];
    let totalWordCount = 0;
    let totalTables = 0;
    let totalFormulas = 0;
    let totalCharts = 0;
    let confidenceSum = 0;
    let confidenceCount = 0;

    for (let pIdx = 0; pIdx < rawPages.length; pIdx++) {
      const pageNumber = pIdx + 1;
      const pageRawText = rawPages[pIdx];
      const pageLines = pageRawText.split('\n').map((l) => l.trimEnd());

      const blocks: DocumentBlock[] = [];
      let blockOrder = 1;
      let currentParagraphLines: string[] = [];
      let currentSectionTitle = '';
      let pageTableCount = 0;
      let pageFormulaCount = 0;

      const flushParagraph = () => {
        if (currentParagraphLines.length === 0) return;
        const text = currentParagraphLines.join('\n').trim();
        if (!text) {
          currentParagraphLines = [];
          return;
        }

        const isFormula = /(?:[∑∫∏√≈≠≤≥±×÷]|\\(?:frac|sum|int|alpha|beta)|(?:\b[a-zA-Z]\s*=\s*[\d\w\s+\-*/^()]{3,}))/i.test(text);
        const isCaption = /^(?:Figure|Fig\.|Chart|Graph|Diagram|Table)\s+\d+[:.\s-]/im.test(text);
        const isList = /(?:^[•\-*]|\n[•\-*]|\b\d+\.|\([a-z0-9]\))\s+/im.test(text);

        let type: BlockType = 'paragraph';
        if (isFormula) {
          type = 'formula';
          pageFormulaCount++;
        } else if (isCaption) {
          type = 'caption';
        } else if (isList) {
          type = 'list';
        }

        // Check if confidence score exists for this page
        const pageConf = confidenceMeta && confidenceMeta[pIdx]?.confidence ? confidenceMeta[pIdx].confidence / 100 : 0.95;
        confidenceSum += pageConf;
        confidenceCount++;

        blocks.push({
          id: `page-${pageNumber}-block-${blockOrder}`,
          pageNumber,
          type,
          text,
          bbox: {
            x: 0,
            y: 0,
            width: 595,
            height: 842,
            normalized: { x: 0, y: 0, width: 1, height: 1 },
          },
          confidence: pageConf,
          readingOrder: blockOrder++,
          columnIndex: 0,
          sectionTitle: currentSectionTitle || undefined,
          isHeaderOrFooter: false,
        });

        currentParagraphLines = [];
      };

      for (let lIdx = 0; lIdx < pageLines.length; lIdx++) {
        const line = pageLines[lIdx];
        const trimmed = line.trim();
        if (!trimmed) {
          flushParagraph();
          continue;
        }

        // Heading detection
        const isHeading =
          trimmed.startsWith('#') ||
          /^(?:[0-9]+(?:\.[0-9]+)*|[A-Z]\.|(?:Section|Chapter|Part)\s+[0-9IVX]+)\s+[\w\s]{3,60}$/i.test(trimmed) ||
          (trimmed.length < 50 && /^[A-Z0-9\s,\-–—:]{4,50}$/.test(trimmed) && !trimmed.endsWith('.'));

        // Table row detection (pipe tables or ASCII borders from mark_vertical_lines)
        const isTableLine =
          (trimmed.startsWith('|') && trimmed.endsWith('|')) ||
          (trimmed.includes('+---') || trimmed.includes('+===') || trimmed.includes('|---'));

        if (isHeading) {
          flushParagraph();
          currentSectionTitle = trimmed.replace(/^#+\s*/, '').trim();
          blocks.push({
            id: `page-${pageNumber}-block-${blockOrder}`,
            pageNumber,
            type: 'heading',
            text: trimmed,
            bbox: {
              x: 0,
              y: 0,
              width: 595,
              height: 40,
              normalized: { x: 0, y: 0, width: 1, height: 0.05 },
            },
            confidence: 1.0,
            readingOrder: blockOrder++,
            level: trimmed.startsWith('###') ? 3 : trimmed.startsWith('##') ? 2 : 1,
            columnIndex: 0,
            sectionTitle: currentSectionTitle,
            isHeaderOrFooter: false,
          });
        } else if (isTableLine) {
          flushParagraph();
          // Collect full table
          const tableLines: string[] = [line];
          while (lIdx + 1 < pageLines.length) {
            const next = pageLines[lIdx + 1].trim();
            const nextIsTable =
              (next.startsWith('|') && next.endsWith('|')) ||
              (next.includes('+---') || next.includes('+===') || next.includes('|---'));
            if (nextIsTable) {
              tableLines.push(pageLines[lIdx + 1]);
              lIdx++;
            } else {
              break;
            }
          }

          const tableStructure = this.parseTableStructure(tableLines);
          pageTableCount++;

          blocks.push({
            id: `page-${pageNumber}-table-${blockOrder}`,
            pageNumber,
            type: 'table',
            text: tableLines.join('\n'),
            bbox: {
              x: 0,
              y: 0,
              width: 595,
              height: 200,
              normalized: { x: 0, y: 0, width: 1, height: 0.25 },
            },
            confidence: 0.95,
            readingOrder: blockOrder++,
            tableData: tableStructure,
            columnIndex: 0,
            sectionTitle: currentSectionTitle || undefined,
            isHeaderOrFooter: false,
          });
        } else {
          currentParagraphLines.push(line);
        }
      }

      flushParagraph();

      const pageCleanText = cleanText(pageRawText);
      const pageWordCount = pageCleanText.split(/\s+/).filter(Boolean).length;
      totalWordCount += pageWordCount;
      totalTables += pageTableCount;
      totalFormulas += pageFormulaCount;

      let contentType: ContentType = 'TEXT';
      if (mode === 'high_quality') {
        contentType = 'HANDWRITTEN';
      } else if (pageTableCount > 0 && pageFormulaCount > 0) {
        contentType = 'MIXED';
      } else if (pageTableCount > 0) {
        contentType = 'TABLE';
      } else if (pageFormulaCount > 0) {
        contentType = 'FORMULA';
      }

      pages.push({
        pageNumber,
        width: 595,
        height: 842,
        text: pageCleanText,
        ocrText: '',
        contentType,
        confidence: 0.95,
        isHandwritten: mode === 'high_quality',
        hasFormulas: pageFormulaCount > 0,
        hasTables: pageTableCount > 0,
        hasCharts: false,
        blocks,
        visualElements: [],
        detectedFeatures: [
          `LLMWhisperer Mode: ${mode}`,
          ...(pageTableCount > 0 ? [`${pageTableCount} Table(s)`] : []),
          ...(pageFormulaCount > 0 ? ['Formulas'] : []),
        ],
        wordCount: pageWordCount,
      });
    }

    const overallOcrConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0.95;
    const readingTimeMinutes = Math.max(1, Math.ceil(totalWordCount / 200));

    const features: DocumentFeatures = {
      pageCount: pages.length,
      wordCount: totalWordCount,
      readingTimeMinutes,
      chartCount: totalCharts,
      tableCount: totalTables,
      formulaCount: totalFormulas,
      imageCount: 0,
      hasHandwriting: mode === 'high_quality',
      isScanned: mode === 'low_cost' || mode === 'high_quality',
      overallOcrConfidence,
      documentType: 'Document',
      language: 'English',
    };

    const combinedExtractedText = pages.map((p) => p.text).join('\n\n');

    return {
      pages,
      features,
      extractedText: combinedExtractedText,
    };
  }

  /**
   * Helper: Parse ASCII or Markdown table lines into structured TableStructure
   */
  private parseTableStructure(lines: string[]): TableStructure {
    const cleanLines = lines
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('+') && !l.startsWith('|---') && !l.startsWith('|:---'));

    if (cleanLines.length === 0) {
      return { headers: [], rows: [], rowCount: 0, colCount: 0 };
    }

    const rows = cleanLines.map((line) =>
      line
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
    ).filter((r) => r.length > 0);

    const headers = rows[0] || [];
    const bodyRows = rows.slice(1);

    return {
      headers,
      rows: bodyRows,
      rowCount: rows.length,
      colCount: headers.length,
    };
  }
}

export const llmWhispererExtractionProvider = new LLMWhispererExtractionProvider();
