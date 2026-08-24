import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { UnifiedDocument, DocumentFeatures, SummaryMode } from '../../schemas/document.schema.js';
import { validateFileBuffer, sanitizeFilename } from '../../utils/fileValidation.js';
import { ExtractionProviderFactory } from '../../providers/extraction/ExtractionProviderFactory.js';
import { processingQueue, QueueJob } from '../queue/ProcessingQueue.js';
import { AIProviderFactory } from '../../providers/ai/AIProviderFactory.js';
import { memoryStore } from '../../models/MemoryStore.js';
import { DocumentModel } from '../../models/Document.js';
import { DocumentAnalysisModel } from '../../models/DocumentAnalysis.js';
import { isDbConnected } from '../../config/db.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export class DocumentPipelineService {
  constructor() {
    // Register pipeline processor with the queue
    processingQueue.setProcessor(this.processDocumentJob.bind(this));
  }

  async createUploadJob(
    buffer: Buffer,
    originalFilename: string,
    declaredMimeType: string,
    sessionId: string,
    userId?: string
  ): Promise<UnifiedDocument> {
    const correlationId = `req_${uuidv4().replace(/-/g, '').substring(0, 8)}`;
    const docId = `doc_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
    const cleanName = sanitizeFilename(originalFilename);

    logger.info({ correlationId, docId, filename: cleanName, sizeBytes: buffer.length }, 'Initiating document upload job');

    const validation = await validateFileBuffer(
      buffer,
      originalFilename,
      declaredMimeType,
      env.MAX_FILE_SIZE_MB * 1024 * 1024
    );

    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid document file');
    }

    // Save temporary file to disk for streaming/viewer access
    const tempDir = path.resolve(process.cwd(), env.UPLOAD_TEMP_DIR);
    await fs.mkdir(tempDir, { recursive: true });
    const storagePath = path.join(tempDir, `${docId}_${cleanName}`);
    await fs.writeFile(storagePath, buffer);

    const initialDoc: UnifiedDocument = {
      id: docId,
      sessionId,
      userId,
      filename: cleanName,
      originalName: originalFilename,
      mimeType: validation.mimeType,
      size: validation.size || buffer.length,
      hash: validation.hash || '',
      status: 'QUEUED',
      statusMessage: 'Queued for processing',
      progressPercent: 5,
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
      pages: [],
      extractedText: '',
      metadata: {
        detectedType: validation.detectedType,
        correlationId,
      },
      storagePath,
      isAnonymous: !userId,
      createdAt: new Date().toISOString(),
    };

    // Save initial document record
    memoryStore.saveDocument(initialDoc);

    if (isDbConnected()) {
      try {
        await DocumentModel.create({
          ...initialDoc,
          _id: undefined,
        });
      } catch (err) {
        logger.warn({ docId, err }, 'Failed to persist initial document to MongoDB');
      }
    }

    // Add to processing queue
    await processingQueue.addJob({
      documentId: docId,
      sessionId,
      buffer,
      filename: cleanName,
      originalName: originalFilename,
      mimeType: validation.mimeType,
      size: validation.size || buffer.length,
      hash: validation.hash || '',
    });

    return initialDoc;
  }

  private async processDocumentJob(job: QueueJob): Promise<void> {
    const { documentId, buffer, mimeType, filename, originalName, hash, sessionId } = job;
    const startTime = Date.now();
    logger.info({ documentId, filename }, 'Executing document processing pipeline');

    try {
      // 1. VALIDATING
      await processingQueue.updateJobState(documentId, 'VALIDATING', 'Validating file integrity and format', 15);

      // 2. EXTRACTING
      await processingQueue.updateJobState(
        documentId,
        'EXTRACTING',
        'Extracting layout, structure, and text',
        25
      );

      const extractionExecution = await ExtractionProviderFactory.extractWithFallback(
        {
          buffer,
          filename,
          mimeType,
          fileHash: hash,
          documentId,
          sessionId,
        },
        (progress, message) => {
          processingQueue.updateJobState(documentId, 'EXTRACTING', message, progress);
        }
      );

      const extractionResult = extractionExecution.result;

      const doc = memoryStore.getDocument(documentId);
      if (!doc) throw new Error('Document record not found during processing');

      // 3. NORMALIZING
      await processingQueue.updateJobState(
        documentId,
        'NORMALIZING',
        'Normalizing page layout, features, and word counts',
        70
      );

      doc.pages = extractionResult.pages;
      doc.features = extractionResult.features;
      doc.extractedText = extractionResult.extractedText;
      doc.status = 'READY';
      doc.statusMessage = 'Document extracted and normalized. Ready for analysis.';
      doc.progressPercent = 75;
      doc.metadata = {
        ...doc.metadata,
        extractionProvider: extractionExecution.providerUsed,
        extractionMode: extractionResult.modeUsed,
        isExtractionCached: extractionExecution.isCached,
        isExtractionFallback: extractionExecution.isFallback,
        extractionDurationMs: Date.now() - startTime,
        ...extractionResult.rawMetadata,
      };

      memoryStore.saveDocument(doc);

      // Check if document has readable content
      const hasMeaningfulContent =
        extractionResult.features.wordCount > 0 ||
        extractionResult.extractedText.trim().length > 0 ||
        doc.pages.some((p) => (p.visualElements && p.visualElements.length > 0) || p.hasCharts || p.hasTables || p.hasFormulas);

      if (!hasMeaningfulContent) {
        const errorMsg = "Couldn't extract readable content from this document. This file may contain encrypted content, unsupported formatting, very low-quality scans, or content that cannot be recognized.";
        doc.status = 'FAILED';
        doc.statusMessage = errorMsg;
        doc.metadata.errorCode = 'DOCUMENT_CONTENT_UNREADABLE';
        memoryStore.saveDocument(doc);

        await processingQueue.updateJobState(documentId, 'FAILED', errorMsg, 100);
        logger.warn({ documentId, filename }, 'Document extraction produced 0 readable words. Marking job as FAILED without generating fake summary.');
        return;
      }

      // 4. ANALYZING
      await processingQueue.updateJobState(
        documentId,
        'ANALYZING',
        'Generating structured document intelligence',
        85
      );

      // Run default analysis on authoritative ready document
      const analysisResult = await AIProviderFactory.executeWithFallback('initial-analysis', async (provider) => {
        return await provider.analyzeDocument(doc, { mode: 'balanced' });
      });

      const analysis = analysisResult.result;
      analysis.operationalMode = analysisResult.isFallback ? 'standard' : 'full';
      analysis.aiProviderUsed = analysisResult.providerUsed;

      // Store analysis
      memoryStore.saveAnalysis(analysis);
      doc.status = analysisResult.isFallback ? 'DEGRADED' : 'COMPLETE';
      doc.statusMessage = 'Analysis complete';
      doc.progressPercent = 100;
      memoryStore.saveDocument(doc);

      // Persist to MongoDB if connected
      if (isDbConnected()) {
        try {
          await DocumentModel.updateOne(
            { id: documentId },
            {
              $set: {
                pages: doc.pages,
                features: doc.features,
                extractedText: doc.extractedText,
                metadata: doc.metadata,
                status: doc.status,
                statusMessage: doc.statusMessage,
                progressPercent: 100,
              },
            }
          );

          await DocumentAnalysisModel.create({
            ...analysis,
            _id: undefined,
          });
        } catch (err) {
          logger.warn({ documentId, err }, 'Failed to persist analysis to MongoDB');
        }
      }

      logger.info(
        {
          documentId,
          providerUsed: extractionExecution.providerUsed,
          wordCount: doc.features.wordCount,
          pages: doc.pages.length,
          status: doc.status,
          durationMs: Date.now() - startTime,
        },
        'Document pipeline finished successfully'
      );
    } catch (error: any) {
      logger.error({ documentId, error: error?.message }, 'Document pipeline failed');
      await processingQueue.updateJobState(documentId, 'FAILED', error?.message || 'Processing error', 100);
      throw error;
    }
  }

  async runAnalysisForMode(
    documentId: string,
    mode: SummaryMode
  ) {
    const doc = memoryStore.getDocument(documentId);
    if (!doc) throw new Error(`DOCUMENT_NOT_FOUND: Document with ID '${documentId}' not found.`);

    if (
      doc.status === 'QUEUED' ||
      doc.status === 'VALIDATING' ||
      doc.status === 'EXTRACTING' ||
      doc.status === 'OCR' ||
      doc.status === 'NORMALIZING'
    ) {
      throw new Error(`DOCUMENT_NOT_READY: Document extraction is still in progress (${doc.status}).`);
    }

    const hasMeaningfulContent =
      doc.features.wordCount > 0 ||
      doc.extractedText.trim().length > 0 ||
      doc.pages.some((p) => (p.visualElements && p.visualElements.length > 0) || p.hasCharts || p.hasTables || p.hasFormulas);

    if (!hasMeaningfulContent) {
      throw new Error('DOCUMENT_CONTENT_UNREADABLE: Readable content could not be extracted from this document.');
    }

    const cached = memoryStore.getAnalysis(documentId, mode);
    if (cached) return cached;

    // Check if any existing analysis for this document already computed all three summaries
    const existing = memoryStore.getAnalysis(documentId);
    if (existing && existing.summaries && existing.summaries[mode]) {
      const modeAnalysis = {
        ...existing,
        mode,
        summary: existing.summaries[mode].content,
      };
      memoryStore.saveAnalysis(modeAnalysis);
      return modeAnalysis;
    }

    const { result, providerUsed, isFallback } = await AIProviderFactory.executeWithFallback(
      `analyze-${mode}`,
      async (provider) => {
        return await provider.analyzeDocument(doc, { mode });
      }
    );

    result.operationalMode = isFallback ? 'standard' : 'full';
    result.aiProviderUsed = providerUsed;

    memoryStore.saveAnalysis(result);

    if (isDbConnected()) {
      try {
        await DocumentAnalysisModel.create({
          ...result,
          _id: undefined,
        });
      } catch (err) {
        logger.warn({ documentId, err }, 'Failed to persist mode analysis to MongoDB');
      }
    }

    return result;
  }
}

export const documentPipelineService = new DocumentPipelineService();
