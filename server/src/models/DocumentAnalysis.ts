import mongoose, { Schema, Document as MongooseDoc } from 'mongoose';
import { DocumentAnalysis } from '../schemas/document.schema.js';

export interface IDocumentAnalysisDoc extends MongooseDoc, Omit<DocumentAnalysis, 'documentId' | 'sessionId'> {
  documentId: string;
  sessionId: string;
  userId?: mongoose.Types.ObjectId;
}

const ImportantNumberSchema = new Schema(
  {
    value: { type: String, required: true },
    label: { type: String, required: true },
    page: { type: Number, default: 1 },
    context: String,
    category: {
      type: String,
      enum: ['currency', 'duration', 'percentage', 'count', 'metric', 'date', 'other'],
      default: 'other',
    },
  },
  { _id: false }
);

const DocumentSectionSchema = new Schema(
  {
    number: { type: String, required: true },
    title: { type: String, required: true },
    page: { type: Number, required: true },
    summary: String,
  },
  { _id: false }
);

const ImprovementSuggestionSchema = new Schema(
  {
    area: { type: String, required: true },
    issue: { type: String, required: true },
    recommendation: { type: String, required: true },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    page: Number,
  },
  { _id: false }
);

const CitationSchema = new Schema(
  {
    documentId: String,
    page: { type: Number, required: true },
    reason: String,
    snippet: String,
    confidence: { type: Number, default: 0.95 },
  },
  { _id: false }
);

const DocumentAnalysisSchemaMongoose = new Schema(
  {
    documentId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    title: { type: String, default: 'Document Analysis' },
    documentType: { type: String, default: 'General Document' },
    mode: { type: String, enum: ['brief', 'balanced', 'detailed'], default: 'balanced' },
    summary: { type: String, required: true },
    keyTakeaways: [
      {
        id: String,
        point: String,
        page: Number,
        citationReason: String,
      },
    ],
    importantNumbers: [ImportantNumberSchema],
    importantDates: [
      {
        date: String,
        event: String,
        page: Number,
      },
    ],
    entities: [
      {
        name: String,
        type: String,
        occurrences: Number,
      },
    ],
    sections: [DocumentSectionSchema],
    visualInsights: [
      {
        type: String,
        description: String,
        page: Number,
        formulaOrData: String,
      },
    ],
    improvementSuggestions: [ImprovementSuggestionSchema],
    suggestedQuestions: [String],
    citations: [CitationSchema],
    operationalMode: { type: String, enum: ['full', 'standard', 'degraded'], default: 'standard' },
    aiProviderUsed: { type: String, default: 'deterministic' },
    durationMs: { type: Number, default: 0 },
    warnings: [String],
    expiresAt: { type: Date, index: { expires: 0 } },
  },
  { timestamps: true }
);

export const DocumentAnalysisModel =
  mongoose.models.DocumentAnalysis ||
  mongoose.model<IDocumentAnalysisDoc>('DocumentAnalysis', DocumentAnalysisSchemaMongoose);
