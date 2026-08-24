import { describe, it, expect, vi } from 'vitest';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { pdfExtractionService } from '../src/services/document/PdfExtractionService.js';
import { deterministicAIProvider } from '../src/providers/ai/DeterministicAIProvider.js';
import { documentPipelineService } from '../src/services/document/DocumentPipelineService.js';
import { memoryStore } from '../src/models/MemoryStore.js';
import { UnifiedDocument } from '../src/schemas/document.schema.js';
import { countWords, formatStructuredDocumentContext } from '../src/utils/textProcessing.js';

describe('Argha_ai.pdf Data-Flow & Real Summary Regression Suite', () => {
  // Generate a realistic 1-page ~450-word technical resume fixture matching Argha_ai.pdf
  async function createArghaAiPdfFixture(): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const page = pdfDoc.addPage([600, 842]); // A4 dimensions

    const lines: Array<{ text: string; isBold?: boolean; size?: number; y: number }> = [
      { text: 'Argha Chakrabarty - Senior AI / ML Engineer & Full Stack Architect', isBold: true, size: 14, y: 800 },
      { text: 'Email: argha@example.com | GitHub: github.com/argha | LinkedIn: linkedin.com/in/argha', isBold: false, size: 10, y: 780 },
      { text: 'Summary', isBold: true, size: 12, y: 755 },
      { text: 'Experienced AI and Full Stack Engineer with 6+ years designing high-throughput multimodal document intelligence systems.', isBold: false, size: 10, y: 740 },
      { text: 'Expert in LLM orchestration, RAG architectures, layout analysis, vector embeddings, and cloud-native scalable backends.', isBold: false, size: 10, y: 725 },
      { text: 'Core Technical Competencies', isBold: true, size: 12, y: 700 },
      { text: 'Languages: Python, TypeScript, JavaScript, Go, SQL, C++', isBold: false, size: 10, y: 685 },
      { text: 'Frameworks: PyTorch, TensorFlow, HuggingFace, React, Node.js, Express, FastAPI, LangChain', isBold: false, size: 10, y: 670 },
      { text: 'Data & Cloud: PostgreSQL, MongoDB, Redis, Pinecone, Docker, Kubernetes, AWS Lambda, GCP Vertex AI', isBold: false, size: 10, y: 655 },
      { text: 'Professional Experience', isBold: true, size: 12, y: 630 },
      { text: 'Lead AI Engineer | Cognitive Systems Corp (2023 - Present)', isBold: true, size: 10, y: 615 },
      { text: '• Architected multimodal PDF understanding pipeline processing over 500,000 documents daily with 99.4% precision.', isBold: false, size: 10, y: 600 },
      { text: '• Decreased OCR processing latency by 45% using distributed asynchronous worker pools and adaptive tile rendering.', isBold: false, size: 10, y: 585 },
      { text: '• Engineered hybrid semantic search combining dense vector embeddings with BM25 keyword matching.', isBold: false, size: 10, y: 570 },
      { text: 'Senior Software Engineer | DataNexus Technologies (2020 - 2023)', isBold: true, size: 10, y: 545 },
      { text: '• Developed continuous streaming analytics platform supporting 25,000 concurrent enterprise sessions.', isBold: false, size: 10, y: 530 },
      { text: '• Implemented secure JWT authentication, role-based access control, and rate limiting middlewares.', isBold: false, size: 10, y: 515 },
      { text: '• Reduced cloud infrastructure expenditure by $120,000 annually through intelligent caching and resource quotas.', isBold: false, size: 10, y: 500 },
      { text: 'Key Projects & Open Source', isBold: true, size: 12, y: 475 },
      { text: 'Multimodal Document Summarizer: Built end-to-end continuous document viewer with citation linking and Q&A.', isBold: false, size: 10, y: 460 },
      { text: 'VectorFlow Engine: High-performance embedding retrieval engine with sub-10ms nearest neighbor queries.', isBold: false, size: 10, y: 445 },
      { text: 'Education & Certifications', isBold: true, size: 12, y: 420 },
      { text: 'Bachelor of Technology in Computer Science & Engineering | Tier 1 Institute (2016 - 2020) | GPA: 8.9 / 10', isBold: false, size: 10, y: 405 },
      { text: 'Certified AWS Solutions Architect & Deep Learning Specialization by DeepLearning.AI', isBold: false, size: 10, y: 390 },
      { text: 'Publications & Achievements', isBold: true, size: 12, y: 365 },
      { text: 'Authored research paper on Efficient Multimodal Transformers presented at International AI Conference 2024.', isBold: false, size: 10, y: 350 },
      { text: 'First Place Winner at National FinTech Hackathon 2022 among 350 competing engineering teams.', isBold: false, size: 10, y: 335 },
    ];

    for (const l of lines) {
      page.drawText(l.text, {
        x: 50,
        y: l.y,
        size: l.size || 10,
        font: l.isBold ? boldFont : font,
        color: rgb(0, 0, 0),
      });
    }

    return Buffer.from(await pdfDoc.save());
  }

  it('should faithfully extract all ~400+ words from Argha_ai.pdf without dropping bullet lines or sections', async () => {
    const pdfBuffer = await createArghaAiPdfFixture();
    const filename = 'Argha_ai.pdf';

    // 1. STAGE 1 & 2 Extraction
    const extractionResult = await pdfExtractionService.extractPdf(pdfBuffer, filename);

    // Assert Page Count and Word Count
    expect(extractionResult.features.pageCount).toBe(1);
    expect(extractionResult.pages.length).toBe(1);
    expect(extractionResult.features.wordCount).toBeGreaterThan(200);
    expect(extractionResult.pages[0].blocks.length).toBeGreaterThan(5);

    // Verify raw extracted text contains core content
    expect(extractionResult.extractedText).toContain('Argha Chakrabarty');
    expect(extractionResult.extractedText).toContain('PyTorch');
    expect(extractionResult.extractedText).toContain('Cognitive Systems Corp');
    expect(extractionResult.extractedText).toContain('$120,000');
  });

  it('should deliver real document context to AI and produce grounded summary without 0-word placeholder text', async () => {
    const pdfBuffer = await createArghaAiPdfFixture();
    const filename = 'Argha_ai.pdf';

    const extractionResult = await pdfExtractionService.extractPdf(pdfBuffer, filename);

    const unifiedDoc: UnifiedDocument = {
      id: 'doc_argha_test',
      sessionId: 'sess_argha',
      filename,
      originalName: filename,
      mimeType: 'application/pdf',
      size: pdfBuffer.length,
      hash: 'hash_argha_test',
      status: 'COMPLETE',
      progressPercent: 100,
      features: extractionResult.features,
      pages: extractionResult.pages,
      extractedText: extractionResult.extractedText,
      metadata: {},
      isAnonymous: true,
      createdAt: new Date().toISOString(),
    };

    // 1. Verify structured context formatting for AI
    const structuredContext = formatStructuredDocumentContext(unifiedDoc);
    expect(structuredContext).toContain('Argha Chakrabarty');
    expect(structuredContext).toContain('Cognitive Systems Corp');
    expect(structuredContext).toContain('PyTorch');

    // 2. Generate Analysis
    const analysis = await deterministicAIProvider.analyzeDocument(unifiedDoc, { mode: 'balanced' });

    // 3. Verify that summary is grounded in the document and NOT a generic 0-word placeholder!
    expect(analysis.summary).not.toContain('contains 1 page(s) with 0 words');
    expect(analysis.summary).not.toContain('Primary content is categorized as General Document');
    expect(analysis.summary.length).toBeGreaterThan(50);
    expect(analysis.summaries?.balanced.wordCount).toBeGreaterThan(20);

    // 4. Verify entities and key takeaways
    expect(analysis.keyTakeaways.length).toBeGreaterThan(0);
    expect(analysis.importantNumbers.some((n) => n.value.includes('120,000') || n.value.includes('500,000') || n.value.includes('45%'))).toBe(true);

    // 5. Verify that original document word count remains unchanged regardless of summary mode
    expect(unifiedDoc.features.wordCount).toBeGreaterThan(200);
  });

  it('should reject running analysis when document extraction is not yet READY', async () => {
    const queuedDoc: UnifiedDocument = {
      id: 'doc_queued_guard',
      sessionId: 'sess_guard',
      filename: 'Argha_ai.pdf',
      originalName: 'Argha_ai.pdf',
      mimeType: 'application/pdf',
      size: 1000,
      hash: 'hash_guard',
      status: 'EXTRACTING',
      progressPercent: 30,
      features: {
        pageCount: 1,
        wordCount: 0,
        readingTimeMinutes: 1,
        chartCount: 0,
        tableCount: 0,
        formulaCount: 0,
        imageCount: 0,
        hasHandwriting: false,
        isScanned: false,
        overallOcrConfidence: 1,
        documentType: 'General Document',
        language: 'English',
      },
      pages: [],
      extractedText: '',
      metadata: {},
      isAnonymous: true,
      createdAt: new Date().toISOString(),
    };

    memoryStore.saveDocument(queuedDoc);

    // Assert that runAnalysisForMode throws DOCUMENT_NOT_READY rather than analyzing 0 words
    await expect(
      documentPipelineService.runAnalysisForMode(queuedDoc.id, 'balanced')
    ).rejects.toThrow('DOCUMENT_NOT_READY');
  });
});
