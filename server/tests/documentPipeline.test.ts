import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { documentPipelineService } from '../src/services/document/DocumentPipelineService.js';
import { memoryStore } from '../src/models/MemoryStore.js';
import { contextRetrievalService } from '../src/services/retrieval/ContextRetrievalService.js';
import { deterministicAIProvider } from '../src/providers/ai/DeterministicAIProvider.js';

describe('End-to-End Document Pipeline with Real PDF Fixture', () => {
  const fixturePath = path.resolve(process.cwd(), '../test-fixtures/sample-job-description.pdf');

  it(
    'should process, extract, summarize, and answer questions from the sample PDF',
    async () => {
      const fileBuffer = await fs.readFile(fixturePath);
    expect(fileBuffer.length).toBeGreaterThan(0);

    // 1. Create upload job in pipeline
    const doc = await documentPipelineService.createUploadJob(
      fileBuffer,
      'sample-job-description.pdf',
      'application/pdf',
      'test_pipeline_session'
    );

    expect(doc.id).toBeDefined();
    expect(doc.originalName).toBe('sample-job-description.pdf');

    // Poll until queue worker finishes processing
    let processedDoc = memoryStore.getDocument(doc.id);
    for (let i = 0; i < 40; i++) {
      processedDoc = memoryStore.getDocument(doc.id);
      if (processedDoc && (processedDoc.status === 'COMPLETE' || processedDoc.status === 'DEGRADED')) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(processedDoc).toBeDefined();
    expect(processedDoc?.status).toBe('COMPLETE');
    expect(processedDoc?.features.pageCount).toBe(2);
    expect(processedDoc?.pages.length).toBe(2);
    expect(processedDoc?.extractedText).toContain('UNTHINKABLE');

    // 2. Verify Structured Analysis
    const analysis = memoryStore.getAnalysis(doc.id, 'balanced');
    expect(analysis).toBeDefined();
    expect(analysis?.title).toContain('sample-job-description Analysis');
    expect(analysis?.summary).toBeDefined();
    expect(analysis?.keyTakeaways.length).toBeGreaterThan(0);
    expect(analysis?.keyTakeaways[0].page).toBeGreaterThanOrEqual(1);

    // Verify Numbers Worth Knowing
    expect(analysis?.importantNumbers.length).toBeGreaterThan(0);
    const compensationNum = analysis?.importantNumbers.find((n) => n.value.includes('3,00,000') || n.value.includes('Rs'));
    expect(compensationNum).toBeDefined();

    // 3. Test Contextual Retrieval & Q&A
    const retrievedChunks = contextRetrievalService.retrieveRelevantChunks([processedDoc!], 'What is the compensation and duration?', 3);
    expect(retrievedChunks.length).toBeGreaterThan(0);
    expect(retrievedChunks.some((c) => c.text.includes('3,00,000'))).toBe(true);
    expect(retrievedChunks[0].blockId).toBeDefined();
    expect(retrievedChunks[0].boundingBox).toBeDefined();

    const qaResult = await deterministicAIProvider.answerQuestion('What is the compensation and internship duration?', {
      document: processedDoc,
      retrievedChunks,
    });

    expect(qaResult.answer).toContain('3,00,000');
    expect(qaResult.citations.length).toBeGreaterThan(0);
    expect(qaResult.relevantPages).toContain(2);
  }, 20000);
});
