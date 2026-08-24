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
  DocumentAnalysisSchema,
  QuestionAnswerSchema,
  MultiDocumentAnalysisSchema,
} from '../../schemas/document.schema.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { formatStructuredDocumentContext, countWords } from '../../utils/textProcessing.js';

export class OpenAICompatibleProvider implements IAIProvider {
  public name = 'openai-compatible';
  private inCooldownUntil: number = 0;

  async isAvailable(): Promise<boolean> {
    if (!env.AI_API_KEY && !env.AI_BASE_URL.includes('localhost') && !env.AI_BASE_URL.includes('127.0.0.1')) {
      return false;
    }
    if (Date.now() < this.inCooldownUntil) {
      return false;
    }
    return true;
  }

  private cleanJsonString(raw: string): string {
    let clean = raw.trim();
    // Strip markdown code fences if present
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }
    return clean.trim();
  }

  private async callChatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    temperature: number = 0.2
  ): Promise<string> {
    if (Date.now() < this.inCooldownUntil) {
      throw new Error(`AI Provider in cooldown due to previous rate limits. Cooldown expires in ${Math.round((this.inCooldownUntil - Date.now()) / 1000)}s`);
    }

    let lastError: Error | null = null;
    const maxRetries = Math.max(0, env.AI_MAX_RETRIES);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), env.AI_REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(`${env.AI_BASE_URL.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: env.AI_API_KEY ? `Bearer ${env.AI_API_KEY}` : '',
          },
          body: JSON.stringify({
            model: env.AI_MODEL,
            messages,
            temperature,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          this.inCooldownUntil = Date.now() + 60 * 1000; // 60s cooldown
          throw new Error('AI API Rate limit reached (429). Activating cooldown.');
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`AI Provider HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        }

        const data = (await response.json()) as any;
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('AI Provider returned empty choices/content');

        return content;
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;

        if (err.name === 'AbortError') {
          logger.warn({ timeoutMs: env.AI_REQUEST_TIMEOUT_MS }, 'AI Provider request timed out');
        } else {
          logger.warn({ err: err.message, attempt }, 'AI Provider call attempt failed');
        }

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s...
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((res) => setTimeout(res, delay));
        }
      }
    }

    throw lastError || new Error('AI Provider calls exhausted without success');
  }

  async analyzeDocument(
    document: UnifiedDocument,
    options: DocumentAnalysisOptions
  ): Promise<DocumentAnalysis> {
    const startTime = Date.now();
    logger.info({ docId: document.id, model: env.AI_MODEL }, 'Starting OpenAI-compatible document analysis');

    // Hard Validation: Verify that document has readable content or visual structures
    const hasAnyText = (document.extractedText && document.extractedText.trim().length > 0) || document.features.wordCount > 0;
    const hasVisualStructures =
      document.pages.some((p) => p.visualElements && p.visualElements.length > 0) ||
      document.features.chartCount > 0 ||
      document.features.tableCount > 0 ||
      document.features.formulaCount > 0;

    if (!hasAnyText && !hasVisualStructures) {
      throw new Error('DOCUMENT_CONTENT_UNREADABLE: Readable content could not be extracted from this document.');
    }

    // Context compression: send structured layout-aware page blocks
    const formattedPages = formatStructuredDocumentContext(document);

    const systemPrompt = `You are a world-class multimodal document intelligence system called Unthinkable Summarizer.
Analyze the following document and output ONLY valid JSON matching the exact schema below.

CRITICAL SUMMARIZATION & GROUNDING DIRECTIVES:
1. Grounding: Use ONLY information supported by the supplied document. Never invent names, dates, numbers, facts, conclusions, or context. If the document does not contain enough information for the requested level of detail, produce a shorter summary rather than fabricating or padding the response.
2. Generate all 3 distinct summary tiers:
   - "brief": Concise executive summary of core document identity, primary purpose, and most critical finding (target: ~100–150 words).
   - "balanced": Comprehensive narrative covering context, major sections/topics, key facts, metrics, and outcomes (target: ~250–350 words).
   - "detailed": Deep analytical breakdown detailing section-level explanations, supporting evidence, metrics, constraints, nuances, and conclusions supported by the document (target: ~600–800 words).

JSON Schema:
{
  "documentId": "${document.id}",
  "sessionId": "${document.sessionId}",
  "title": "Clear Document Title",
  "documentType": "Resume / Research / Job Description / Financial / etc.",
  "mode": "${options.mode}",
  "summary": "Active summary text corresponding to ${options.mode}",
  "summaries": {
    "brief": {
      "content": "Concise executive synthesis (~100–150 words target)",
      "targetRange": "100–150"
    },
    "balanced": {
      "content": "Moderate-depth comprehensive summary (~250–350 words target)",
      "targetRange": "250–350"
    },
    "detailed": {
      "content": "Deep analytical breakdown (~600–800 words target)",
      "targetRange": "600–800"
    }
  },
  "keyTakeaways": [
    { "id": "kt-1", "point": "Concise key takeaway", "page": 1, "citationReason": "Direct citation reason" }
  ],
  "importantNumbers": [
    { "value": "₹3L", "label": "Compensation figure", "page": 1, "context": "Surrounding context", "category": "currency" }
  ],
  "importantDates": [
    { "date": "2026", "event": "Milestone description", "page": 1 }
  ],
  "entities": [
    { "name": "Company Name", "type": "Organization", "occurrences": 3 }
  ],
  "sections": [
    { "number": "01", "title": "Section Title", "page": 1, "summary": "Section summary" }
  ],
  "visualInsights": [
    { "type": "Table/Chart/Formula/Handwriting", "description": "Insight description", "page": 1, "formulaOrData": "" }
  ],
  "improvementSuggestions": [
    { "area": "Structure", "issue": "Identified issue", "recommendation": "Actionable advice", "severity": "medium", "page": 1 }
  ],
  "suggestedQuestions": [
    "Contextual smart question 1",
    "Contextual smart question 2"
  ],
  "citations": [
    { "documentId": "${document.id}", "page": 1, "reason": "Reason", "confidence": 0.95 }
  ],
  "operationalMode": "full",
  "aiProviderUsed": "${env.AI_MODEL}",
  "warnings": []
}`;

    const rawJson = await this.callChatCompletion([
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `DOCUMENT METADATA:\nFilename: ${document.originalName}\nPages: ${document.features.pageCount}\nWord Count: ${document.features.wordCount}\nDocument Type: ${document.features.documentType}\n\nACTUAL EXTRACTED DOCUMENT CONTENT:\n${formattedPages}`,
      },
    ]);

    const cleaned = this.cleanJsonString(rawJson);
    const parsed = JSON.parse(cleaned);

    // Calculate deterministic word counts on backend using centralized countWords utility
    if (parsed.summaries) {
      if (parsed.summaries.brief) {
        parsed.summaries.brief.wordCount = countWords(parsed.summaries.brief.content || '');
        parsed.summaries.brief.targetRange = '100–150';
      }
      if (parsed.summaries.balanced) {
        parsed.summaries.balanced.wordCount = countWords(parsed.summaries.balanced.content || '');
        parsed.summaries.balanced.targetRange = '250–350';
      }
      if (parsed.summaries.detailed) {
        parsed.summaries.detailed.wordCount = countWords(parsed.summaries.detailed.content || '');
        parsed.summaries.detailed.targetRange = '600–800';
      }
    } else if (parsed.summary) {
      // Fallback if provider generated single summary
      const singleWordCount = countWords(parsed.summary);
      parsed.summaries = {
        brief: { content: parsed.summary, wordCount: singleWordCount, targetRange: '100–150' },
        balanced: { content: parsed.summary, wordCount: singleWordCount, targetRange: '250–350' },
        detailed: { content: parsed.summary, wordCount: singleWordCount, targetRange: '600–800' },
      };
    }

    // Set active summary
    const selectedMode = options.mode || 'balanced';
    parsed.mode = selectedMode;
    parsed.summary = parsed.summaries?.[selectedMode]?.content || parsed.summary || '';

    parsed.durationMs = Date.now() - startTime;
    parsed.createdAt = new Date().toISOString();

    // Validate with Zod
    const validated = DocumentAnalysisSchema.parse(parsed);
    return validated;
  }

  async answerQuestion(
    question: string,
    context: {
      document?: UnifiedDocument;
      documents?: UnifiedDocument[];
      retrievedChunks: Array<{ pageNumber: number; documentId?: string; text: string }>;
      chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    }
  ): Promise<QuestionAnswer> {
    const formattedChunks = context.retrievedChunks
      .map((c) => `[Document ${c.documentId || 'current'}, Page ${c.pageNumber}]:\n${c.text}`)
      .join('\n\n');

    const historyMessages = (context.chatHistory || []).slice(-6).map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    }));

    const systemPrompt = `You are Unthinkable Summarizer, an intelligent document Q&A assistant.
Answer the question using ONLY the provided document evidence. Cite specific page numbers for every important claim.
If the evidence does not contain the answer, state: "I couldn't find enough evidence in the uploaded documents to answer that confidently."

Output ONLY JSON in this format:
{
  "question": "${question}",
  "answer": "Grounded answer with citations...",
  "citations": [
    { "documentId": "id", "page": 1, "snippet": "Relevant text excerpt", "confidence": 0.95 }
  ],
  "confidence": 0.95,
  "suggestedFollowUps": ["Follow-up question 1", "Follow-up question 2"],
  "relevantPages": [1],
  "operationalMode": "full",
  "provider": "${env.AI_MODEL}"
}`;

    const rawJson = await this.callChatCompletion([
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: `DOCUMENT CONTEXT EVIDENCE:\n${formattedChunks}\n\nQUESTION: ${question}` },
    ]);

    const cleaned = this.cleanJsonString(rawJson);
    const parsed = JSON.parse(cleaned);

    return QuestionAnswerSchema.parse(parsed);
  }

  async compareDocuments(
    documents: UnifiedDocument[],
    options: MultiDocumentAnalysisOptions
  ): Promise<MultiDocumentAnalysis> {
    const docSummaries = documents
      .map((d) => `=== DOCUMENT ID: ${d.id} | NAME: ${d.originalName} ===\n${d.extractedText.substring(0, 3000)}`)
      .join('\n\n');

    const systemPrompt = `You are Unthinkable Summarizer. Perform a comprehensive multi-document synthesis and comparison across the provided documents.
Output ONLY JSON in this format:
{
  "sessionId": "${documents[0]?.sessionId || 'default'}",
  "documentIds": ${JSON.stringify(documents.map((d) => d.id))},
  "documentCount": ${documents.length},
  "combinedSummary": "Cross-document synthesis...",
  "sharedThemes": ["Theme 1", "Theme 2"],
  "keyDifferences": [
    {
      "aspect": "Topic Area",
      "details": [
        { "documentId": "${documents[0]?.id}", "documentName": "${documents[0]?.originalName}", "point": "Point", "page": 1 }
      ]
    }
  ],
  "crossDocumentInsights": ["Insight 1", "Insight 2"],
  "comparisonMatrix": [
    { "feature": "Metric/Feature", "values": { "${documents[0]?.originalName}": "Value" } }
  ],
  "citations": [],
  "suggestedQuestions": ["Comparative question 1", "Comparative question 2"],
  "operationalMode": "full",
  "aiProviderUsed": "${env.AI_MODEL}",
  "createdAt": "${new Date().toISOString()}"
}`;

    const rawJson = await this.callChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `DOCUMENTS TO COMPARE:\n\n${docSummaries}` },
    ]);

    const cleaned = this.cleanJsonString(rawJson);
    const parsed = JSON.parse(cleaned);

    return MultiDocumentAnalysisSchema.parse(parsed);
  }
}

export const openAICompatibleProvider = new OpenAICompatibleProvider();
