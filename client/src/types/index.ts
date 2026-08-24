export type ContentType =
  | 'TEXT'
  | 'SCANNED'
  | 'HANDWRITTEN'
  | 'IMAGE'
  | 'TABLE'
  | 'CHART'
  | 'DIAGRAM'
  | 'FORMULA'
  | 'MIXED';

export type SummaryMode = 'brief' | 'balanced' | 'detailed';

export type ProcessingStatus =
  | 'QUEUED'
  | 'VALIDATING'
  | 'EXTRACTING'
  | 'OCR'
  | 'NORMALIZING'
  | 'READY'
  | 'ANALYZING'
  | 'FINALIZING'
  | 'COMPLETE'
  | 'DEGRADED'
  | 'FAILED';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  normalized?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'figure'
  | 'chart'
  | 'formula'
  | 'caption'
  | 'header'
  | 'footer';

export interface TableCell {
  rowIndex: number;
  colIndex: number;
  text: string;
  bbox?: BoundingBox;
}

export interface TableStructure {
  headers: string[];
  rows: string[][];
  cells?: TableCell[];
  rowCount: number;
  colCount: number;
}

export interface DocumentBlock {
  id: string;
  pageNumber: number;
  type: BlockType;
  text: string;
  bbox: BoundingBox;
  confidence: number;
  readingOrder: number;
  level?: number;
  tableData?: TableStructure;
  captionFor?: string;
  associatedCaptionId?: string;
  columnIndex?: number;
  sectionTitle?: string;
  isHeaderOrFooter?: boolean;
}

export interface VisualElement {
  id: string;
  type: 'table' | 'chart' | 'diagram' | 'formula' | 'handwriting' | 'image' | 'signature' | 'logo';
  description: string;
  extractedText?: string;
  confidence?: number;
  boundingBox?: BoundingBox;
  sourcePage: number;
  metadata?: Record<string, unknown>;
  associatedCaption?: string;
}

export interface PageModel {
  pageNumber: number;
  width: number;
  height: number;
  text: string;
  ocrText?: string;
  contentType: ContentType;
  confidence: number;
  isHandwritten: boolean;
  hasFormulas: boolean;
  hasTables: boolean;
  hasCharts: boolean;
  blocks: DocumentBlock[];
  visualElements: VisualElement[];
  detectedFeatures: string[];
  wordCount: number;
  renderedImagePath?: string;
}

export interface DocumentFeatures {
  pageCount: number;
  wordCount: number;
  readingTimeMinutes: number;
  chartCount: number;
  tableCount: number;
  formulaCount: number;
  imageCount: number;
  hasHandwriting: boolean;
  isScanned: boolean;
  overallOcrConfidence: number;
  documentType: string;
  language: string;
}

export interface UnifiedDocument {
  id: string;
  sessionId: string;
  userId?: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  hash: string;
  status: ProcessingStatus;
  statusMessage?: string;
  progressPercent: number;
  features: DocumentFeatures;
  pages: PageModel[];
  extractedText: string;
  metadata: Record<string, unknown>;
  storagePath?: string;
  isAnonymous: boolean;
  createdAt: string;
  expiresAt?: string;
}

export interface Citation {
  documentId?: string;
  page: number;
  elementId?: string;
  blockId?: string;
  boundingBox?: BoundingBox;
  reason?: string;
  snippet?: string;
  confidence: number;
}

export interface ImportantNumber {
  value: string;
  label: string;
  page: number;
  blockId?: string;
  boundingBox?: BoundingBox;
  context?: string;
  category: 'currency' | 'duration' | 'percentage' | 'count' | 'metric' | 'date' | 'other';
}

export interface DocumentSection {
  number: string;
  title: string;
  page: number;
  blockId?: string;
  boundingBox?: BoundingBox;
  summary?: string;
}

export interface ImprovementSuggestion {
  area: string;
  issue: string;
  recommendation: string;
  severity: 'low' | 'medium' | 'high';
  page?: number;
  blockId?: string;
}

export interface SummaryItem {
  content: string;
  wordCount: number;
  targetRange: string;
}

export interface DocumentAnalysis {
  documentId: string;
  sessionId: string;
  title: string;
  documentType: string;
  mode: SummaryMode;
  summary: string;
  summaries?: {
    brief: SummaryItem;
    balanced: SummaryItem;
    detailed: SummaryItem;
  };
  keyTakeaways: Array<{
    id: string;
    point: string;
    page: number;
    blockId?: string;
    boundingBox?: BoundingBox;
    citationReason?: string;
  }>;
  importantNumbers: ImportantNumber[];
  importantDates: Array<{
    date: string;
    event: string;
    page: number;
    blockId?: string;
    boundingBox?: BoundingBox;
  }>;
  entities: Array<{
    name: string;
    type: string;
    occurrences: number;
  }>;
  sections: DocumentSection[];
  visualInsights: Array<{
    type: string;
    description: string;
    page: number;
    blockId?: string;
    boundingBox?: BoundingBox;
    formulaOrData?: string;
  }>;
  improvementSuggestions: ImprovementSuggestion[];
  suggestedQuestions: string[];
  citations: Citation[];
  operationalMode: 'full' | 'standard' | 'degraded';
  aiProviderUsed: string;
  durationMs: number;
  warnings: string[];
  createdAt: string;
}

export interface QuestionAnswer {
  question: string;
  answer: string;
  citations: Citation[];
  confidence: number;
  suggestedFollowUps: string[];
  relevantPages: number[];
  operationalMode: 'full' | 'standard' | 'degraded';
  provider: string;
}

export interface MultiDocumentAnalysis {
  sessionId: string;
  documentIds: string[];
  documentCount: number;
  combinedSummary: string;
  sharedThemes: string[];
  keyDifferences: Array<{
    aspect: string;
    details: Array<{
      documentId: string;
      documentName: string;
      point: string;
      page?: number;
      blockId?: string;
      boundingBox?: BoundingBox;
    }>;
  }>;
  crossDocumentInsights: string[];
  comparisonMatrix: Array<{
    feature: string;
    values: Record<string, string>;
  }>;
  citations: Citation[];
  suggestedQuestions: string[];
  operationalMode: 'full' | 'standard' | 'degraded';
  aiProviderUsed: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Citation[];
  relevantPages?: number[];
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
}
