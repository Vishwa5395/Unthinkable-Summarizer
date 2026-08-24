import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { UnifiedDocument, BoundingBox } from '../../types';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { api } from '../../lib/api';

// Set up PDF.js worker using CDN or local worker script
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface ContinuousDocumentViewerProps {
  document: UnifiedDocument;
}

interface SearchMatchItem {
  pageNumber: number;
  matchCount: number;
  snippets: string[];
  blockId?: string;
  boundingBox?: BoundingBox;
}

export const ContinuousDocumentViewer: React.FC<ContinuousDocumentViewerProps> = ({ document }) => {
  const { activeCitation, viewerZoom, setViewerZoom, triggerCitationJump } = useWorkspaceStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(document.features.pageCount || 1);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<SearchMatchItem[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

  // Citation highlight trigger state
  const [highlightedPage, setHighlightedPage] = useState<number | null>(null);
  const [activeHighlightBbox, setActiveHighlightBbox] = useState<BoundingBox | null>(null);

  const isPdf =
    document.mimeType.includes('pdf') || document.filename.toLowerCase().endsWith('.pdf');
  const fileUrl = `/api/documents/${document.id}/file`;

  // 1. Load PDF Document if applicable
  useEffect(() => {
    if (!isPdf) return;

    let isMounted = true;
    setIsLoadingPdf(true);
    setLoadError(null);

    const loadingTask = pdfjsLib.getDocument({
      url: fileUrl,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist/cmaps/',
      cMapPacked: true,
    });

    loadingTask.promise
      .then((loadedPdf) => {
        if (!isMounted) return;
        setPdfDoc(loadedPdf);
        setNumPages(loadedPdf.numPages);
        setIsLoadingPdf(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('PDF.js loading error:', err);
        setLoadError('Failed to load continuous PDF preview. Falling back to structured view.');
        setIsLoadingPdf(false);
      });

    return () => {
      isMounted = false;
    };
  }, [document.id, isPdf, fileUrl]);

  // 2. Render Page onto Canvas when PDF or Zoom changes
  const renderPdfPage = async (pageNumber: number) => {
    if (!pdfDoc) return;
    const canvas = canvasRefs.current.get(pageNumber);
    if (!canvas) return;

    try {
      const page = await pdfDoc.getPage(pageNumber);
      const scale = (viewerZoom / 100) * 1.5;
      const viewport = page.getViewport({ scale });

      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
    } catch (err) {
      console.warn(`Render error on page ${pageNumber}`, err);
    }
  };

  useEffect(() => {
    if (!pdfDoc) return;
    for (let p = 1; p <= numPages; p++) {
      renderPdfPage(p);
    }
  }, [pdfDoc, numPages, viewerZoom]);

  // 3. Bidirectional Citation Navigation & Spatial Highlight
  useEffect(() => {
    if (!activeCitation) return;

    const targetPage = activeCitation.page;
    const pageEl = pageRefs.current.get(targetPage);

    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedPage(targetPage);
      setActiveHighlightBbox(activeCitation.boundingBox || null);

      const timer = setTimeout(() => {
        setHighlightedPage(null);
        setActiveHighlightBbox(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [activeCitation]);

  // 4. In-Document Search with Spatial Coordinates
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchMatches([]);
      return;
    }

    try {
      const res = await api.searchDocument(document.id, searchQuery);
      setSearchMatches(res.matches);
      if (res.matches.length > 0) {
        setCurrentMatchIdx(0);
        const first = res.matches[0];
        jumpToMatch(first);
      }
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  const jumpToMatch = (match: SearchMatchItem) => {
    const pageEl = pageRefs.current.get(match.pageNumber);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedPage(match.pageNumber);
      setActiveHighlightBbox(match.boundingBox || null);
      setTimeout(() => {
        setHighlightedPage(null);
        setActiveHighlightBbox(null);
      }, 3000);
    }
  };

  const nextMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIdx = (currentMatchIdx + 1) % searchMatches.length;
    setCurrentMatchIdx(nextIdx);
    jumpToMatch(searchMatches[nextIdx]);
  };

  const prevMatch = () => {
    if (searchMatches.length === 0) return;
    const prevIdx = (currentMatchIdx - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIdx(prevIdx);
    jumpToMatch(searchMatches[prevIdx]);
  };

  return (
    <div className="flex flex-col h-full bg-paper-muted dark:bg-[#121216] editorial-border-r dark:border-ink-800 select-none transition-colors duration-150 w-full overflow-hidden">
      {/* Viewer Toolbar */}
      <div className="bg-paper-light dark:bg-paper-darkcard editorial-border-b dark:border-ink-800 px-2.5 sm:px-3 py-1.5 sm:py-2 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 z-10 font-mono text-xs transition-colors duration-150 shrink-0">
        {/* Document Info & Page count */}
        <div className="flex items-center gap-1.5 sm:gap-2 truncate max-w-[45%] sm:max-w-none">
          <span className="font-bold text-ink-950 dark:text-ink-50 truncate max-w-[120px] sm:max-w-[180px] md:max-w-[220px]" title={document.originalName}>
            {document.originalName}
          </span>
          <span className="px-1.5 py-0.5 border border-ink-950 dark:border-ink-700 bg-paper-warm dark:bg-paper-dark text-ink-900 dark:text-ink-100 text-[10px] shrink-0">
            {numPages} {numPages === 1 ? 'PAGE' : 'PAGES'}
          </span>
        </div>

        {/* Search in Document */}
        <form onSubmit={handleSearch} className="flex items-center gap-1">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-2 py-1 border border-ink-950 dark:border-ink-700 bg-paper-warm dark:bg-paper-dark text-xs text-ink-950 dark:text-ink-50 focus:outline-none focus:bg-paper-light dark:focus:bg-paper-darkcard w-20 sm:w-28 md:w-36 font-mono"
          />
          <button
            type="submit"
            className="px-2 py-1 bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950 hover:bg-ink-800 dark:hover:bg-white font-bold"
            title="Search"
          >
            Go
          </button>

          {searchMatches.length > 0 && (
            <div className="flex items-center gap-0.5 sm:gap-1 pl-0.5">
              <span className="text-[10px] text-ink-600 dark:text-ink-400">
                {currentMatchIdx + 1}/{searchMatches.length}
              </span>
              <button
                type="button"
                onClick={prevMatch}
                className="px-1.5 py-0.5 border border-ink-950 dark:border-ink-700 bg-paper-light dark:bg-paper-dark text-ink-950 dark:text-ink-100 hover:bg-paper-muted dark:hover:bg-ink-800"
                title="Previous match"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={nextMatch}
                className="px-1.5 py-0.5 border border-ink-950 dark:border-ink-700 bg-paper-light dark:bg-paper-dark text-ink-950 dark:text-ink-100 hover:bg-paper-muted dark:hover:bg-ink-800"
                title="Next match"
              >
                ↓
              </button>
            </div>
          )}
        </form>

        {/* Zoom Controls */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setViewerZoom((z) => Math.max(50, z - 25))}
            className="px-2 py-1 border border-ink-950 dark:border-ink-700 bg-paper-warm dark:bg-paper-dark hover:bg-paper-light dark:hover:bg-ink-800 text-ink-950 dark:text-ink-100 font-bold"
            title="Zoom out"
          >
            -
          </button>
          <span className="text-[11px] font-bold w-9 sm:w-10 text-center text-ink-950 dark:text-ink-100">{viewerZoom}%</span>
          <button
            type="button"
            onClick={() => setViewerZoom((z) => Math.min(200, z + 25))}
            className="px-2 py-1 border border-ink-950 dark:border-ink-700 bg-paper-warm dark:bg-paper-dark hover:bg-paper-light dark:hover:bg-ink-800 text-ink-950 dark:text-ink-100 font-bold"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setViewerZoom(100)}
            className="hidden sm:inline-block px-2 py-1 border border-ink-950 dark:border-ink-700 bg-paper-warm dark:bg-paper-dark hover:bg-paper-light dark:hover:bg-ink-800 text-ink-950 dark:text-ink-100 text-[10px]"
            title="Reset Zoom"
          >
            Fit
          </button>
        </div>
      </div>

      {/* Continuous Document Scroll Area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4 md:p-6 space-y-4 sm:space-y-6 flex flex-col items-center w-full"
      >
        {isLoadingPdf && (
          <div className="my-12 text-center font-mono text-xs text-ink-600 dark:text-ink-400">
            <span className="inline-block w-3 h-3 rounded-full bg-ink-950 dark:bg-ink-100 animate-ping mr-2"></span>
            Rendering continuous document pages...
          </div>
        )}

        {loadError && (
          <div className="my-8 p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-ink-950 dark:border-yellow-600 max-w-md text-xs font-mono text-ink-950 dark:text-yellow-200">
            <div className="font-bold mb-1">PREVIEW NOTICE:</div>
            {loadError}
          </div>
        )}

        {/* If PDF: Render Continuous Canvas Pages */}
        {isPdf && !loadError && (
          <>
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => (
              <div
                key={`page-${pageNumber}`}
                ref={(el) => {
                  if (el) pageRefs.current.set(pageNumber, el);
                  else pageRefs.current.delete(pageNumber);
                }}
                className={`relative bg-paper-light border-1.5 sm:border-2 border-ink-950 dark:border-ink-600 shadow-brutal dark:shadow-brutal-dark transition-all duration-300 w-full max-w-full ${
                  highlightedPage === pageNumber ? 'page-highlight-active' : ''
                }`}
                style={{ width: `${Math.min(100, Math.max(50, viewerZoom))}%`, maxWidth: '850px' }}
              >
                {/* Page Number Stamp Indicator */}
                <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-ink-950 text-paper-light font-mono text-[10px] font-bold border border-paper-light shadow-sm">
                  PAGE {pageNumber}
                </div>

                {/* Spatial Bounding Box Highlight Overlay */}
                {highlightedPage === pageNumber && activeHighlightBbox?.normalized && (
                  <div
                    className="absolute border-2 border-yellow-500 bg-yellow-300/35 pointer-events-none z-20 animate-pulse transition-all duration-200"
                    style={{
                      left: `${activeHighlightBbox.normalized.x * 100}%`,
                      top: `${activeHighlightBbox.normalized.y * 100}%`,
                      width: `${Math.max(4, activeHighlightBbox.normalized.width * 100)}%`,
                      height: `${Math.max(2, activeHighlightBbox.normalized.height * 100)}%`,
                    }}
                  />
                )}

                <div className="p-1 sm:p-2 flex justify-center overflow-hidden bg-white max-w-full">
                  <canvas
                    ref={(el) => {
                      if (el) canvasRefs.current.set(pageNumber, el);
                      else canvasRefs.current.delete(pageNumber);
                    }}
                    className="max-w-full h-auto object-contain"
                  />
                </div>
              </div>
            ))}
          </>
        )}

        {/* If Image / Scanned Photo: Render Scaled Image View */}
        {!isPdf && (
          <div
            ref={(el) => {
              if (el) pageRefs.current.set(1, el);
              else pageRefs.current.delete(1);
            }}
            className={`relative bg-paper-light border-1.5 sm:border-2 border-ink-950 dark:border-ink-600 shadow-brutal dark:shadow-brutal-dark transition-all duration-300 p-1 sm:p-2 w-full max-w-full ${
              highlightedPage === 1 ? 'page-highlight-active' : ''
            }`}
            style={{ width: `${viewerZoom}%`, maxWidth: '900px' }}
          >
            <div className="absolute top-2 sm:top-3 right-2 sm:right-3 z-10 px-2 py-0.5 bg-ink-950 text-paper-light font-mono text-[10px] font-bold">
              PAGE 1 · {document.features.hasHandwriting ? 'HANDWRITTEN' : 'IMAGE'}
            </div>

            {/* Spatial Bounding Box Highlight Overlay */}
            {highlightedPage === 1 && activeHighlightBbox?.normalized && (
              <div
                className="absolute border-2 border-yellow-500 bg-yellow-300/35 pointer-events-none z-20 animate-pulse transition-all duration-200"
                style={{
                  left: `${activeHighlightBbox.normalized.x * 100}%`,
                  top: `${activeHighlightBbox.normalized.y * 100}%`,
                  width: `${Math.max(4, activeHighlightBbox.normalized.width * 100)}%`,
                  height: `${Math.max(2, activeHighlightBbox.normalized.height * 100)}%`,
                }}
              />
            )}

            <img
              src={fileUrl}
              alt={document.originalName}
              className="w-full h-auto border border-ink-300 object-contain max-w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
};
