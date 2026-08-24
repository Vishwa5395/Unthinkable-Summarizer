import { describe, it, expect } from 'vitest';
import {
  extractImportantNumbers,
  extractImportantDates,
  extractDocumentSections,
  classifyDocumentType,
  extractKeySentences,
  generateImprovementSuggestions,
} from '../src/utils/textProcessing.js';

describe('Deterministic NLP & Intelligence Engine', () => {
  const samplePages = [
    {
      pageNumber: 1,
      text: `# Unthinkable Software Engineer Position
The total annual compensation for this role is ₹3,00,000 with a performance bonus.
The mandatory internship duration is 6 months starting on August 15, 2026.
Our team consists of 120 employees across 4 global offices.
We achieved a 30% increase in retrieval throughput this quarter.`,
    },
    {
      pageNumber: 2,
      text: `## Selection Process & Methodology
Candidates will undergo 3 technical assessment rounds focusing on systems architecture.
We require 99.9% uptime for our production microservices.
The candidate will manage over 50,000 users across 250 GB of indexed document data.`,
    },
  ];

  it('should extract important numbers, currencies, durations, and percentages with context', () => {
    const numbers = extractImportantNumbers(samplePages);

    expect(numbers.length).toBeGreaterThanOrEqual(4);

    const currencyMatch = numbers.find((n) => n.value.includes('3,00,000') || n.value.includes('₹'));
    expect(currencyMatch).toBeDefined();
    expect(currencyMatch?.page).toBe(1);

    const durationMatch = numbers.find((n) => n.value.includes('6 months'));
    expect(durationMatch).toBeDefined();

    const percentageMatch = numbers.find((n) => n.value.includes('30%') || n.value.includes('99.9%'));
    expect(percentageMatch).toBeDefined();
  });

  it('should extract important dates with event context and page references', () => {
    const dates = extractImportantDates(samplePages);

    expect(dates.length).toBeGreaterThan(0);
    const date2026 = dates.find((d) => d.date.includes('2026') || d.date.includes('August'));
    expect(date2026).toBeDefined();
    expect(date2026?.page).toBe(1);
  });

  it('should generate structured document sections outline', () => {
    const sections = extractDocumentSections(samplePages);

    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections[0].title).toContain('Unthinkable Software Engineer');
    expect(sections[0].page).toBe(1);
    expect(sections[1].title).toContain('Selection Process');
    expect(sections[1].page).toBe(2);
  });

  it('should accurately classify document type', () => {
    const jdText = samplePages.map((p) => p.text).join('\n');
    const jdType = classifyDocumentType(jdText);
    expect(jdType.type).toContain('Job Description');

    const resumeText = 'Education: B.Tech Computer Science. Experience: Full-Stack Developer at Google. Skills: React, Node, Python, C++.';
    const resumeType = classifyDocumentType(resumeText);
    expect(resumeType.type).toContain('Resume');

    const researchText = 'Abstract: We present an empirical study of neural language model performance. Methodology: Experimental benchmarks et al. References.';
    const researchType = classifyDocumentType(researchText);
    expect(researchType.type).toContain('Research Paper');
  });

  it('should extract key sentences with TF-IDF scoring', () => {
    const sentences = extractKeySentences(samplePages, 3);
    expect(sentences.length).toBeGreaterThanOrEqual(1);
    expect(sentences[0].sentence).toBeDefined();
    expect(sentences[0].pageNumber).toBeGreaterThanOrEqual(1);
    expect(sentences[0].score).toBeGreaterThan(0);
  });

  it('should generate document-tailored improvement suggestions', () => {
    const suggestions = generateImprovementSuggestions('Job Description', samplePages[0].text, samplePages);
    expect(suggestions.length).toBeGreaterThanOrEqual(2);
    expect(suggestions[0].area).toBeDefined();
    expect(suggestions[0].recommendation).toBeDefined();
  });
});
