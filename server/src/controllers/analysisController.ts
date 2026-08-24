import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { documentPipelineService } from '../services/document/DocumentPipelineService.js';
import { memoryStore } from '../models/MemoryStore.js';
import { DocumentModel } from '../models/Document.js';
import { DocumentAnalysisModel } from '../models/DocumentAnalysis.js';
import { isDbConnected } from '../config/db.js';
import { SummaryMode } from '../schemas/document.schema.js';
import { AIProviderFactory } from '../providers/ai/AIProviderFactory.js';
import { logger } from '../config/logger.js';

export async function getDocumentAnalysis(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const mode = (req.query.mode as SummaryMode) || 'balanced';

    // 1. Authoritative Document Lookup
    let doc = memoryStore.getDocument(id);
    if (!doc && isDbConnected()) {
      const dbDoc = await DocumentModel.findOne({ id }).lean();
      if (dbDoc) {
        doc = dbDoc as any;
        memoryStore.saveDocument(doc);
      }
    }

    if (!doc) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DOCUMENT_NOT_FOUND',
          message: `Document with ID '${id}' was not found.`,
        },
      });
      return;
    }

    // 2. Lifecycle State Gate: Prevent analysis request on in-progress extraction
    if (
      doc.status === 'QUEUED' ||
      doc.status === 'VALIDATING' ||
      doc.status === 'EXTRACTING' ||
      doc.status === 'OCR' ||
      doc.status === 'NORMALIZING' ||
      doc.status === 'ANALYZING'
    ) {
      res.status(202).json({
        success: false,
        status: doc.status,
        progressPercent: doc.progressPercent,
        error: {
          code: 'DOCUMENT_NOT_READY',
          message: `Document extraction is in progress (${doc.status}). Analysis will be available once ready.`,
        },
      });
      return;
    }

    if (doc.status === 'FAILED') {
      res.status(422).json({
        success: false,
        error: {
          code: doc.metadata?.errorCode || 'DOCUMENT_EXTRACTION_FAILED',
          message: doc.statusMessage || "Couldn't extract readable content from this document.",
        },
      });
      return;
    }

    // 3. Check Cached Analysis
    let analysis = memoryStore.getAnalysis(id, mode);

    if (!analysis && isDbConnected()) {
      const dbAnalysis = await DocumentAnalysisModel.findOne({ documentId: id, mode }).lean();
      if (dbAnalysis) {
        analysis = dbAnalysis as any;
        memoryStore.saveAnalysis(analysis);
      }
    }

    // 4. Generate Analysis On-Demand for READY/COMPLETE document if not yet cached
    if (!analysis) {
      logger.info({ documentId: id, mode, docWordCount: doc.features.wordCount }, 'Generating on-demand analysis for verified document');
      analysis = await documentPipelineService.runAnalysisForMode(id, mode);
    }

    if (!analysis) {
      res.status(404).json({
        success: false,
        error: {
          code: 'ANALYSIS_NOT_FOUND',
          message: 'Analysis could not be generated for this document.',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error: any) {
    logger.error({ error: error?.message, docId: req.params.id }, 'Error in getDocumentAnalysis');
    next(error);
  }
}

export async function triggerDocumentAnalysis(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const mode = (req.body.mode as SummaryMode) || 'balanced';

    // 1. Authoritative Document Lookup
    let doc = memoryStore.getDocument(id);
    if (!doc && isDbConnected()) {
      const dbDoc = await DocumentModel.findOne({ id }).lean();
      if (dbDoc) {
        doc = dbDoc as any;
        memoryStore.saveDocument(doc);
      }
    }

    if (!doc) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DOCUMENT_NOT_FOUND',
          message: `Document with ID '${id}' was not found.`,
        },
      });
      return;
    }

    // 2. Lifecycle State Gate
    if (
      doc.status === 'QUEUED' ||
      doc.status === 'VALIDATING' ||
      doc.status === 'EXTRACTING' ||
      doc.status === 'OCR' ||
      doc.status === 'NORMALIZING' ||
      doc.status === 'ANALYZING'
    ) {
      res.status(202).json({
        success: false,
        status: doc.status,
        progressPercent: doc.progressPercent,
        error: {
          code: 'DOCUMENT_NOT_READY',
          message: `Document is currently ${doc.status}. Please wait until extraction is complete.`,
        },
      });
      return;
    }

    if (doc.status === 'FAILED') {
      res.status(422).json({
        success: false,
        error: {
          code: doc.metadata?.errorCode || 'DOCUMENT_EXTRACTION_FAILED',
          message: doc.statusMessage || "Couldn't extract readable content from this document.",
        },
      });
      return;
    }

    const analysis = await documentPipelineService.runAnalysisForMode(id, mode);

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error: any) {
    logger.error({ error: error?.message, docId: req.params.id }, 'Error in triggerDocumentAnalysis');
    next(error);
  }
}

export async function compareDocuments(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { documentIds, sessionId } = req.body;

    const targetSessionId = sessionId || req.sessionId;
    let docs: any[] = [];

    if (Array.isArray(documentIds) && documentIds.length > 0) {
      docs = documentIds.map((id) => memoryStore.getDocument(id)).filter(Boolean);
    } else if (targetSessionId) {
      docs = memoryStore.getDocumentsBySession(targetSessionId);
    }

    if (docs.length < 2) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_DOCUMENTS',
          message: 'At least two documents are required to perform a comparative cross-analysis.',
        },
      });
      return;
    }

    const { result, providerUsed, isFallback } = await AIProviderFactory.executeWithFallback(
      'compare-documents',
      async (provider) => {
        return await provider.compareDocuments(docs as any, {});
      }
    );

    result.operationalMode = isFallback ? 'standard' : 'full';
    result.aiProviderUsed = providerUsed;

    if (targetSessionId) {
      memoryStore.saveMultiAnalysis(targetSessionId, result);
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
