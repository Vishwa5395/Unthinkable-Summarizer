import mongoose, { Schema, Document as MongooseDoc } from 'mongoose';
import { UnifiedDocument } from '../schemas/document.schema.js';

export interface IDocumentDoc extends MongooseDoc, Omit<UnifiedDocument, 'id'> {
  _id: mongoose.Types.ObjectId;
}

const VisualElementSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['table', 'chart', 'diagram', 'formula', 'handwriting', 'image', 'signature', 'logo'],
      required: true,
    },
    description: { type: String, required: true },
    extractedText: { type: String, default: '' },
    confidence: { type: Number, default: 1.0 },
    boundingBox: {
      x: Number,
      y: Number,
      width: Number,
      height: Number,
    },
    sourcePage: { type: Number, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const PageSchema = new Schema(
  {
    pageNumber: { type: Number, required: true },
    text: { type: String, default: '' },
    ocrText: { type: String, default: '' },
    contentType: {
      type: String,
      enum: ['TEXT', 'SCANNED', 'HANDWRITTEN', 'IMAGE', 'TABLE', 'CHART', 'DIAGRAM', 'FORMULA', 'MIXED'],
      default: 'TEXT',
    },
    confidence: { type: Number, default: 1.0 },
    isHandwritten: { type: Boolean, default: false },
    hasFormulas: { type: Boolean, default: false },
    hasTables: { type: Boolean, default: false },
    hasCharts: { type: Boolean, default: false },
    visualElements: [VisualElementSchema],
    detectedFeatures: [String],
    wordCount: { type: Number, default: 0 },
    renderedImagePath: { type: String },
  },
  { _id: false }
);

const DocumentSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    sessionId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    hash: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['QUEUED', 'VALIDATING', 'EXTRACTING', 'OCR', 'ANALYZING', 'FINALIZING', 'COMPLETE', 'DEGRADED', 'FAILED'],
      default: 'QUEUED',
      index: true,
    },
    statusMessage: { type: String, default: 'Queued for processing' },
    progressPercent: { type: Number, default: 0 },
    features: {
      pageCount: { type: Number, default: 1 },
      wordCount: { type: Number, default: 0 },
      readingTimeMinutes: { type: Number, default: 1 },
      chartCount: { type: Number, default: 0 },
      tableCount: { type: Number, default: 0 },
      formulaCount: { type: Number, default: 0 },
      imageCount: { type: Number, default: 0 },
      hasHandwriting: { type: Boolean, default: false },
      isScanned: { type: Boolean, default: false },
      overallOcrConfidence: { type: Number, default: 1.0 },
      documentType: { type: String, default: 'General Document' },
      language: { type: String, default: 'English' },
    },
    pages: [PageSchema],
    extractedText: { type: String, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} },
    storagePath: { type: String },
    isAnonymous: { type: Boolean, default: true },
    expiresAt: { type: Date, index: { expires: 0 } },
  },
  { timestamps: true }
);

export const DocumentModel = mongoose.models.Document || mongoose.model<IDocumentDoc>('Document', DocumentSchema);
