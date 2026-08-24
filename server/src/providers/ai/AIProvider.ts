import {
  UnifiedDocument,
  DocumentAnalysis,
  QuestionAnswer,
  MultiDocumentAnalysis,
  SummaryMode,
} from '../../schemas/document.schema.js';

export interface DocumentAnalysisOptions {
  mode: SummaryMode;
  userPrompt?: string;
}

export interface MultiDocumentAnalysisOptions {
  mode?: SummaryMode;
  userPrompt?: string;
}

export interface QuestionOptions {
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  topKChunks?: Array<{ pageNumber: number; documentId?: string; text: string }>;
}

export interface IAIProvider {
  name: string;
  isAvailable(): Promise<boolean>;

  analyzeDocument(
    document: UnifiedDocument,
    options: DocumentAnalysisOptions
  ): Promise<DocumentAnalysis>;

  answerQuestion(
    question: string,
    context: {
      document?: UnifiedDocument;
      documents?: UnifiedDocument[];
      retrievedChunks: Array<{ pageNumber: number; documentId?: string; text: string }>;
      chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    }
  ): Promise<QuestionAnswer>;

  compareDocuments(
    documents: UnifiedDocument[],
    options: MultiDocumentAnalysisOptions
  ): Promise<MultiDocumentAnalysis>;
}
