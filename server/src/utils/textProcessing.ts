import {
  ImportantNumber,
  DocumentSection,
  ImprovementSuggestion,
  DocumentBlock,
  UnifiedDocument,
} from '../schemas/document.schema.js';

// English Stopwords
export const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'can\'t', 'cannot', 'could',
  'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here',
  'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in',
  'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no',
  'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that',
  'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d',
  'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
  'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s',
  'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t',
  'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves'
]);

export function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/**
 * Strips markdown syntax, code fences, links, images, and formatting tokens
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/`[^`]*`/g, '') // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links
    .replace(/<[^>]*>/g, '') // html tags
    .replace(/^[#>*+\-]\s+/gm, '') // blockquotes, headers, bullets
    .replace(/[*_~|]/g, ' ') // bold, italic, strikethrough, table borders
    .replace(/^[=\-]{2,}\s*$/gm, ''); // setext header lines
}

/**
 * Centralized deterministic word count utility
 * Accurately counts real words while stripping markdown, HTML, code fences, and formatting artifacts.
 */
export function countWords(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  const stripped = stripMarkdown(text).trim();
  if (!stripped) return 0;

  return stripped
    .split(/\s+/)
    .filter((word) => {
      const cleanWord = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      return cleanWord.length > 0 && /[\p{L}\p{N}]/u.test(cleanWord);
    }).length;
}

export function splitIntoSentences(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  // 1. Split across newlines first to preserve line-level structure (e.g. resumes, bullet points)
  const rawSegments = cleaned
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const sentences: string[] = [];

  for (const seg of rawSegments) {
    // 2. If segment contains list markers or bullet symbols
    const bulletSplit = seg
      .split(/(?:^|\s+)(?:[•\-*]|\d+\.)\s+/)
      .map((b) => b.trim())
      .filter(Boolean);

    const partsToProcess = bulletSplit.length > 1 ? bulletSplit : [seg];

    for (const piece of partsToProcess) {
      // 3. Split on standard sentence terminal punctuation (.?! followed by space/capital or line end)
      const punctuationSplit = piece
        .replace(/([.?!])\s+(?=[A-Z0-9"']|$)/g, '$1|---|')
        .split('|---|')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const s of punctuationSplit) {
        if (s.length > 10 && countWords(s) >= 2) {
          sentences.push(s);
        } else if (s.length >= 4 && countWords(s) >= 1) {
          sentences.push(s);
        }
      }
    }
  }

  // Fallback: if no individual sentences passed filters but text has words, preserve cleaned text
  if (sentences.length === 0 && countWords(cleaned) > 0) {
    sentences.push(cleaned);
  }

  return sentences;
}

export function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

// Extractive Summarization using TF-IDF & TextRank Graph Algorithm
export function extractKeySentences(
  pages: Array<{ pageNumber: number; text: string; blocks?: DocumentBlock[] }>,
  targetCount: number = 5
): Array<{
  sentence: string;
  pageNumber: number;
  score: number;
  blockId?: string;
  boundingBox?: any;
}> {
  const allSentences: Array<{
    sentence: string;
    pageNumber: number;
    words: string[];
    blockId?: string;
    boundingBox?: any;
  }> = [];
  const docWordFreq: Map<string, number> = new Map();

  for (const p of pages) {
    const blocks = p.blocks || [];
    const nonHeaderBlocks = blocks.filter((b) => !b.isHeaderOrFooter);
    const candidateBlocks = nonHeaderBlocks.length > 0 ? nonHeaderBlocks : blocks;

    if (candidateBlocks.length > 0) {
      for (const block of candidateBlocks) {
        const sents = splitIntoSentences(block.text);
        for (const sent of sents) {
          const words = tokenizeWords(sent);
          if (words.length >= 1) {
            allSentences.push({
              sentence: sent,
              pageNumber: p.pageNumber,
              words,
              blockId: block.id,
              boundingBox: block.bbox,
            });
            const uniqueWords = new Set(words);
            for (const w of uniqueWords) {
              docWordFreq.set(w, (docWordFreq.get(w) || 0) + 1);
            }
          }
        }
      }
    } else if (p.text) {
      const sents = splitIntoSentences(p.text);
      for (const sent of sents) {
        const words = tokenizeWords(sent);
        if (words.length >= 1) {
          allSentences.push({ sentence: sent, pageNumber: p.pageNumber, words });
          const uniqueWords = new Set(words);
          for (const w of uniqueWords) {
            docWordFreq.set(w, (docWordFreq.get(w) || 0) + 1);
          }
        }
      }
    }
  }

  // Fallback: If sentence splitting yielded 0 results but page text exists, create entries from non-empty lines
  if (allSentences.length === 0) {
    for (const p of pages) {
      const lines = (p.text || '').split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const words = tokenizeWords(line);
        if (words.length > 0) {
          allSentences.push({ sentence: line, pageNumber: p.pageNumber, words });
          for (const w of new Set(words)) {
            docWordFreq.set(w, (docWordFreq.get(w) || 0) + 1);
          }
        }
      }
    }
  }

  if (allSentences.length === 0) return [];

  const totalSentences = allSentences.length;

  // Calculate TF-ISF score for each sentence
  const scoredSentences = allSentences.map((s, idx) => {
    let tfIsfScore = 0;
    const wordCounts: Map<string, number> = new Map();
    for (const w of s.words) {
      wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    }

    for (const [w, count] of wordCounts.entries()) {
      const tf = count / Math.max(1, s.words.length);
      const isf = Math.log(1 + totalSentences / (docWordFreq.get(w) || 1));
      tfIsfScore += tf * isf;
    }

    // Position bonus (early sentences in document/pages often contain key summaries)
    const posFactor = 1.0 + (idx === 0 ? 0.4 : idx < 5 ? 0.2 : 0);
    // Length penalty (avoid excessively long sentences)
    const lenFactor = s.words.length > 40 ? 0.8 : s.words.length < 3 ? 0.8 : 1.0;

    return {
      sentence: s.sentence,
      pageNumber: s.pageNumber,
      score: tfIsfScore * posFactor * lenFactor,
      blockId: s.blockId,
      boundingBox: s.boundingBox,
    };
  });

  // Sort descending by score
  scoredSentences.sort((a, b) => b.score - a.score);

  // Return top unique sentences
  const result: Array<{
    sentence: string;
    pageNumber: number;
    score: number;
    blockId?: string;
    boundingBox?: any;
  }> = [];
  const seenRoots = new Set<string>();

  for (const s of scoredSentences) {
    const root = s.sentence.substring(0, 30).toLowerCase();
    if (!seenRoots.has(root)) {
      seenRoots.add(root);
      result.push(s);
      if (result.length >= targetCount) break;
    }
  }

  return result;
}

// Important Numbers & Currencies Extractor with Bounding Box Linking
export function extractImportantNumbers(
  pages: Array<{ pageNumber: number; text: string; blocks?: DocumentBlock[] }>
): ImportantNumber[] {
  const results: ImportantNumber[] = [];
  const seenValues = new Set<string>();

  const patterns = [
    // Currencies: ₹3,00,000, Rs 50k, $120,000, €45M, £30k, 50 Lakhs
    {
      regex: /(?:(?:₹|Rs\.?|INR|\$|USD|€|EUR|£|GBP)\s*[\d,.]+(?:\s*(?:lakhs?|crores?|k|m|b|million|billion))?|[\d,.]+\s*(?:lakhs?|crores?|million|billion)\s*(?:rupees|dollars|inr|usd)?)/gi,
      category: 'currency' as const,
    },
    // Percentages: 30%, 15.5 %, 100 percent
    {
      regex: /[\d.]+\s*(?:%|percent(?:age)?)/gi,
      category: 'percentage' as const,
    },
    // Durations: 6 months, 2 years, 12 weeks, 45 days, 3 quarters
    {
      regex: /\b\d+\s*(?:months?|years?|weeks?|days?|quarters?|hrs?|hours?)\b/gi,
      category: 'duration' as const,
    },
    // Counts & Metrics: 120 employees, 50,000 users, 250 GB, 4.5 GPA
    {
      regex: /\b[\d,.]+\s*(?:employees|users|clients|nodes|gpa|cgpa|tb|gb|mb|ghz|mhz|pages|projects|patents|points)\b/gi,
      category: 'metric' as const,
    },
  ];

  for (const p of pages) {
    const blocks = p.blocks || [];

    if (blocks.length > 0) {
      for (const block of blocks) {
        if (block.isHeaderOrFooter) continue;
        const text = block.text;

        for (const { regex, category } of patterns) {
          const matches = text.matchAll(regex);
          for (const match of matches) {
            const val = match[0].trim();
            if (val.length < 2 || seenValues.has(val.toLowerCase())) continue;
            seenValues.add(val.toLowerCase());

            let label = text.replace(match[0], '').replace(/[:\-–—]/g, ' ').trim();
            if (!label || label.length < 3) {
              label = `${category.toUpperCase()} figure`;
            } else if (label.length > 50) {
              label = label.substring(0, 47) + '...';
            }

            results.push({
              value: val,
              label,
              page: p.pageNumber,
              blockId: block.id,
              boundingBox: block.bbox,
              context: text.substring(0, 100),
              category,
            });

            if (results.length >= 10) return results;
          }
        }
      }
    } else {
      const lines = p.text.split('\n');
      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine || cleanLine.length < 5) continue;

        for (const { regex, category } of patterns) {
          const matches = cleanLine.matchAll(regex);
          for (const match of matches) {
            const val = match[0].trim();
            if (val.length < 2 || seenValues.has(val.toLowerCase())) continue;
            seenValues.add(val.toLowerCase());

            let label = cleanLine.replace(match[0], '').replace(/[:\-–—]/g, ' ').trim();
            if (!label || label.length < 3) {
              label = `${category.toUpperCase()} figure`;
            } else if (label.length > 50) {
              label = label.substring(0, 47) + '...';
            }

            results.push({
              value: val,
              label,
              page: p.pageNumber,
              context: cleanLine.substring(0, 100),
              category,
            });

            if (results.length >= 10) return results;
          }
        }
      }
    }
  }

  return results;
}

// Important Dates Extractor
export function extractImportantDates(
  pages: Array<{ pageNumber: number; text: string; blocks?: DocumentBlock[] }>
): Array<{ date: string; event: string; page: number; blockId?: string; boundingBox?: any }> {
  const dates: Array<{ date: string; event: string; page: number; blockId?: string; boundingBox?: any }> = [];
  const seenDates = new Set<string>();

  const dateRegex = /\b(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:19|20)\d{2}(?:\s*[-–—]\s*(?:19|20)?\d{2})?)\b/gi;

  for (const p of pages) {
    const blocks = p.blocks || [];
    if (blocks.length > 0) {
      for (const block of blocks) {
        if (block.isHeaderOrFooter) continue;
        const matches = block.text.matchAll(dateRegex);
        for (const match of matches) {
          const dateStr = match[0].trim();
          if (seenDates.has(dateStr.toLowerCase())) continue;
          seenDates.add(dateStr.toLowerCase());

          let event = block.text.replace(match[0], '').replace(/[:\-–—]/g, ' ').trim();
          if (!event || event.length < 4) {
            event = 'Mentioned Milestone / Timeline';
          } else if (event.length > 60) {
            event = event.substring(0, 57) + '...';
          }

          dates.push({
            date: dateStr,
            event,
            page: p.pageNumber,
            blockId: block.id,
            boundingBox: block.bbox,
          });

          if (dates.length >= 8) return dates;
        }
      }
    } else {
      const lines = p.text.split('\n');
      for (const line of lines) {
        const matches = line.matchAll(dateRegex);
        for (const match of matches) {
          const dateStr = match[0].trim();
          if (seenDates.has(dateStr.toLowerCase())) continue;
          seenDates.add(dateStr.toLowerCase());

          let event = line.replace(match[0], '').replace(/[:\-–—]/g, ' ').trim();
          if (!event || event.length < 4) {
            event = 'Mentioned Milestone / Timeline';
          } else if (event.length > 60) {
            event = event.substring(0, 57) + '...';
          }

          dates.push({
            date: dateStr,
            event,
            page: p.pageNumber,
          });

          if (dates.length >= 8) return dates;
        }
      }
    }
  }

  return dates;
}

// Document Section Outline Generator
export function extractDocumentSections(
  pages: Array<{ pageNumber: number; text: string; blocks?: DocumentBlock[] }>
): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let sectionIndex = 1;

  for (const p of pages) {
    const blocks = p.blocks || [];
    const headingBlocks = blocks.filter((b) => b.type === 'heading');

    if (headingBlocks.length > 0) {
      for (const hb of headingBlocks) {
        const cleanTitle = hb.text.replace(/^#+\s*/, '').replace(/^[0-9]+(?:\.[0-9]+)*\s*[:\-–—.]?\s*/, '').trim();
        if (cleanTitle.length >= 3 && cleanTitle.length <= 70) {
          sections.push({
            number: String(sectionIndex).padStart(2, '0'),
            title: cleanTitle,
            page: p.pageNumber,
            blockId: hb.id,
            boundingBox: hb.bbox,
            summary: `Section on Page ${p.pageNumber}`,
          });
          sectionIndex++;
          if (sections.length >= 10) return sections;
        }
      }
    } else {
      const lines = p.text.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const isHeaderMatch =
          line.startsWith('#') ||
          /^(?:[0-9]+(?:\.[0-9]+)*|[A-Z]\.|(?:Section|Chapter|Part)\s+[0-9IVX]+)\s+[\w\s]{3,50}$/i.test(line) ||
          (line.length < 45 && line.length > 4 && /^[A-Z0-9\s,\-–—:]{4,45}$/.test(line) && !line.includes('. '));

        if (isHeaderMatch) {
          const cleanTitle = line.replace(/^#+\s*/, '').replace(/^[0-9]+(?:\.[0-9]+)*\s*[:\-–—.]?\s*/, '').trim();
          if (cleanTitle.length >= 3 && cleanTitle.length <= 60) {
            sections.push({
              number: String(sectionIndex).padStart(2, '0'),
              title: cleanTitle,
              page: p.pageNumber,
              summary: `Found on Page ${p.pageNumber}`,
            });
            sectionIndex++;
            if (sections.length >= 10) return sections;
          }
        }
      }
    }
  }

  // Fallback if no explicit headers found: create page-based map
  if (sections.length === 0) {
    for (let i = 0; i < Math.min(pages.length, 6); i++) {
      const page = pages[i];
      const firstLine = page.text.split('\n').map((l) => l.trim()).filter(Boolean)[0] || `Page ${page.pageNumber}`;
      sections.push({
        number: String(i + 1).padStart(2, '0'),
        title: firstLine.substring(0, 40),
        page: page.pageNumber,
        summary: `Page ${page.pageNumber} overview`,
      });
    }
  }

  return sections;
}

// Format Structured Layout-Aware Context for AI
export function formatStructuredDocumentContext(doc: UnifiedDocument): string {
  const pageOutputs: string[] = [];

  for (const page of doc.pages) {
    const blocks = page.blocks || [];
    const nonHeaderBlocks = blocks.filter((b) => !b.isHeaderOrFooter);
    const effectiveBlocks = nonHeaderBlocks.length > 0 ? nonHeaderBlocks : blocks;

    if (effectiveBlocks.length > 0) {
      const blockLines: string[] = [`=== PAGE ${page.pageNumber} (${page.contentType}, ${page.width}x${page.height}) ===`];
      for (const block of effectiveBlocks) {
        const prefix = `[${block.type.toUpperCase()}${block.columnIndex ? ` Col ${block.columnIndex}` : ''}]`;
        blockLines.push(`${prefix} ${block.text}`);
      }
      pageOutputs.push(blockLines.join('\n\n'));
    } else if (page.text || page.ocrText) {
      pageOutputs.push(`=== PAGE ${page.pageNumber} (${page.contentType}) ===\n${page.text || page.ocrText}`);
    }
  }

  // If doc.pages was empty or yielded no content, fallback to doc.extractedText
  if (pageOutputs.length === 0 && doc.extractedText) {
    pageOutputs.push(`=== DOCUMENT CONTENT ===\n${doc.extractedText}`);
  }

  return pageOutputs.join('\n\n');
}

// Document Type Classifier
export function classifyDocumentType(text: string): { type: string; confidence: number } {
  const lower = text.toLowerCase();

  if (
    lower.includes('resume') ||
    lower.includes('curriculum vitae') ||
    (lower.includes('education') && lower.includes('experience') && lower.includes('skills'))
  ) {
    return { type: 'Resume / Curriculum Vitae', confidence: 0.95 };
  }
  if (
    lower.includes('abstract') &&
    (lower.includes('methodology') || lower.includes('introduction') || lower.includes('references') || lower.includes('et al.'))
  ) {
    return { type: 'Research Paper / Academic Publication', confidence: 0.92 };
  }
  if (
    lower.includes('job description') ||
    lower.includes('position') ||
    lower.includes('internship') ||
    (lower.includes('responsibilities') && lower.includes('qualifications')) ||
    (lower.includes('role') && (lower.includes('compensation') || lower.includes('salary') || lower.includes('selection process') || lower.includes('candidate')))
  ) {
    return { type: 'Job Description / Hiring Specification', confidence: 0.9 };
  }
  if (
    lower.includes('balance sheet') ||
    lower.includes('income statement') ||
    lower.includes('fiscal year') ||
    lower.includes('q1') ||
    lower.includes('q2') ||
    lower.includes('q3') ||
    lower.includes('q4') ||
    lower.includes('revenue')
  ) {
    return { type: 'Financial / Quarterly Report', confidence: 0.9 };
  }
  if (
    lower.includes('agreement') ||
    lower.includes('terms and conditions') ||
    lower.includes('parties hereby agree') ||
    lower.includes('indemnification') ||
    lower.includes('confidentiality')
  ) {
    return { type: 'Legal Agreement / Contract', confidence: 0.9 };
  }
  if (lower.includes('handwriting') || lower.includes('note') || lower.includes('memo') || lower.includes('sketch')) {
    return { type: 'Handwritten / Field Notes', confidence: 0.85 };
  }

  return { type: 'General Document', confidence: 0.8 };
}

// Document-Specific Improvement Suggestions Generator
export function generateImprovementSuggestions(
  docType: string,
  text: string,
  pages: Array<{ pageNumber: number; text: string; isHandwritten?: boolean }>
): ImprovementSuggestion[] {
  const suggestions: ImprovementSuggestion[] = [];
  const lower = text.toLowerCase();

  if (docType.includes('Resume')) {
    const hasNumbers = /\b\d+(?:%|k|\+|x|\s*lakhs?)\b/i.test(text);
    if (!hasNumbers) {
      suggestions.push({
        area: 'Impact & Measurable Metrics',
        issue: 'Experience descriptions lack quantitative metrics (e.g. percentages, revenue, latency reductions).',
        recommendation: 'Quantify your accomplishments using the XYZ formula (Accomplished [X] as measured by [Y], by doing [Z]).',
        severity: 'high',
        page: 1,
      });
    }

    if (!lower.includes('github') && !lower.includes('linkedin') && !lower.includes('portfolio')) {
      suggestions.push({
        area: 'Professional Links',
        issue: 'No direct links to GitHub, LinkedIn, or personal portfolio detected.',
        recommendation: 'Include clickable links to your technical profiles and active repositories.',
        severity: 'medium',
        page: 1,
      });
    }

    if (pages.length > 2) {
      suggestions.push({
        area: 'Document Conciseness',
        issue: `Resume spans ${pages.length} pages, which may be lengthy for standard screening.`,
        recommendation: 'Condense content to 1–2 pages focusing on your highest-leverage roles and skills.',
        severity: 'low',
        page: pages.length,
      });
    }
  } else if (docType.includes('Research')) {
    if (!lower.includes('limitations') && !lower.includes('threats to validity')) {
      suggestions.push({
        area: 'Limitations & Validity',
        issue: 'No explicit discussion of study limitations or potential boundary conditions detected.',
        recommendation: 'Add a dedicated "Limitations" subsection to contextualize the generalizability of findings.',
        severity: 'medium',
        page: pages.length,
      });
    }
    if (!lower.includes('reproducibility') && !lower.includes('code availability') && !lower.includes('github')) {
      suggestions.push({
        area: 'Open Science & Reproducibility',
        issue: 'No code repository or dataset availability statement found.',
        recommendation: 'Provide an artifact URL or DOI for the experimental code, scripts, and evaluation benchmarks.',
        severity: 'medium',
      });
    }
  } else if (docType.includes('Job Description')) {
    if (!lower.includes('salary') && !lower.includes('compensation') && !lower.includes('stipend')) {
      suggestions.push({
        area: 'Compensation Transparency',
        issue: 'Compensation or stipend range is not explicitly specified.',
        recommendation: 'Disclosing compensation ranges significantly improves candidate conversion and response quality.',
        severity: 'high',
        page: 1,
      });
    }
  } else {
    // General document suggestions
    if (pages.some((p) => p.isHandwritten)) {
      suggestions.push({
        area: 'Handwriting Legibility',
        issue: 'Handwritten sections detected with varying ink contrast.',
        recommendation: 'Scan at higher DPI (300+ DPI) with even lighting to optimize automated optical recognition.',
        severity: 'medium',
      });
    }
    if (text.length > 2000 && !text.includes('1.') && !text.includes('#') && !text.includes('Section')) {
      suggestions.push({
        area: 'Visual Structure & Headings',
        issue: 'Document contains large unbroken blocks of body text.',
        recommendation: 'Incorporate clear subheadings, numbered lists, and bold lead-in keywords for scannability.',
        severity: 'low',
        page: 1,
      });
    }
  }

  // Ensure at least 2 constructive suggestions
  if (suggestions.length < 2) {
    suggestions.push({
      area: 'Executive Summary',
      issue: 'Document lacks a standalone high-level summary at the very beginning.',
      recommendation: 'Include a 3-sentence executive summary at the top to accelerate reader comprehension.',
      severity: 'low',
      page: 1,
    });
    suggestions.push({
      area: 'Key Takeaways Callout',
      issue: 'Important conclusions are embedded within dense body paragraphs.',
      recommendation: 'Add a bulleted "Key Takeaways" box at the end of major sections.',
      severity: 'low',
      page: Math.max(1, pages.length),
    });
  }

  return suggestions;
}

// Suggested Questions Generator
export function generateSmartQuestions(docType: string, text: string): string[] {
  const lower = text.toLowerCase();

  if (docType.includes('Resume')) {
    return [
      'What are the candidate\'s core technical competencies and tools?',
      'What measurable impact or achievements are highlighted?',
      'What is the candidate\'s educational background and work history?',
      'Are there any notable open-source projects or leadership experiences?',
    ];
  }
  if (docType.includes('Research')) {
    return [
      'What is the primary hypothesis and research question addressed?',
      'What methodology and experimental setup were used?',
      'What are the key empirical findings and benchmark results?',
      'What limitations or future directions do the authors suggest?',
    ];
  }
  if (docType.includes('Job Description')) {
    return [
      'What are the essential requirements and qualifications for this role?',
      'What are the main day-to-day responsibilities?',
      'What compensation, benefits, or perks are specified?',
      'How does the interview and selection process work?',
    ];
  }
  if (docType.includes('Legal') || docType.includes('Contract')) {
    return [
      'What are the primary obligations and deliverables for each party?',
      'What are the termination conditions and liability limits?',
      'What confidentiality or intellectual property clauses are included?',
      'What is the effective date and jurisdiction of the agreement?',
    ];
  }

  return [
    'What are the main takeaways and conclusions of this document?',
    'What important numbers, dates, or metrics are mentioned?',
    'What are the key sections and topics covered?',
    'What actionable recommendations or next steps are proposed?',
  ];
}
