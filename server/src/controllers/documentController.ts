import { Response, NextFunction } from 'express';
import fs from 'fs';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { documentPipelineService } from '../services/document/DocumentPipelineService.js';
import { memoryStore } from '../models/MemoryStore.js';
import { DocumentModel } from '../models/Document.js';
import { isDbConnected } from '../config/db.js';
import { contextRetrievalService } from '../services/retrieval/ContextRetrievalService.js';
import { processingQueue } from '../services/queue/ProcessingQueue.js';

export async function uploadDocuments(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILES_PROVIDED',
          message: 'Please select or drop at least one PDF or image file to upload.',
        },
      });
      return;
    }

    const sessionId = req.sessionId || 'default-session';
    const userId = req.user?.userId;

    const createdDocuments = [];

    for (const file of files) {
      const doc = await documentPipelineService.createUploadJob(
        file.buffer,
        file.originalname,
        file.mimetype,
        sessionId,
        userId
      );
      createdDocuments.push(doc);
    }

    res.status(202).json({
      success: true,
      data: {
        sessionId,
        documents: createdDocuments,
        message: `Successfully uploaded and queued ${createdDocuments.length} document(s) for analysis.`,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getDocument(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    let doc = memoryStore.getDocument(id);

    if (!doc && isDbConnected()) {
      const dbDoc = await DocumentModel.findOne({ id }).lean();
      if (dbDoc) doc = dbDoc as any;
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

    // Refresh live queue progress if still processing
    const queueStatus = processingQueue.getJobStatus(id);
    if (queueStatus) {
      doc.status = queueStatus.status;
      doc.statusMessage = queueStatus.statusMessage;
      doc.progressPercent = queueStatus.progressPercent;
    }

    res.json({
      success: true,
      data: doc,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDocumentFile(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    let doc = memoryStore.getDocument(id);

    if (!doc && isDbConnected()) {
      const dbDoc = await DocumentModel.findOne({ id }).lean();
      if (dbDoc) doc = dbDoc as any;
    }

    if (!doc || !doc.storagePath || !fs.existsSync(doc.storagePath)) {
      res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'The physical document file is unavailable or has expired.',
        },
      });
      return;
    }

    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.filename}"`);
    fs.createReadStream(doc.storagePath).pipe(res);
  } catch (error) {
    next(error);
  }
}

export async function getDocumentPages(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const doc = memoryStore.getDocument(id);

    if (!doc) {
      res.status(404).json({
        success: false,
        error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        documentId: doc.id,
        pageCount: doc.features.pageCount,
        pages: doc.pages,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function searchDocument(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const query = req.query.q as string;

    if (!query) {
      res.json({ success: true, data: { query: '', matches: [] } });
      return;
    }

    const doc = memoryStore.getDocument(id);
    if (!doc) {
      res.status(404).json({
        success: false,
        error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
      });
      return;
    }

    const matches = contextRetrievalService.searchInDocument(doc, query);

    res.json({
      success: true,
      data: {
        query,
        documentId: doc.id,
        totalMatches: matches.reduce((acc, m) => acc + m.matchCount, 0),
        matches,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getSessionDocuments(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionId = req.sessionId || (req.query.sessionId as string);
    if (!sessionId) {
      res.json({ success: true, data: [] });
      return;
    }

    const docs = memoryStore.getDocumentsBySession(sessionId);
    res.json({
      success: true,
      data: docs,
    });
  } catch (error) {
    next(error);
  }
}
