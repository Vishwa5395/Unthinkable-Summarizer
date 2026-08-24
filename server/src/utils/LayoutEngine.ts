import {
  BoundingBox,
  DocumentBlock,
  BlockType,
  TableStructure,
  VisualElement,
} from '../schemas/document.schema.js';

export interface RawTextItem {
  str: string;
  transform: number[]; // [scaleX, skewY, skewX, scaleY, x, y]
  width: number;
  height: number;
  fontName?: string;
}

export interface PositionedItem {
  text: string;
  x: number;
  y: number; // Top-left origin
  width: number;
  height: number;
  fontSize: number;
  fontName?: string;
  isBold: boolean;
  confidence: number;
}

export interface ReconstructedLine {
  items: PositionedItem[];
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  isBold: boolean;
  columnIndex: number;
}

export class LayoutEngine {
  /**
   * Reconstruct layout from PDF.js getTextContent() items
   */
  static reconstructPdfPageLayout(
    rawItems: RawTextItem[],
    pageWidth: number,
    pageHeight: number,
    pageNumber: number,
    existingVisualElements: VisualElement[] = []
  ): {
    blocks: DocumentBlock[];
    reconstructedText: string;
    visualElements: VisualElement[];
  } {
    if (!rawItems || rawItems.length === 0) {
      return { blocks: [], reconstructedText: '', visualElements: existingVisualElements };
    }

    // 1. Convert PDF.js items (bottom-left origin) to top-left origin PositionedItem
    const positionedItems: PositionedItem[] = [];

    for (const item of rawItems) {
      const str = item.str || '';
      if (!str.trim()) continue;

      const scaleX = Math.abs(item.transform[0]) || 1;
      const scaleY = Math.abs(item.transform[3]) || 1;
      const fontSize = Math.max(scaleY, 8);

      const x = item.transform[4];
      // PDF Y=0 is bottom, convert to top-left:
      const yBottom = item.transform[5];
      const yTop = pageHeight - yBottom - fontSize;

      const width = item.width > 0 ? item.width : str.length * (fontSize * 0.5);
      const height = item.height > 0 ? item.height : fontSize;

      const fontName = item.fontName || '';
      const isBold =
        fontName.toLowerCase().includes('bold') ||
        fontName.toLowerCase().includes('black') ||
        fontName.toLowerCase().includes('heavy') ||
        fontName.toLowerCase().includes('medium');

      positionedItems.push({
        text: str,
        x: Math.max(0, x),
        y: Math.max(0, yTop),
        width: Math.max(1, width),
        height: Math.max(1, height),
        fontSize,
        fontName,
        isBold,
        confidence: 1.0,
      });
    }

    return this.reconstructFromPositionedItems(
      positionedItems,
      pageWidth,
      pageHeight,
      pageNumber,
      existingVisualElements
    );
  }

  /**
   * Reconstruct layout from OCR words & bounding boxes
   */
  static reconstructOcrPageLayout(
    ocrWords: Array<{ text: string; confidence: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }>,
    imageWidth: number,
    imageHeight: number,
    pageNumber: number,
    existingVisualElements: VisualElement[] = []
  ): {
    blocks: DocumentBlock[];
    reconstructedText: string;
    visualElements: VisualElement[];
  } {
    const positionedItems: PositionedItem[] = [];

    for (const w of ocrWords) {
      const text = w.text?.trim() || '';
      if (!text) continue;

      const bbox = w.bbox || { x0: 0, y0: 0, x1: 50, y1: 15 };
      const x = bbox.x0;
      const y = bbox.y0;
      const width = Math.max(5, bbox.x1 - bbox.x0);
      const height = Math.max(8, bbox.y1 - bbox.y0);
      const fontSize = height;

      positionedItems.push({
        text,
        x,
        y,
        width,
        height,
        fontSize,
        isBold: false,
        confidence: w.confidence ?? 0.9,
      });
    }

    return this.reconstructFromPositionedItems(
      positionedItems,
      imageWidth,
      imageHeight,
      pageNumber,
      existingVisualElements
    );
  }

  /**
   * Core Layout Reconstruction Pipeline
   */
  private static reconstructFromPositionedItems(
    items: PositionedItem[],
    pageWidth: number,
    pageHeight: number,
    pageNumber: number,
    visualElements: VisualElement[]
  ): {
    blocks: DocumentBlock[];
    reconstructedText: string;
    visualElements: VisualElement[];
  } {
    if (items.length === 0) {
      return { blocks: [], reconstructedText: '', visualElements };
    }

    // A. Detect Running Header & Footer items based on vertical boundaries and font size
    const headerThreshold = pageHeight * 0.06;
    const footerThreshold = pageHeight * 0.94;

    // Calculate Median Body Font Size early
    const allFontSizes = items.map((i) => i.fontSize).sort((a, b) => a - b);
    const medianFontSize = allFontSizes[Math.floor(allFontSizes.length / 2)] || 10;

    // Separate items: only small running headers (<= 1.1x median) are classified as running headers
    const contentItems = items.filter((item) => {
      const isTopHeaderZone = item.y < headerThreshold && item.fontSize <= medianFontSize * 1.1;
      const isBottomFooterZone = item.y > footerThreshold;
      return !isTopHeaderZone && !isBottomFooterZone;
    });

    const isMultiColumn = this.detectTwoColumns(contentItems, pageWidth);
    const midX = pageWidth / 2;
    const gutterThreshold = pageWidth * 0.04;

    // C. Group into Lines with Column Assignment
    const lines: ReconstructedLine[] = [];

    const sortedItems = [...items].sort((a, b) => a.y - b.y || a.x - b.x);

    for (const item of sortedItems) {
      // Determine column
      let colIndex = 0;
      const isRunningHeader = item.y < headerThreshold && item.fontSize <= medianFontSize * 1.1;
      const isRunningFooter = item.y > footerThreshold;

      if (isRunningHeader || isRunningFooter) {
        colIndex = -1; // Running Header or footer
      } else if (isMultiColumn) {
        if (item.width > pageWidth * 0.65) {
          colIndex = -1; // Spanned across columns
        } else if (item.x + item.width / 2 > midX + gutterThreshold) {
          colIndex = 1; // Right column
        } else {
          colIndex = 0; // Left column
        }
      }

      // Find an existing line in same column with close Y
      const lineTolerance = Math.max(item.fontSize * 0.5, 4);
      let matchedLine: ReconstructedLine | undefined;

      for (const line of lines) {
        if (line.columnIndex === colIndex && Math.abs(line.y - item.y) <= lineTolerance) {
          matchedLine = line;
          break;
        }
      }

      if (matchedLine) {
        matchedLine.items.push(item);
        // Expand line bounds
        const minX = Math.min(matchedLine.x, item.x);
        const maxX = Math.max(matchedLine.x + matchedLine.width, item.x + item.width);
        matchedLine.x = minX;
        matchedLine.width = maxX - minX;
        matchedLine.height = Math.max(matchedLine.height, item.height);
        matchedLine.fontSize = Math.max(matchedLine.fontSize, item.fontSize);
        if (item.isBold) matchedLine.isBold = true;
      } else {
        lines.push({
          items: [item],
          text: item.text,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize,
          isBold: item.isBold,
          columnIndex: colIndex,
        });
      }
    }

    // Finalize line text by sorting words horizontally
    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      line.text = line.items.map((i) => i.text).join(' ').replace(/\s+/g, ' ').trim();
    }

    // E. Segment Lines into DocumentBlocks
    const rawBlocks: DocumentBlock[] = [];
    let blockCounter = 1;

    // Separate into Headers, Main Content (Column 0, Column 1, Spanned), Footers
    const headerLines = lines.filter((l) => l.y < headerThreshold && l.fontSize <= medianFontSize * 1.1);
    const footerLines = lines.filter((l) => l.y > footerThreshold && l.fontSize <= medianFontSize * 1.1);
    const mainLines = lines.filter(
      (l) => !(l.y < headerThreshold && l.fontSize <= medianFontSize * 1.1) && !(l.y > footerThreshold && l.fontSize <= medianFontSize * 1.1)
    );

    // Sort main lines by reading order:
    // Spanned lines before columns -> Left Column lines (Y-sorted) -> Right Column lines (Y-sorted) -> Spanned lines
    mainLines.sort((a, b) => {
      if (a.columnIndex !== b.columnIndex) {
        if (a.columnIndex === -1) return -1;
        if (b.columnIndex === -1) return 1;
        return a.columnIndex - b.columnIndex;
      }
      return a.y - b.y;
    });

    // 1. Process Header Blocks
    if (headerLines.length > 0) {
      const headerText = headerLines.map((l) => l.text).join(' ');
      const bbox = this.computeUnionBbox(headerLines, pageWidth, pageHeight);
      rawBlocks.push({
        id: `page-${pageNumber}-header`,
        pageNumber,
        type: 'header',
        text: headerText,
        bbox,
        confidence: 0.98,
        readingOrder: blockCounter++,
        columnIndex: -1,
        isHeaderOrFooter: true,
      });
    }

    // 2. Process Main Body Lines into Paragraphs, Headings, Lists, Tables, Formulas, Captions
    let currentParagraphLines: ReconstructedLine[] = [];
    let currentSectionTitle = '';

    const flushParagraph = () => {
      if (currentParagraphLines.length === 0) return;

      const fullText = currentParagraphLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
      if (!fullText) {
        currentParagraphLines = [];
        return;
      }

      const firstLine = currentParagraphLines[0];
      const bbox = this.computeUnionBbox(currentParagraphLines, pageWidth, pageHeight);
      const isList = /^(?:[•\-*]|\d+\.|\([a-z0-9]\))\s+/i.test(firstLine.text);
      const isFormula = this.isFormulaText(fullText);
      const isCaption = /^(?:Figure|Fig\.|Chart|Graph|Diagram|Table)\s+\d+[:.\s-]/i.test(fullText);

      let blockType: BlockType = 'paragraph';
      if (isList) blockType = 'list';
      else if (isFormula) blockType = 'formula';
      else if (isCaption) blockType = 'caption';

      rawBlocks.push({
        id: `page-${pageNumber}-block-${blockCounter}`,
        pageNumber,
        type: blockType,
        text: fullText,
        bbox,
        confidence: 1.0,
        readingOrder: blockCounter++,
        columnIndex: firstLine.columnIndex >= 0 ? firstLine.columnIndex : 0,
        sectionTitle: currentSectionTitle || undefined,
        isHeaderOrFooter: false,
      });

      currentParagraphLines = [];
    };

    for (let idx = 0; idx < mainLines.length; idx++) {
      const line = mainLines[idx];
      const lineText = line.text;

      // Check if line is a Heading
      const isLargeFont = line.fontSize >= medianFontSize * 1.25;
      const isHeadingPattern =
        /^(?:[0-9]+(?:\.[0-9]+)*|[A-Z]\.|(?:Section|Chapter|Part)\s+[0-9IVX]+)\s+[\w\s]{3,60}$/i.test(lineText) ||
        (line.isBold && lineText.length < 60 && !lineText.endsWith('.'));

      const isHeading = isLargeFont || isHeadingPattern;

      // Check if line is an explicit Table Row / Tabular Data with pipe delimiters
      const isExplicitTable = lineText.includes('|') && lineText.split('|').length >= 3;

      if (isHeading) {
        flushParagraph();
        currentSectionTitle = lineText.replace(/^#+\s*/, '').trim();
        const bbox = this.computeUnionBbox([line], pageWidth, pageHeight);
        const level = line.fontSize >= medianFontSize * 1.5 ? 1 : line.fontSize >= medianFontSize * 1.25 ? 2 : 3;

        rawBlocks.push({
          id: `page-${pageNumber}-block-${blockCounter}`,
          pageNumber,
          type: 'heading',
          text: lineText,
          bbox,
          confidence: 1.0,
          readingOrder: blockCounter++,
          level,
          columnIndex: line.columnIndex >= 0 ? line.columnIndex : 0,
          sectionTitle: currentSectionTitle,
          isHeaderOrFooter: false,
        });
      } else if (isExplicitTable) {
        // Collect consecutive table rows
        flushParagraph();
        const tableLines: ReconstructedLine[] = [line];
        while (idx + 1 < mainLines.length) {
          const nextLine = mainLines[idx + 1];
          const nextIsTable = nextLine.text.includes('|') && nextLine.text.split('|').length >= 3;
          if (nextIsTable) {
            tableLines.push(nextLine);
            idx++;
          } else {
            break;
          }
        }

        const tableStructure = this.reconstructTableStructure(tableLines);
        const bbox = this.computeUnionBbox(tableLines, pageWidth, pageHeight);

        rawBlocks.push({
          id: `page-${pageNumber}-table-${blockCounter}`,
          pageNumber,
          type: 'table',
          text: this.formatTableMarkdown(tableStructure),
          bbox,
          confidence: 0.92,
          readingOrder: blockCounter++,
          tableData: tableStructure,
          columnIndex: line.columnIndex >= 0 ? line.columnIndex : 0,
          sectionTitle: currentSectionTitle || undefined,
          isHeaderOrFooter: false,
        });
      } else {
        // Normal text line: check spacing relative to previous line
        if (currentParagraphLines.length > 0) {
          const prevLine = currentParagraphLines[currentParagraphLines.length - 1];
          const lineGap = line.y - (prevLine.y + prevLine.height);
          const maxNormalGap = prevLine.fontSize * 1.8;

          // If gap is too large or column changed or current is a new bullet point, flush
          const isNewBullet = /^(?:[•\-*]|\d+\.)\s+/i.test(lineText);
          if (lineGap > maxNormalGap || line.columnIndex !== prevLine.columnIndex || isNewBullet) {
            flushParagraph();
          }
        }
        currentParagraphLines.push(line);
      }
    }

    flushParagraph();

    // 3. Process Footer Blocks
    if (footerLines.length > 0) {
      const footerText = footerLines.map((l) => l.text).join(' ');
      const bbox = this.computeUnionBbox(footerLines, pageWidth, pageHeight);
      rawBlocks.push({
        id: `page-${pageNumber}-footer`,
        pageNumber,
        type: 'footer',
        text: footerText,
        bbox,
        confidence: 0.98,
        readingOrder: blockCounter++,
        columnIndex: -1,
        isHeaderOrFooter: true,
      });
    }

    // F. Figure & Caption Linking
    for (const block of rawBlocks) {
      if (block.type === 'caption') {
        // Find closest previous or next figure/table block
        const candidates = rawBlocks.filter(
          (b) => (b.type === 'figure' || b.type === 'chart' || b.type === 'table') && b.id !== block.id
        );
        let closestDist = Infinity;
        let closestCandidate: DocumentBlock | undefined;

        for (const cand of candidates) {
          const dist = Math.abs(cand.bbox.y - block.bbox.y);
          if (dist < closestDist && dist < pageHeight * 0.25) {
            closestDist = dist;
            closestCandidate = cand;
          }
        }

        if (closestCandidate) {
          block.captionFor = closestCandidate.id;
          closestCandidate.associatedCaptionId = block.id;
        }
      }
    }

    // G. Generate clean, faithful reconstructed text (excluding headers/footers from main text)
    const contentBlocks = rawBlocks.filter((b) => !b.isHeaderOrFooter);
    const effectiveContentBlocks = contentBlocks.length > 0 ? contentBlocks : rawBlocks;
    const reconstructedText = effectiveContentBlocks.map((b) => b.text).join('\n\n');

    return {
      blocks: rawBlocks,
      reconstructedText,
      visualElements,
    };
  }

  /**
   * Helper: Detect if content is divided into two distinct columns
   */
  private static detectTwoColumns(items: PositionedItem[], pageWidth: number): boolean {
    if (items.length < 4) return false;

    const midX = pageWidth / 2;
    const gutter = pageWidth * 0.04;

    let leftCount = 0;
    let rightCount = 0;
    let crossCount = 0;

    for (const item of items) {
      if (item.width > pageWidth * 0.6) {
        crossCount++;
      } else if (item.x + item.width < midX - gutter / 2) {
        leftCount++;
      } else if (item.x > midX + gutter / 2) {
        rightCount++;
      }
    }

    // If both left and right have significant item counts
    return leftCount >= 2 && rightCount >= 2 && leftCount + rightCount > crossCount;
  }

  /**
   * Helper: Formula pattern detection
   */
  private static isFormulaText(text: string): boolean {
    return /(?:[∑∫∏√≈≠≤≥±×÷]|\\(?:frac|sum|int|alpha|beta|theta|pi|sigma|infty)|(?:\b[a-zA-Z]\s*=\s*[\d\w\s+\-*/^()]{3,}))/i.test(
      text
    );
  }

  /**
   * Helper: Compute union bounding box and normalized 0..1 coordinates
   */
  private static computeUnionBbox(
    lines: ReconstructedLine[],
    pageWidth: number,
    pageHeight: number
  ): BoundingBox {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const line of lines) {
      minX = Math.min(minX, line.x);
      minY = Math.min(minY, line.y);
      maxX = Math.max(maxX, line.x + line.width);
      maxY = Math.max(maxY, line.y + line.height);
    }

    const x = Math.round(Math.max(0, minX));
    const y = Math.round(Math.max(0, minY));
    const width = Math.round(Math.max(1, maxX - minX));
    const height = Math.round(Math.max(1, maxY - minY));

    return {
      x,
      y,
      width,
      height,
      normalized: {
        x: Number((x / Math.max(1, pageWidth)).toFixed(4)),
        y: Number((y / Math.max(1, pageHeight)).toFixed(4)),
        width: Number((width / Math.max(1, pageWidth)).toFixed(4)),
        height: Number((height / Math.max(1, pageHeight)).toFixed(4)),
      },
    };
  }

  /**
   * Helper: Build table structure from table lines
   */
  private static reconstructTableStructure(tableLines: ReconstructedLine[]): TableStructure {
    if (tableLines.length === 0) {
      return { headers: [], rows: [], rowCount: 0, colCount: 0 };
    }

    // Check if lines have pipe delimiters
    if (tableLines.some((l) => l.text.includes('|'))) {
      const parsedRows = tableLines.map((l) =>
        l.text
          .split('|')
          .map((c) => c.trim())
          .filter((c) => c.length > 0 && !/^[-:]+$/.test(c))
      ).filter((r) => r.length > 0);

      const headers = parsedRows[0] || [];
      const rows = parsedRows.slice(1);
      return {
        headers,
        rows,
        rowCount: parsedRows.length,
        colCount: headers.length,
      };
    }

    // Parse multi-item column alignment
    const rows = tableLines.map((l) => l.items.map((i) => i.text.trim()).filter(Boolean));
    const headers = rows[0] || [];
    const bodyRows = rows.slice(1);

    return {
      headers,
      rows: bodyRows,
      rowCount: rows.length,
      colCount: headers.length,
    };
  }

  /**
   * Helper: Format table structure as readable Markdown table
   */
  private static formatTableMarkdown(table: TableStructure): string {
    if (table.headers.length === 0 && table.rows.length === 0) return '';
    const headers = table.headers.length > 0 ? table.headers : table.rows[0] || [];
    const rows = table.headers.length > 0 ? table.rows : table.rows.slice(1);

    const headerLine = `| ${headers.join(' | ')} |`;
    const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;
    const rowLines = rows.map((r) => `| ${r.join(' | ')} |`);

    return [headerLine, separatorLine, ...rowLines].join('\n');
  }
}
