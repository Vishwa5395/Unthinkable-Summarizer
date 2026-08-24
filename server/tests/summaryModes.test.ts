import { describe, it, expect, vi } from 'vitest';
import { countWords, stripMarkdown } from '../src/utils/textProcessing.js';
import { deterministicAIProvider } from '../src/providers/ai/DeterministicAIProvider.js';
import { openAICompatibleProvider } from '../src/providers/ai/OpenAICompatibleProvider.js';
import { UnifiedDocument } from '../src/schemas/document.schema.js';

describe('Dynamic Summary Modes & Word Count Verification Suite', () => {
  const sampleDocument: UnifiedDocument = {
    id: 'doc_summary_test_1',
    sessionId: 'sess_summary_test',
    filename: 'quarterly_report.pdf',
    originalName: 'quarterly_report.pdf',
    mimeType: 'application/pdf',
    size: 50000,
    hash: 'hash_sum_test',
    status: 'COMPLETE',
    progressPercent: 100,
    features: {
      pageCount: 3,
      wordCount: 1450,
      readingTimeMinutes: 7,
      chartCount: 2,
      tableCount: 1,
      formulaCount: 1,
      imageCount: 0,
      hasHandwriting: false,
      isScanned: false,
      overallOcrConfidence: 1.0,
      documentType: 'Financial / Quarterly Report',
      language: 'English',
    },
    pages: [
      {
        pageNumber: 1,
        width: 595,
        height: 842,
        text: 'Executive Summary\n\nRevenue for Q4 reached $45.2M, representing a 28% year-over-year growth across all cloud segments.\nOperating margins expanded by 340 basis points due to automated infrastructure scaling.\nCustomer retention remained exceptional at 96.5% with zero enterprise client churn.',
        contentType: 'TEXT',
        confidence: 1.0,
        isHandwritten: false,
        hasFormulas: false,
        hasTables: false,
        hasCharts: false,
        blocks: [
          {
            id: 'b1',
            pageNumber: 1,
            type: 'heading',
            text: 'Executive Summary',
            bbox: { x: 0, y: 0, width: 595, height: 40 },
            confidence: 1.0,
            readingOrder: 1,
          },
          {
            id: 'b2',
            pageNumber: 1,
            type: 'paragraph',
            text: 'Revenue for Q4 reached $45.2M, representing a 28% year-over-year growth across all cloud segments.',
            bbox: { x: 0, y: 50, width: 595, height: 40 },
            confidence: 1.0,
            readingOrder: 2,
          },
          {
            id: 'b3',
            pageNumber: 1,
            type: 'paragraph',
            text: 'Operating margins expanded by 340 basis points due to automated infrastructure scaling.',
            bbox: { x: 0, y: 100, width: 595, height: 40 },
            confidence: 1.0,
            readingOrder: 3,
          },
          {
            id: 'b4',
            pageNumber: 1,
            type: 'paragraph',
            text: 'Customer retention remained exceptional at 96.5% with zero enterprise client churn.',
            bbox: { x: 0, y: 150, width: 595, height: 40 },
            confidence: 1.0,
            readingOrder: 4,
          },
        ],
        visualElements: [],
        detectedFeatures: [],
        wordCount: 42,
      },
      {
        pageNumber: 2,
        width: 595,
        height: 842,
        text: 'Operational Performance\n\nCloud infrastructure latency decreased to 12ms average globally.\nEngineering expanded the platform to three new availability zones in Frankfurt, Tokyo, and Singapore.\nR&D investments focused heavily on real-time layout preservation and document intelligence models.',
        contentType: 'TEXT',
        confidence: 1.0,
        isHandwritten: false,
        hasFormulas: false,
        hasTables: false,
        hasCharts: false,
        blocks: [
          {
            id: 'b5',
            pageNumber: 2,
            type: 'heading',
            text: 'Operational Performance',
            bbox: { x: 0, y: 0, width: 595, height: 40 },
            confidence: 1.0,
            readingOrder: 1,
          },
          {
            id: 'b6',
            pageNumber: 2,
            type: 'paragraph',
            text: 'Cloud infrastructure latency decreased to 12ms average globally.',
            bbox: { x: 0, y: 50, width: 595, height: 40 },
            confidence: 1.0,
            readingOrder: 2,
          },
          {
            id: 'b7',
            pageNumber: 2,
            type: 'paragraph',
            text: 'Engineering expanded the platform to three new availability zones in Frankfurt, Tokyo, and Singapore.',
            bbox: { x: 0, y: 100, width: 595, height: 40 },
            confidence: 1.0,
            readingOrder: 3,
          },
          {
            id: 'b8',
            pageNumber: 2,
            type: 'paragraph',
            text: 'R&D investments focused heavily on real-time layout preservation and document intelligence models.',
            bbox: { x: 0, y: 150, width: 595, height: 40 },
            confidence: 1.0,
            readingOrder: 4,
          },
        ],
        visualElements: [],
        detectedFeatures: [],
        wordCount: 39,
      },
    ],
    extractedText: 'Executive Summary\n\nRevenue for Q4 reached $45.2M, representing a 28% year-over-year growth across all cloud segments.\nOperating margins expanded by 340 basis points due to automated infrastructure scaling.\nCustomer retention remained exceptional at 96.5% with zero enterprise client churn.\n\nOperational Performance\n\nCloud infrastructure latency decreased to 12ms average globally.\nEngineering expanded the platform to three new availability zones in Frankfurt, Tokyo, and Singapore.\nR&D investments focused heavily on real-time layout preservation and document intelligence models.',
    metadata: {},
    isAnonymous: true,
    createdAt: new Date().toISOString(),
  };

  describe('1. Centralized Word Count & Markdown Stripping Utility', () => {
    it('should accurately count words ignoring markdown formatting, code blocks, HTML, and bullets', () => {
      const markdownSample = `
# Executive Strategy 2026

Here is a **critical finding** with [citation link](https://unthinkable.ai):
- Point 1: Revenue increased by 25% in FY2025.
- Point 2: Latency dropped to 10ms.

\`\`\`ts
const codeBlock = "should be ignored";
\`\`\`

| Quarter | Revenue |
| Q1 | $10M |
| Q2 | $15M |

<span class="badge">Audited Financials</span>
`;
      const stripped = stripMarkdown(markdownSample);
      expect(stripped).not.toContain('```');
      expect(stripped).not.toContain('<span');
      expect(stripped).not.toContain('#');

      const wordCount = countWords(markdownSample);
      expect(wordCount).toBeGreaterThan(15);
      expect(wordCount).toBeLessThan(35);
    });

    it('should return 0 for empty or whitespace-only inputs', () => {
      expect(countWords('')).toBe(0);
      expect(countWords('   \n\t  ')).toBe(0);
      expect(countWords('###   ***   ---')).toBe(0);
    });
  });

  describe('2. Multi-Mode Extractive Fallback in DeterministicAIProvider', () => {
    it('should generate genuinely distinct Brief, Balanced, and Detailed summaries in a single analysis', async () => {
      const analysis = await deterministicAIProvider.analyzeDocument(sampleDocument, { mode: 'balanced' });

      // Verify summaries map exists
      expect(analysis.summaries).toBeDefined();
      const { brief, balanced, detailed } = analysis.summaries!;

      // 1. All 3 modes must have content and target ranges
      expect(brief.content.length).toBeGreaterThan(0);
      expect(brief.targetRange).toBe('100–150');
      expect(brief.wordCount).toBe(countWords(brief.content));

      expect(balanced.content.length).toBeGreaterThan(0);
      expect(balanced.targetRange).toBe('250–350');
      expect(balanced.wordCount).toBe(countWords(balanced.content));

      expect(detailed.content.length).toBeGreaterThan(0);
      expect(detailed.targetRange).toBe('600–800');
      expect(detailed.wordCount).toBe(countWords(detailed.content));

      // 2. The summaries must be genuinely distinct (different content lengths and sentence counts)
      expect(brief.content).not.toBe(balanced.content);
      expect(balanced.content).not.toBe(detailed.content);
      expect(detailed.content.length).toBeGreaterThanOrEqual(balanced.content.length);
      expect(balanced.content.length).toBeGreaterThanOrEqual(brief.content.length);

      // 3. Active summary matches mode
      expect(analysis.summary).toBe(balanced.content);
    });

    it('should not alter the original document word count when switching summary modes', async () => {
      const originalDocWordCount = sampleDocument.features.wordCount; // 1450

      const briefAnalysis = await deterministicAIProvider.analyzeDocument(sampleDocument, { mode: 'brief' });
      expect(sampleDocument.features.wordCount).toBe(originalDocWordCount);
      expect(briefAnalysis.summary).toBe(briefAnalysis.summaries!.brief.content);

      const detailedAnalysis = await deterministicAIProvider.analyzeDocument(sampleDocument, { mode: 'detailed' });
      expect(sampleDocument.features.wordCount).toBe(originalDocWordCount);
      expect(detailedAnalysis.summary).toBe(detailedAnalysis.summaries!.detailed.content);
    });
  });

  describe('3. Short Document Safe Handling', () => {
    it('should naturally produce concise summaries for short documents without padding or hallucination', async () => {
      const shortDoc: UnifiedDocument = {
        ...sampleDocument,
        id: 'doc_short',
        extractedText: 'Notice: The office will be closed on Friday for national holiday.',
        features: {
          ...sampleDocument.features,
          wordCount: 11,
          pageCount: 1,
        },
        pages: [
          {
            pageNumber: 1,
            width: 595,
            height: 842,
            text: 'Notice: The office will be closed on Friday for national holiday.',
            contentType: 'TEXT',
            confidence: 1.0,
            isHandwritten: false,
            hasFormulas: false,
            hasTables: false,
            hasCharts: false,
            blocks: [
              {
                id: 's1',
                pageNumber: 1,
                type: 'paragraph',
                text: 'Notice: The office will be closed on Friday for national holiday.',
                bbox: { x: 0, y: 0, width: 595, height: 40 },
                confidence: 1.0,
                readingOrder: 1,
              },
            ],
            visualElements: [],
            detectedFeatures: [],
            wordCount: 11,
          },
        ],
      };

      const analysis = await deterministicAIProvider.analyzeDocument(shortDoc, { mode: 'detailed' });
      expect(analysis.summaries).toBeDefined();
      expect(analysis.summaries!.brief.content).toContain('closed on Friday');
      // Must not invent content
      expect(analysis.summaries!.brief.wordCount).toBeLessThan(50);
    });
  });

  describe('4. OpenAICompatibleProvider Multi-Level Generation & Fallback Handling', () => {
    it('should calculate deterministic word counts from AI generated content', async () => {
      const mockAiContent = JSON.stringify({
        documentId: 'doc_ai_test',
        sessionId: 'sess_ai_test',
        title: 'Quarterly Cloud Analysis',
        documentType: 'Financial Report',
        mode: 'brief',
        summary: 'Revenue grew by 28% in Q4.',
        summaries: {
          brief: {
            content: 'Q4 revenue reached $45.2M with 28% YoY growth and zero enterprise churn.',
            targetRange: '100–150',
          },
          balanced: {
            content: 'Q4 revenue reached $45.2M representing 28% growth. Operating margins expanded by 340 bps while latency decreased to 12ms globally across Frankfurt and Tokyo regions.',
            targetRange: '250–350',
          },
          detailed: {
            content: 'Comprehensive performance review: Q4 revenue reached $45.2M with 28% YoY expansion. Automated infrastructure scaling drove a 340 bps increase in operating margins. Latency dropped to 12ms following zone expansions in Frankfurt, Tokyo, and Singapore. Customer retention held at 96.5% with strong R&D focus on layout preservation.',
            targetRange: '600–800',
          },
        },
        keyTakeaways: [],
        importantNumbers: [],
        importantDates: [],
        entities: [],
        sections: [],
        visualInsights: [],
        improvementSuggestions: [],
        suggestedQuestions: [],
        citations: [],
        operationalMode: 'full',
        aiProviderUsed: 'gpt-4o-mini',
        warnings: [],
      });

      vi.spyOn(openAICompatibleProvider as any, 'callChatCompletion').mockResolvedValue(mockAiContent);

      const result = await openAICompatibleProvider.analyzeDocument(sampleDocument, { mode: 'brief' });

      expect(result.summaries).toBeDefined();
      expect(result.summaries!.brief.wordCount).toBe(countWords(result.summaries!.brief.content));
      expect(result.summaries!.balanced.wordCount).toBe(countWords(result.summaries!.balanced.content));
      expect(result.summaries!.detailed.wordCount).toBe(countWords(result.summaries!.detailed.content));
      expect(result.summary).toBe(result.summaries!.brief.content);
    });

    it('should safely recover when AI returns a single summary without the summaries map', async () => {
      const mockSingleSummary = JSON.stringify({
        documentId: 'doc_ai_test',
        sessionId: 'sess_ai_test',
        title: 'Single Summary Document',
        documentType: 'General',
        mode: 'balanced',
        summary: 'This document describes high performance cloud computing architecture.',
        keyTakeaways: [],
        importantNumbers: [],
        importantDates: [],
        entities: [],
        sections: [],
        visualInsights: [],
        improvementSuggestions: [],
        suggestedQuestions: [],
        citations: [],
        operationalMode: 'full',
        aiProviderUsed: 'gpt-4o-mini',
        warnings: [],
      });

      vi.spyOn(openAICompatibleProvider as any, 'callChatCompletion').mockResolvedValue(mockSingleSummary);

      const result = await openAICompatibleProvider.analyzeDocument(sampleDocument, { mode: 'balanced' });
      expect(result.summaries).toBeDefined();
      expect(result.summaries!.brief.content).toBe('This document describes high performance cloud computing architecture.');
      expect(result.summaries!.brief.wordCount).toBe(8);
    });
  });
});
