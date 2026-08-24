import { PageModel, DocumentFeatures } from '../../schemas/document.schema.js';

export interface ExtractionInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  fileHash: string;
  documentId: string;
  sessionId: string;
  preferredMode?: string;
}

export interface ExtractionResult {
  pages: PageModel[];
  features: DocumentFeatures;
  extractedText: string;
  providerUsed: string;
  modeUsed?: string;
  isCached?: boolean;
  rawMetadata?: Record<string, unknown>;
}

export interface IDocumentExtractionProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  extractDocument(
    input: ExtractionInput,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ExtractionResult>;
}
