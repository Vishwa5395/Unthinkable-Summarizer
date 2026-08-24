import { z } from 'zod';

export const ContentTypeEnum = z.enum([
  'TEXT',
  'SCANNED',
  'HANDWRITTEN',
  'IMAGE',
  'TABLE',
  'CHART',
  'DIAGRAM',
  'FORMULA',
  'MIXED',
]);
export type ContentType = z.infer<typeof ContentTypeEnum>;

export const SummaryModeEnum = z.enum(['brief', 'balanced', 'detailed']);
export type SummaryMode = z.infer<typeof SummaryModeEnum>;

export const ProcessingStatusEnum = z.enum([
  'QUEUED',
  'VALIDATING',
  'EXTRACTING',
  'OCR',
  'NORMALIZING',
  'READY',
  'ANALYZING',
  'FINALIZING',
  'COMPLETE',
  'DEGRADED',
  'FAILED',
]);
export type ProcessingStatus = z.infer<typeof ProcessingStatusEnum>;

export const OperationalModeEnum = z.enum([
  'full',
  'standard',
  'degraded',
]);
export type OperationalMode = z.infer<typeof OperationalModeEnum>;

export const NormalizedCoordsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  normalized: NormalizedCoordsSchema.optional(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

export const BlockTypeEnum = z.enum([
  'heading',
  'paragraph',
  'list',
  'table',
  'figure',
  'chart',
  'formula',
  'caption',
  'header',
  'footer',
]);
export type BlockType = z.infer<typeof BlockTypeEnum>;

export const TableCellSchema = z.object({
  rowIndex: z.number(),
  colIndex: z.number(),
  text: z.string(),
  bbox: BoundingBoxSchema.optional(),
});
export type TableCell = z.infer<typeof TableCellSchema>;

export const TableStructureSchema = z.object({
  headers: z.array(z.string()).default([]),
  rows: z.array(z.array(z.string())).default([]),
  cells: z.array(TableCellSchema).optional(),
  rowCount: z.number().default(0),
  colCount: z.number().default(0),
});
export type TableStructure = z.infer<typeof TableStructureSchema>;

export const DocumentBlockSchema = z.object({
  id: z.string(),
  pageNumber: z.number(),
  type: BlockTypeEnum,
  text: z.string(),
  bbox: BoundingBoxSchema,
  confidence: z.number().min(0).max(1).default(1.0),
  readingOrder: z.number().default(0),
  level: z.number().optional(), // 1 for H1, 2 for H2, etc.
  tableData: TableStructureSchema.optional(),
  captionFor: z.string().optional(), // Element ID of the figure/table this caption describes
  associatedCaptionId: z.string().optional(), // Element ID of the caption for this figure/table
  columnIndex: z.number().optional().default(0), // 0 for left/single, 1 for right
  sectionTitle: z.string().optional(),
  isHeaderOrFooter: z.boolean().default(false),
});
export type DocumentBlock = z.infer<typeof DocumentBlockSchema>;

export const VisualElementSchema = z.object({
  id: z.string(),
  type: z.enum(['table', 'chart', 'diagram', 'formula', 'handwriting', 'image', 'signature', 'logo']),
  description: z.string(),
  extractedText: z.string().default(''),
  confidence: z.number().min(0).max(1).default(1.0),
  boundingBox: BoundingBoxSchema.optional(),
  sourcePage: z.number(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  associatedCaption: z.string().optional(),
});
export type VisualElement = z.infer<typeof VisualElementSchema>;

export const PageModelSchema = z.object({
  pageNumber: z.number(),
  width: z.number().default(595),
  height: z.number().default(842),
  text: z.string().default(''),
  ocrText: z.string().optional().default(''),
  contentType: ContentTypeEnum.default('TEXT'),
  confidence: z.number().min(0).max(1).default(1.0),
  isHandwritten: z.boolean().default(false),
  hasFormulas: z.boolean().default(false),
  hasTables: z.boolean().default(false),
  hasCharts: z.boolean().default(false),
  blocks: z.array(DocumentBlockSchema).default([]),
  visualElements: z.array(VisualElementSchema).default([]),
  detectedFeatures: z.array(z.string()).default([]),
  wordCount: z.number().default(0),
  renderedImagePath: z.string().optional(),
});
export type PageModel = z.infer<typeof PageModelSchema>;

export const DocumentFeaturesSchema = z.object({
  pageCount: z.number().default(1),
  wordCount: z.number().default(0),
  readingTimeMinutes: z.number().default(1),
  chartCount: z.number().default(0),
  tableCount: z.number().default(0),
  formulaCount: z.number().default(0),
  imageCount: z.number().default(0),
  hasHandwriting: z.boolean().default(false),
  isScanned: z.boolean().default(false),
  overallOcrConfidence: z.number().default(1.0),
  documentType: z.string().default('General Document'),
  language: z.string().default('English'),
});
export type DocumentFeatures = z.infer<typeof DocumentFeaturesSchema>;

export const UnifiedDocumentSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  userId: z.string().optional(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  hash: z.string(),
  status: ProcessingStatusEnum.default('QUEUED'),
  statusMessage: z.string().optional().default('Queued for processing'),
  progressPercent: z.number().min(0).max(100).default(0),
  features: DocumentFeaturesSchema,
  pages: z.array(PageModelSchema).default([]),
  extractedText: z.string().default(''),
  metadata: z.record(z.string(), z.unknown()).default({}),
  storagePath: z.string().optional(),
  isAnonymous: z.boolean().default(true),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
});
export type UnifiedDocument = z.infer<typeof UnifiedDocumentSchema>;

export const CitationSchema = z.object({
  documentId: z.string().optional(),
  page: z.number(),
  elementId: z.string().optional(),
  blockId: z.string().optional(),
  boundingBox: BoundingBoxSchema.optional(),
  reason: z.string().optional(),
  snippet: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.95),
});
export type Citation = z.infer<typeof CitationSchema>;

export const ImportantNumberSchema = z.object({
  value: z.string(),
  label: z.string(),
  page: z.number().default(1),
  blockId: z.string().optional(),
  boundingBox: BoundingBoxSchema.optional(),
  context: z.string().optional(),
  category: z.enum(['currency', 'duration', 'percentage', 'count', 'metric', 'date', 'other']).default('other'),
});
export type ImportantNumber = z.infer<typeof ImportantNumberSchema>;

export const DocumentSectionSchema = z.object({
  number: z.string(),
  title: z.string(),
  page: z.number(),
  blockId: z.string().optional(),
  boundingBox: BoundingBoxSchema.optional(),
  summary: z.string().optional(),
});
export type DocumentSection = z.infer<typeof DocumentSectionSchema>;

export const ImprovementSuggestionSchema = z.object({
  area: z.string(),
  issue: z.string(),
  recommendation: z.string(),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  page: z.number().optional(),
  blockId: z.string().optional(),
});
export type ImprovementSuggestion = z.infer<typeof ImprovementSuggestionSchema>;

export const SummaryItemSchema = z.object({
  content: z.string(),
  wordCount: z.number().default(0),
  targetRange: z.string().default(''),
});
export type SummaryItem = z.infer<typeof SummaryItemSchema>;

export const SummariesMapSchema = z.object({
  brief: SummaryItemSchema,
  balanced: SummaryItemSchema,
  detailed: SummaryItemSchema,
});
export type SummariesMap = z.infer<typeof SummariesMapSchema>;

export const DocumentAnalysisSchema = z.object({
  documentId: z.string(),
  sessionId: z.string(),
  title: z.string().default('Document Analysis'),
  documentType: z.string().default('General Document'),
  mode: SummaryModeEnum.default('balanced'),
  summary: z.string(),
  summaries: SummariesMapSchema.optional(),
  keyTakeaways: z.array(
    z.object({
      id: z.string(),
      point: z.string(),
      page: z.number(),
      blockId: z.string().optional(),
      boundingBox: BoundingBoxSchema.optional(),
      citationReason: z.string().optional(),
    })
  ).default([]),
  importantNumbers: z.array(ImportantNumberSchema).default([]),
  importantDates: z.array(
    z.object({
      date: z.string(),
      event: z.string(),
      page: z.number(),
      blockId: z.string().optional(),
      boundingBox: BoundingBoxSchema.optional(),
    })
  ).default([]),
  entities: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      occurrences: z.number().default(1),
    })
  ).default([]),
  sections: z.array(DocumentSectionSchema).default([]),
  visualInsights: z.array(
    z.object({
      type: z.string(),
      description: z.string(),
      page: z.number(),
      blockId: z.string().optional(),
      boundingBox: BoundingBoxSchema.optional(),
      formulaOrData: z.string().optional(),
    })
  ).default([]),
  improvementSuggestions: z.array(ImprovementSuggestionSchema).default([]),
  suggestedQuestions: z.array(z.string()).default([]),
  citations: z.array(CitationSchema).default([]),
  operationalMode: OperationalModeEnum.default('standard'),
  aiProviderUsed: z.string().default('deterministic'),
  durationMs: z.number().default(0),
  warnings: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type DocumentAnalysis = z.infer<typeof DocumentAnalysisSchema>;

export const QuestionAnswerSchema = z.object({
  question: z.string(),
  answer: z.string(),
  citations: z.array(CitationSchema).default([]),
  confidence: z.number().min(0).max(1).default(0.9),
  suggestedFollowUps: z.array(z.string()).default([]),
  relevantPages: z.array(z.number()).default([]),
  operationalMode: OperationalModeEnum.default('standard'),
  provider: z.string().default('deterministic'),
});
export type QuestionAnswer = z.infer<typeof QuestionAnswerSchema>;

export const MultiDocumentAnalysisSchema = z.object({
  sessionId: z.string(),
  documentIds: z.array(z.string()),
  documentCount: z.number(),
  combinedSummary: z.string(),
  sharedThemes: z.array(z.string()).default([]),
  keyDifferences: z.array(
    z.object({
      aspect: z.string(),
      details: z.array(
        z.object({
          documentId: z.string(),
          documentName: z.string(),
          point: z.string(),
          page: z.number().optional(),
          blockId: z.string().optional(),
          boundingBox: BoundingBoxSchema.optional(),
        })
      ),
    })
  ).default([]),
  crossDocumentInsights: z.array(z.string()).default([]),
  comparisonMatrix: z.array(
    z.object({
      feature: z.string(),
      values: z.record(z.string(), z.string()),
    })
  ).default([]),
  citations: z.array(CitationSchema).default([]),
  suggestedQuestions: z.array(z.string()).default([]),
  operationalMode: OperationalModeEnum.default('standard'),
  aiProviderUsed: z.string().default('deterministic'),
  createdAt: z.string(),
});
export type MultiDocumentAnalysis = z.infer<typeof MultiDocumentAnalysisSchema>;
