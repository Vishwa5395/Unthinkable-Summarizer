import { UnifiedDocument, BoundingBox } from '../../schemas/document.schema.js';
import { tokenizeWords, splitIntoSentences } from '../../utils/textProcessing.js';

export interface RetrievedChunk {
  documentId: string;
  documentName: string;
  pageNumber: number;
  elementId?: string;
  blockId?: string;
  boundingBox?: BoundingBox;
  sectionTitle?: string;
  text: string;
  score: number;
  snippet: string;
}

export class ContextRetrievalService {
  /**
   * Split document pages into indexed search chunks with spatial metadata
   */
  private createDocumentChunks(
    doc: UnifiedDocument
  ): Array<{
    documentId: string;
    documentName: string;
    pageNumber: number;
    elementId?: string;
    blockId?: string;
    boundingBox?: BoundingBox;
    sectionTitle?: string;
    text: string;
    tokens: string[];
  }> {
    const chunks: Array<{
      documentId: string;
      documentName: string;
      pageNumber: number;
      elementId?: string;
      blockId?: string;
      boundingBox?: BoundingBox;
      sectionTitle?: string;
      text: string;
      tokens: string[];
    }> = [];

    for (const page of doc.pages) {
      const blocks = (page.blocks || []).filter((b) => !b.isHeaderOrFooter);

      if (blocks.length > 0) {
        for (const block of blocks) {
          const text = block.text.trim();
          if (!text) continue;

          chunks.push({
            documentId: doc.id,
            documentName: doc.originalName,
            pageNumber: page.pageNumber,
            elementId: block.id,
            blockId: block.id,
            boundingBox: block.bbox,
            sectionTitle: block.sectionTitle,
            text,
            tokens: tokenizeWords(text),
          });
        }
      } else {
        const pageText = page.text || page.ocrText || '';
        if (!pageText.trim()) continue;

        const sentences = splitIntoSentences(pageText);

        if (sentences.length <= 4) {
          chunks.push({
            documentId: doc.id,
            documentName: doc.originalName,
            pageNumber: page.pageNumber,
            text: pageText,
            tokens: tokenizeWords(pageText),
          });
        } else {
          for (let i = 0; i < sentences.length; i += 3) {
            const chunkSentences = sentences.slice(i, i + 4);
            const chunkText = chunkSentences.join(' ');
            chunks.push({
              documentId: doc.id,
              documentName: doc.originalName,
              pageNumber: page.pageNumber,
              text: chunkText,
              tokens: tokenizeWords(chunkText),
            });
          }
        }
      }
    }

    return chunks;
  }

  /**
   * BM25 / Overlap Ranking for context retrieval with layout metadata
   */
  retrieveRelevantChunks(
    documents: UnifiedDocument[],
    query: string,
    topK: number = 5
  ): RetrievedChunk[] {
    const queryTokens = tokenizeWords(query);
    if (queryTokens.length === 0) return [];

    const allChunks: Array<{
      documentId: string;
      documentName: string;
      pageNumber: number;
      elementId?: string;
      blockId?: string;
      boundingBox?: BoundingBox;
      sectionTitle?: string;
      text: string;
      tokens: string[];
    }> = [];

    for (const doc of documents) {
      allChunks.push(...this.createDocumentChunks(doc));
    }

    if (allChunks.length === 0) return [];

    const totalChunks = allChunks.length;
    const docFreq: Map<string, number> = new Map();

    // Document frequencies for IDF calculation
    for (const chunk of allChunks) {
      const uniqueTokens = new Set(chunk.tokens);
      for (const token of uniqueTokens) {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      }
    }

    // BM25 parameters
    const k1 = 1.5;
    const b = 0.75;
    const avgDocLen =
      allChunks.reduce((sum, c) => sum + c.tokens.length, 0) / Math.max(1, totalChunks);

    const scoredChunks: RetrievedChunk[] = allChunks.map((chunk) => {
      let bm25Score = 0;
      const chunkLen = chunk.tokens.length;
      const termFreqs: Map<string, number> = new Map();

      for (const t of chunk.tokens) {
        termFreqs.set(t, (termFreqs.get(t) || 0) + 1);
      }

      for (const qToken of queryTokens) {
        const tf = termFreqs.get(qToken) || 0;
        const df = docFreq.get(qToken) || 0;

        if (tf > 0 && df > 0) {
          const idf = Math.log(1 + (totalChunks - df + 0.5) / (df + 0.5));
          const num = tf * (k1 + 1);
          const den = tf + k1 * (1 - b + b * (chunkLen / avgDocLen));
          bm25Score += idf * (num / den);
        }
      }

      // Generate snippet excerpt
      const snippet = chunk.text.length > 140 ? chunk.text.substring(0, 137) + '...' : chunk.text;

      return {
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        pageNumber: chunk.pageNumber,
        elementId: chunk.elementId,
        blockId: chunk.blockId,
        boundingBox: chunk.boundingBox,
        sectionTitle: chunk.sectionTitle,
        text: chunk.text,
        score: bm25Score,
        snippet,
      };
    });

    // Sort descending by relevance score
    scoredChunks.sort((a, b) => b.score - a.score);

    const results = scoredChunks.filter((c) => c.score > 0).slice(0, topK);

    // Fallback: if no exact BM25 keyword matches, return first chunk of each document
    if (results.length === 0 && allChunks.length > 0) {
      const fallbackChunk = allChunks[0];
      return [
        {
          documentId: fallbackChunk.documentId,
          documentName: fallbackChunk.documentName,
          pageNumber: fallbackChunk.pageNumber,
          elementId: fallbackChunk.elementId,
          blockId: fallbackChunk.blockId,
          boundingBox: fallbackChunk.boundingBox,
          sectionTitle: fallbackChunk.sectionTitle,
          text: fallbackChunk.text,
          score: 0.1,
          snippet: fallbackChunk.text.substring(0, 140),
        },
      ];
    }

    return results;
  }

  /**
   * In-document search for instant keyword matching across all pages with bounding boxes
   */
  searchInDocument(
    doc: UnifiedDocument,
    query: string
  ): Array<{
    pageNumber: number;
    matchCount: number;
    snippets: string[];
    blockId?: string;
    boundingBox?: BoundingBox;
  }> {
    const cleanQ = query.trim().toLowerCase();
    if (!cleanQ || cleanQ.length < 2) return [];

    const results: Array<{
      pageNumber: number;
      matchCount: number;
      snippets: string[];
      blockId?: string;
      boundingBox?: BoundingBox;
    }> = [];

    for (const page of doc.pages) {
      const blocks = page.blocks || [];

      if (blocks.length > 0) {
        for (const block of blocks) {
          const lowerText = block.text.toLowerCase();
          if (lowerText.includes(cleanQ)) {
            const idx = lowerText.indexOf(cleanQ);
            const start = Math.max(0, idx - 40);
            const end = Math.min(block.text.length, idx + cleanQ.length + 40);
            const snippet = (start > 0 ? '...' : '') + block.text.substring(start, end).trim() + (end < block.text.length ? '...' : '');

            results.push({
              pageNumber: page.pageNumber,
              matchCount: 1,
              snippets: [snippet],
              blockId: block.id,
              boundingBox: block.bbox,
            });
          }
        }
      } else {
        const pageText = page.text || page.ocrText || '';
        const lines = pageText.split('\n');
        const snippets: string[] = [];
        let matchCount = 0;

        for (const line of lines) {
          const lowerLine = line.toLowerCase();
          if (lowerLine.includes(cleanQ)) {
            matchCount++;
            if (snippets.length < 3) {
              const idx = lowerLine.indexOf(cleanQ);
              const start = Math.max(0, idx - 40);
              const end = Math.min(line.length, idx + cleanQ.length + 40);
              snippets.push((start > 0 ? '...' : '') + line.substring(start, end).trim() + (end < line.length ? '...' : ''));
            }
          }
        }

        if (matchCount > 0) {
          results.push({
            pageNumber: page.pageNumber,
            matchCount,
            snippets,
          });
        }
      }
    }

    return results;
  }
}

export const contextRetrievalService = new ContextRetrievalService();
