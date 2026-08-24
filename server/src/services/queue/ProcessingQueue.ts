import { UnifiedDocument, ProcessingStatus } from '../../schemas/document.schema.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { memoryStore } from '../../models/MemoryStore.js';
import { DocumentModel } from '../../models/Document.js';
import { isDbConnected } from '../../config/db.js';

export interface QueueJob {
  documentId: string;
  sessionId: string;
  buffer: Buffer;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  hash: string;
  status: ProcessingStatus;
  statusMessage: string;
  progressPercent: number;
  error?: string;
  createdAt: number;
}

export class ProcessingQueue {
  private queue: QueueJob[] = [];
  private activeJobs: Map<string, QueueJob> = new Map();
  private maxConcurrency: number = env.MAX_CONCURRENT_DOCUMENTS;
  private processor?: (job: QueueJob) => Promise<void>;

  setProcessor(processor: (job: QueueJob) => Promise<void>) {
    this.processor = processor;
  }

  async addJob(job: Omit<QueueJob, 'status' | 'statusMessage' | 'progressPercent' | 'createdAt'>): Promise<QueueJob> {
    const fullJob: QueueJob = {
      ...job,
      status: 'QUEUED',
      statusMessage: 'Queued for processing',
      progressPercent: 0,
      createdAt: Date.now(),
    };

    this.queue.push(fullJob);
    logger.info({ docId: fullJob.documentId, queueLength: this.queue.length }, 'Document added to processing queue');

    // Update store status
    this.updateJobState(fullJob.documentId, 'QUEUED', 'Queued in processing line', 5);

    // Trigger processing
    this.processNext();

    return fullJob;
  }

  async updateJobState(
    documentId: string,
    status: ProcessingStatus,
    statusMessage?: string,
    progressPercent?: number
  ): Promise<void> {
    const active = this.activeJobs.get(documentId);
    if (active) {
      active.status = status;
      if (statusMessage) active.statusMessage = statusMessage;
      if (progressPercent !== undefined) active.progressPercent = progressPercent;
    }

    memoryStore.updateDocumentStatus(documentId, status, statusMessage, progressPercent);

    if (isDbConnected()) {
      try {
        await DocumentModel.updateOne(
          { id: documentId },
          {
            $set: {
              status,
              ...(statusMessage ? { statusMessage } : {}),
              ...(progressPercent !== undefined ? { progressPercent } : {}),
            },
          }
        );
      } catch (err) {
        logger.warn({ documentId, err }, 'Failed to update document status in MongoDB');
      }
    }
  }

  private async processNext(): Promise<void> {
    if (this.activeJobs.size >= this.maxConcurrency || this.queue.length === 0 || !this.processor) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeJobs.set(job.documentId, job);
    logger.info(
      { docId: job.documentId, activeCount: this.activeJobs.size },
      'Started processing document job'
    );

    try {
      await this.processor(job);
    } catch (error: any) {
      logger.error({ docId: job.documentId, error: error?.message }, 'Processing queue job error');
      await this.updateJobState(job.documentId, 'FAILED', error?.message || 'Processing failed', 100);
    } finally {
      this.activeJobs.delete(job.documentId);
      this.processNext();
    }
  }

  getJobStatus(documentId: string): { status: ProcessingStatus; statusMessage: string; progressPercent: number } | undefined {
    const active = this.activeJobs.get(documentId);
    if (active) {
      return {
        status: active.status,
        statusMessage: active.statusMessage,
        progressPercent: active.progressPercent,
      };
    }
    const doc = memoryStore.getDocument(documentId);
    if (doc) {
      return {
        status: doc.status,
        statusMessage: doc.statusMessage || 'Completed',
        progressPercent: doc.progressPercent || 100,
      };
    }
    return undefined;
  }
}

export const processingQueue = new ProcessingQueue();
