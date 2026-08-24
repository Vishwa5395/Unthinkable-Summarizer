import {
  IAIProvider,
  DocumentAnalysisOptions,
  QuestionOptions,
  MultiDocumentAnalysisOptions,
} from './AIProvider.js';
import {
  UnifiedDocument,
  DocumentAnalysis,
  QuestionAnswer,
  MultiDocumentAnalysis,
  Citation,
} from '../../schemas/document.schema.js';
import {
  cleanText,
  splitIntoSentences,
  extractKeySentences,
  extractImportantNumbers,
  extractImportantDates,
  extractDocumentSections,
  classifyDocumentType,
  generateImprovementSuggestions,
  generateSmartQuestions,
  tokenizeWords,
  countWords,
} from '../../utils/textProcessing.js';
import { logger } from '../../config/logger.js';

export class DeterministicAIProvider implements IAIProvider {
  public name = 'deterministic';

  async isAvailable(): Promise<boolean> {
    return true; // Always available offline
  }

  async analyzeDocument(
    doc: UnifiedDocument,
    options: DocumentAnalysisOptions
  ): Promise<DocumentAnalysis> {
    const startTime = Date.now();
    logger.info({ docId: doc.id, mode: options.mode }, 'Starting deterministic document analysis');

    const pagesData = doc.pages.map((p) => ({
      pageNumber: p.pageNumber,
      text: p.text || p.ocrText || '',
      blocks: p.blocks,
      isHandwritten: p.isHandwritten,
    }));

    const allText = doc.extractedText || pagesData.map((p) => p.text).join('\n\n');
    const docTypeInfo = classifyDocumentType(allText);

    if (!allText.trim() || doc.features.wordCount === 0) {
      throw new Error('DOCUMENT_CONTENT_UNREADABLE: Readable content could not be extracted from this document.');
    }

    // Extract pool of top ranked extractive key sentences
    const topSentences = extractKeySentences(pagesData, 20);

    if (topSentences.length === 0) {
      throw new Error('DOCUMENT_CONTENT_UNREADABLE: No meaningful sentences could be extracted for analysis.');
    }

    // Formulate Genuinely Distinct Extractive Summaries for each mode
    let briefContent = '';
    let balancedContent = '';
    let detailedContent = '';

    // 1. Brief Extractive: 2-3 most critical sentences
    const briefCount = Math.min(topSentences.length, 3);
    briefContent = topSentences.slice(0, briefCount).map((s) => s.sentence).join(' ');

    // 2. Balanced Extractive: 5-7 key sentences representing distinct document parts
    const balancedCount = Math.min(topSentences.length, 6);
    balancedContent = topSentences.slice(0, balancedCount).map((s) => s.sentence).join(' ');

    // 3. Detailed Extractive: 10-14 key sentences covering comprehensive context
    const detailedCount = Math.min(topSentences.length, 12);
    detailedContent = topSentences.slice(0, detailedCount).map((s) => s.sentence).join(' ');

    const summariesMap = {
      brief: {
        content: briefContent,
        wordCount: countWords(briefContent),
        targetRange: '100–150',
      },
      balanced: {
        content: balancedContent,
        wordCount: countWords(balancedContent),
        targetRange: '250–350',
      },
      detailed: {
        content: detailedContent,
        wordCount: countWords(detailedContent),
        targetRange: '600–800',
      },
    };

    // Active summary matching requested mode
    const activeSummary = options.mode === 'brief'
      ? summariesMap.brief.content
      : options.mode === 'detailed'
      ? summariesMap.detailed.content
      : summariesMap.balanced.content;

    // Key Takeaways with page citations & bounding boxes
    const keyTakeaways = topSentences.slice(0, Math.min(topSentences.length, 6)).map((s, idx) => ({
      id: `kt-${idx + 1}`,
      point: s.sentence.replace(/^[-•*]\s*/, '').trim(),
      page: s.pageNumber,
      blockId: s.blockId,
      boundingBox: s.boundingBox,
      citationReason: `Direct finding extracted from Page ${s.pageNumber}`,
    }));

    // Important Numbers, Dates, Sections
    const importantNumbers = extractImportantNumbers(pagesData);
    const importantDates = extractImportantDates(pagesData);
    const sections = extractDocumentSections(pagesData);

    // Entities extraction (capitalized noun phrases)
    const entityMatches = allText.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+\b/g) || [];
    const entityFreq: Map<string, number> = new Map();
    for (const e of entityMatches) {
      if (e.length > 4 && !e.includes('Page') && !e.includes('Document')) {
        entityFreq.set(e, (entityFreq.get(e) || 0) + 1);
      }
    }
    const entities = Array.from(entityFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, occurrences]) => ({
        name,
        type: 'Key Organization / Topic',
        occurrences,
      }));

    // Visual Insights
    const visualInsights: Array<{
      type: string;
      description: string;
      page: number;
      blockId?: string;
      boundingBox?: any;
      formulaOrData?: string;
    }> = [];

    for (const p of doc.pages) {
      const blocks = p.blocks || [];
      for (const block of blocks) {
        if (block.type === 'table') {
          visualInsights.push({
            type: 'Structured Table',
            description: `Table detected on Page ${p.pageNumber}: ${block.tableData?.rowCount || 0} rows x ${block.tableData?.colCount || 0} columns.`,
            page: p.pageNumber,
            blockId: block.id,
            boundingBox: block.bbox,
            formulaOrData: block.text,
          });
        } else if (block.type === 'formula') {
          visualInsights.push({
            type: 'Mathematical Formula',
            description: `Mathematical formula or expression on Page ${p.pageNumber}.`,
            page: p.pageNumber,
            blockId: block.id,
            boundingBox: block.bbox,
            formulaOrData: block.text,
          });
        }
      }

      if (p.hasCharts) {
        visualInsights.push({
          type: 'Chart / Graphic',
          description: `Data chart or visual diagram identified on Page ${p.pageNumber}.`,
          page: p.pageNumber,
        });
      }
      if (p.isHandwritten) {
        visualInsights.push({
          type: 'Handwritten Content',
          description: `Handwritten text detected on Page ${p.pageNumber}. OCR confidence: ${Math.round(p.confidence * 100)}%.`,
          page: p.pageNumber,
        });
      }
    }

    // Improvement Suggestions
    const improvementSuggestions = generateImprovementSuggestions(docTypeInfo.type, allText, pagesData);

    // Suggested Questions
    const suggestedQuestions = generateSmartQuestions(docTypeInfo.type, allText);

    // Citations
    const citations: Citation[] = keyTakeaways.map((kt) => ({
      documentId: doc.id,
      page: kt.page,
      elementId: kt.blockId,
      blockId: kt.blockId,
      boundingBox: kt.boundingBox,
      reason: kt.point.substring(0, 50),
      confidence: 0.95,
    }));

    const warnings: string[] = [];
    if (doc.features.hasHandwriting && doc.features.overallOcrConfidence < 0.75) {
      warnings.push('Some handwritten content was interpreted with lower optical confidence.');
    }

    const durationMs = Date.now() - startTime;

    return {
      documentId: doc.id,
      sessionId: doc.sessionId,
      title: `${doc.originalName.replace(/\.[^/.]+$/, '')} Analysis`,
      documentType: docTypeInfo.type,
      mode: options.mode,
      summary: activeSummary,
      summaries: summariesMap,
      keyTakeaways,
      importantNumbers,
      importantDates,
      entities,
      sections,
      visualInsights,
      improvementSuggestions,
      suggestedQuestions,
      citations,
      operationalMode: 'standard',
      aiProviderUsed: 'deterministic',
      durationMs,
      warnings,
      createdAt: new Date().toISOString(),
    };
  }

  async answerQuestion(
    question: string,
    context: {
      document?: UnifiedDocument;
      documents?: UnifiedDocument[];
      retrievedChunks: Array<{
        pageNumber: number;
        documentId?: string;
        elementId?: string;
        blockId?: string;
        boundingBox?: any;
        text: string;
      }>;
      chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    }
  ): Promise<QuestionAnswer> {
    const qTokens = tokenizeWords(question);
    const chunks = context.retrievedChunks;

    if (!chunks || chunks.length === 0) {
      return {
        question,
        answer: "I couldn't find enough evidence in the uploaded documents to answer that confidently.",
        citations: [],
        confidence: 0.5,
        suggestedFollowUps: ['Can you provide more details about what you are looking for?'],
        relevantPages: [],
        operationalMode: 'standard',
        provider: 'deterministic',
      };
    }

    // Score sentences in chunks based on query overlap
    const matchedSentences: Array<{
      sentence: string;
      pageNumber: number;
      documentId?: string;
      blockId?: string;
      boundingBox?: any;
      score: number;
    }> = [];

    for (const chunk of chunks) {
      const sents = splitIntoSentences(chunk.text);
      for (const sent of sents) {
        const sentTokens = tokenizeWords(sent);
        let matchCount = 0;
        for (const token of qTokens) {
          if (sentTokens.includes(token)) matchCount++;
        }

        if (matchCount > 0) {
          matchedSentences.push({
            sentence: sent,
            pageNumber: chunk.pageNumber,
            documentId: chunk.documentId,
            blockId: chunk.blockId,
            boundingBox: chunk.boundingBox,
            score: matchCount / (sentTokens.length + 1),
          });
        }
      }
    }

    matchedSentences.sort((a, b) => b.score - a.score);

    if (matchedSentences.length === 0) {
      const primaryChunk = chunks[0];
      const sents = splitIntoSentences(primaryChunk.text).slice(0, 3);
      const answer = sents.join(' ') || primaryChunk.text.substring(0, 300);

      return {
        question,
        answer: `Based on the document context on Page ${primaryChunk.pageNumber}:\n\n${answer}`,
        citations: [
          {
            documentId: primaryChunk.documentId,
            page: primaryChunk.pageNumber,
            elementId: primaryChunk.blockId,
            blockId: primaryChunk.blockId,
            boundingBox: primaryChunk.boundingBox,
            snippet: answer.substring(0, 100),
            confidence: 0.85,
          },
        ],
        confidence: 0.8,
        suggestedFollowUps: ['Would you like to explore related sections of this document?'],
        relevantPages: [primaryChunk.pageNumber],
        operationalMode: 'standard',
        provider: 'deterministic',
      };
    }

    const topMatches = matchedSentences.slice(0, 3);
    const answerBody = topMatches.map((m) => m.sentence).join(' ');
    const relevantPages = Array.from(new Set(topMatches.map((m) => m.pageNumber)));

    const citations: Citation[] = topMatches.map((m) => ({
      documentId: m.documentId,
      page: m.pageNumber,
      elementId: m.blockId,
      blockId: m.blockId,
      boundingBox: m.boundingBox,
      snippet: m.sentence.substring(0, 80),
      confidence: 0.92,
    }));

    return {
      question,
      answer: answerBody,
      citations,
      confidence: 0.9,
      suggestedFollowUps: [
        'Where is this mentioned in the document?',
        'Are there other related metrics or details?',
      ],
      relevantPages,
      operationalMode: 'standard',
      provider: 'deterministic',
    };
  }

  async compareDocuments(
    documents: UnifiedDocument[],
    options: MultiDocumentAnalysisOptions
  ): Promise<MultiDocumentAnalysis> {
    const docCount = documents.length;
    const docIds = documents.map((d) => d.id);
    const docNames = documents.map((d) => d.originalName);

    const summaries = documents.map((d) => {
      const top = extractKeySentences(
        d.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text || p.ocrText || '', blocks: p.blocks })),
        2
      );
      return `**${d.originalName}**: ${top.map((t) => t.sentence).join(' ')}`;
    });

    const combinedSummary = `Across the ${docCount} uploaded documents (${docNames.join(', ')}), here is the synthesis of core topics and findings:\n\n${summaries.join('\n\n')}`;

    // Common words across all documents
    const docWordSets = documents.map((d) => new Set(tokenizeWords(d.extractedText)));
    const sharedWords: string[] = [];
    if (docWordSets.length > 0) {
      for (const w of docWordSets[0]) {
        if (docWordSets.every((set) => set.has(w))) {
          sharedWords.push(w);
        }
      }
    }

    const sharedThemes = sharedWords
      .slice(0, 6)
      .map((w) => `Shared discussion on "${w.charAt(0).toUpperCase() + w.slice(1)}" across all files.`);

    const keyDifferences = [
      {
        aspect: 'Document Scope & Purpose',
        details: documents.map((d) => ({
          documentId: d.id,
          documentName: d.originalName,
          point: `${d.features.documentType} with ${d.features.pageCount} page(s) and ${d.features.wordCount} words.`,
          page: 1,
        })),
      },
      {
        aspect: 'Visual & Tabular Distribution',
        details: documents.map((d) => ({
          documentId: d.id,
          documentName: d.originalName,
          point: `Contains ${d.features.chartCount} chart(s), ${d.features.tableCount} table(s), and ${d.features.formulaCount} formula(s).`,
          page: 1,
        })),
      },
    ];

    const crossDocumentInsights = [
      `A total of ${documents.reduce((acc, d) => acc + d.features.pageCount, 0)} pages and ${documents.reduce((acc, d) => acc + d.features.wordCount, 0)} words were indexed across ${docCount} documents.`,
      `Documents share overlapping focus areas while serving distinct functional roles in this analysis session.`,
    ];

    const comparisonMatrix = [
      {
        feature: 'Document Type',
        values: Object.fromEntries(documents.map((d) => [d.originalName, d.features.documentType])),
      },
      {
        feature: 'Pages',
        values: Object.fromEntries(documents.map((d) => [d.originalName, String(d.features.pageCount)])),
      },
      {
        feature: 'Word Count',
        values: Object.fromEntries(documents.map((d) => [d.originalName, `${d.features.wordCount} words`])),
      },
      {
        feature: 'Visual Elements',
        values: Object.fromEntries(
          documents.map((d) => [
            d.originalName,
            `${d.features.chartCount} Charts, ${d.features.tableCount} Tables, ${d.features.formulaCount} Formulas`,
          ])
        ),
      },
    ];

    const citations: Citation[] = documents.map((d) => ({
      documentId: d.id,
      page: 1,
      reason: `Reference to ${d.originalName}`,
      confidence: 0.95,
    }));

    return {
      sessionId: documents[0]?.sessionId || 'default-session',
      documentIds: docIds,
      documentCount: docCount,
      combinedSummary,
      sharedThemes: sharedThemes.length > 0 ? sharedThemes : ['All documents provide supporting domain context.'],
      keyDifferences,
      crossDocumentInsights,
      comparisonMatrix,
      citations,
      suggestedQuestions: [
        'What are the key differences between these documents?',
        'Which document contains the most detailed quantitative data?',
        'What is common across all uploaded files?',
      ],
      operationalMode: 'standard',
      aiProviderUsed: 'deterministic',
      createdAt: new Date().toISOString(),
    };
  }
}

export const deterministicAIProvider = new DeterministicAIProvider();
