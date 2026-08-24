import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { UnifiedDocument, DocumentAnalysis, SummaryMode, ChatMessage } from '../../types';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { api } from '../../lib/api';

interface DocumentIntelligencePanelProps {
  document: UnifiedDocument;
}

export const DocumentIntelligencePanel: React.FC<DocumentIntelligencePanelProps> = ({ document }) => {
  const {
    summaryMode,
    setSummaryMode,
    triggerCitationJump,
    cachedAnalyses,
    cacheAnalysis,
  } = useWorkspaceStore();

  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const { updateDocument } = useWorkspaceStore();

  // Fetch or load cached analysis when document or summaryMode changes
  useEffect(() => {
    let isMounted = true;
    let pollTimeout: any = null;

    if (document.status === 'FAILED') {
      setIsLoadingAnalysis(false);
      return;
    }

    const isStillProcessing =
      document.status === 'QUEUED' ||
      document.status === 'VALIDATING' ||
      document.status === 'EXTRACTING' ||
      document.status === 'OCR' ||
      document.status === 'NORMALIZING';

    if (isStillProcessing) {
      setIsLoadingAnalysis(true);
      setAnalysisError(null);

      // Poll document status until extraction/normalization is ready
      const checkDocStatus = async () => {
        try {
          const latest = await api.getDocument(document.id);
          if (!isMounted) return;
          updateDocument(document.id, latest);

          if (latest.status === 'READY' || latest.status === 'COMPLETE' || latest.status === 'DEGRADED' || latest.status === 'FAILED') {
            return;
          }
          pollTimeout = setTimeout(checkDocStatus, 1000);
        } catch {
          if (isMounted) {
            pollTimeout = setTimeout(checkDocStatus, 1500);
          }
        }
      };

      pollTimeout = setTimeout(checkDocStatus, 800);

      return () => {
        isMounted = false;
        if (pollTimeout) clearTimeout(pollTimeout);
      };
    }

    const cacheKey = `${document.id}:${summaryMode}`;

    // If current loaded analysis is for this document and already has the requested summary tier precomputed
    if (analysis && analysis.documentId === document.id && analysis.summaries && analysis.summaries[summaryMode]) {
      return;
    }

    if (cachedAnalyses[cacheKey]) {
      setAnalysis(cachedAnalyses[cacheKey]);
      return;
    }

    setIsLoadingAnalysis(true);
    setAnalysisError(null);

    api
      .getDocumentAnalysis(document.id, summaryMode)
      .then((data) => {
        if (!isMounted) return;
        setAnalysis(data);
        cacheAnalysis(data);
        setIsLoadingAnalysis(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Failed to fetch analysis:', err);
        setAnalysisError(err.message || 'Unable to generate analysis for this mode.');
        setIsLoadingAnalysis(false);
      });

    return () => {
      isMounted = false;
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, [document.id, document.status, summaryMode, analysis]);

  // Dynamic Summary Presentation Details derived strictly from summaryMode
  const getSummaryHeading = (mode: SummaryMode): { title: string; subtitle: string; defaultTarget: string } => {
    switch (mode) {
      case 'brief':
        return {
          title: 'The Short Version',
          subtitle: 'Executive Synthesis',
          defaultTarget: '100–150',
        };
      case 'detailed':
        return {
          title: 'The Detailed Version',
          subtitle: 'In-Depth Analytical Breakdown',
          defaultTarget: '600–800',
        };
      case 'balanced':
      default:
        return {
          title: 'The Balanced Version',
          subtitle: 'Comprehensive Overview',
          defaultTarget: '250–350',
        };
    }
  };

  const summaryMeta = getSummaryHeading(summaryMode);
  const activeSummaryItem = analysis?.summaries?.[summaryMode];
  const displayedSummaryText = activeSummaryItem?.content || analysis?.summary || 'Summary unavailable.';
  const displayedSummaryWordCount = activeSummaryItem?.wordCount ?? (analysis?.summary ? analysis.summary.trim().split(/\s+/).length : 0);
  const displayedTargetRange = activeSummaryItem?.targetRange || summaryMeta.defaultTarget;

  // Load chat history
  useEffect(() => {
    api
      .getChatHistory(document.id)
      .then((history) => {
        if (history && history.length > 0) {
          setChatMessages(history);
        }
      })
      .catch(() => {});
  }, [document.id]);

  const handleAskQuestion = async (queryText?: string) => {
    const questionToAsk = (queryText || chatInput).trim();
    if (!questionToAsk || isAsking) return;

    setChatError(null);
    setChatInput('');
    setIsAsking(true);

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: questionToAsk,
      createdAt: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, userMessage]);

    try {
      const res = await api.askQuestion(document.id, questionToAsk, false);

      const assistantMessage: ChatMessage = {
        id: `ast-${Date.now()}`,
        role: 'assistant',
        content: res.answer,
        citations: res.citations,
        relevantPages: res.relevantPages,
        createdAt: new Date().toISOString(),
      };

      setChatMessages((prev) => [...prev, assistantMessage]);
      setIsAsking(false);
    } catch (err: any) {
      setIsAsking(false);
      setChatError(err.message || 'Could not answer the question at this time.');
    }
  };

  const handleExportMarkdown = () => {
    if (!analysis) return;
    const content = `# ${analysis.title}\n\n**Document Type:** ${analysis.documentType}\n**Mode:** ${summaryMode.toUpperCase()}\n\n## Summary (${summaryMeta.title})\n${displayedSummaryText}\n\n## Key Takeaways\n${analysis.keyTakeaways.map((k, i) => `${i + 1}. ${k.point} (Page ${k.page})`).join('\n')}\n\n## Important Numbers\n${analysis.importantNumbers.map((n) => `- **${n.value}**: ${n.label} (Page ${n.page})`).join('\n')}\n\n## Improvement Suggestions\n${analysis.improvementSuggestions.map((s) => `- [${s.severity.toUpperCase()}] **${s.area}**: ${s.recommendation}`).join('\n')}\n`;

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${document.originalName}_${summaryMode}_analysis.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySummary = () => {
    if (!displayedSummaryText) return;
    navigator.clipboard.writeText(displayedSummaryText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-paper-light dark:bg-paper-dark p-3 sm:p-5 md:p-6 space-y-6 sm:space-y-8 font-sans text-ink-950 dark:text-ink-50 select-text transition-colors duration-150 w-full">
      {/* 0. Document Unreadable / Extraction Failed Notice */}
      {document.status === 'FAILED' && (
        <div className="p-4 sm:p-5 bg-red-50 dark:bg-red-950/40 border-2 border-red-500 text-red-950 dark:text-red-200 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
            <span>⚠ Document Content Unreadable</span>
          </div>
          <h3 className="text-sm sm:text-base font-bold">
            Couldn't extract readable content from this document.
          </h3>
          <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
            {document.statusMessage ||
              'This file may contain encrypted content, unsupported formatting, very low-quality scans, or content that cannot be recognized.'}
          </p>
          <div className="pt-2 flex flex-wrap gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950 font-bold text-xs uppercase hover:opacity-90 transition-opacity"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      )}

      {/* 1. Document Signals / Profile */}
      <div className="p-3.5 sm:p-4 bg-paper-warm dark:bg-paper-darkcard border-1.5 border-ink-950 dark:border-ink-700 shadow-brutal-sm dark:shadow-brutal-sm-dark space-y-2.5 sm:space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-ink-600 dark:text-ink-400 font-mono">
            Document Profile
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[9px] sm:text-[10px] uppercase font-bold font-mono px-2 py-0.5 border border-ink-950 dark:border-ink-600 ${
                analysis?.operationalMode === 'full'
                  ? 'bg-ink-950 text-paper-light dark:bg-ink-100 dark:text-ink-950'
                  : 'bg-paper-light dark:bg-paper-darkmuted text-ink-950 dark:text-ink-100'
              }`}
            >
              {analysis?.aiProviderUsed ? `ENGINE: ${analysis.aiProviderUsed.toUpperCase()}` : 'ENGINE: DETERMINISTIC EXTRACTIVE'}
            </span>
          </div>
        </div>

        {/* Signals Badges - Original Extracted Document Statistics */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-bold font-mono">
          <span className="px-2 py-1 bg-paper-light dark:bg-paper-dark border border-ink-950 dark:border-ink-700 text-ink-900 dark:text-ink-100">
            {document.features.pageCount} {document.features.pageCount === 1 ? 'PAGE' : 'PAGES'}
          </span>
          <span className="px-2 py-1 bg-paper-light dark:bg-paper-dark border border-ink-950 dark:border-ink-700 text-ink-900 dark:text-ink-100" title="Total word count extracted from original document">
            {document.features.wordCount.toLocaleString()} WORDS
          </span>
          <span className="px-2 py-1 bg-paper-light dark:bg-paper-dark border border-ink-950 dark:border-ink-700 text-ink-900 dark:text-ink-100">
            ~{document.features.readingTimeMinutes} MIN READ
          </span>

          {document.features.chartCount > 0 && (
            <span className="px-2 py-1 bg-paper-light dark:bg-paper-dark border border-ink-950 dark:border-ink-700 text-ink-900 dark:text-ink-100">
              {document.features.chartCount} CHARTS
            </span>
          )}
          {document.features.tableCount > 0 && (
            <span className="px-2 py-1 bg-paper-light dark:bg-paper-dark border border-ink-950 dark:border-ink-700 text-ink-900 dark:text-ink-100">
              {document.features.tableCount} TABLES
            </span>
          )}
          {document.features.formulaCount > 0 && (
            <span className="px-2 py-1 bg-paper-light dark:bg-paper-dark border border-ink-950 dark:border-ink-700 text-ink-900 dark:text-ink-100">
              {document.features.formulaCount} FORMULAS
            </span>
          )}
          {document.features.hasHandwriting && (
            <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-950/50 border border-ink-950 dark:border-yellow-600 text-ink-950 dark:text-yellow-200">
              HANDWRITING
            </span>
          )}
        </div>
      </div>

      {/* 2. Mode Switcher & Summary Header */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 border-b-2 border-ink-950 dark:border-ink-800 pb-3 mb-4">
          <div>
            <span className="text-[10px] sm:text-[11px] font-bold text-ink-500 dark:text-ink-400 uppercase tracking-widest font-mono">
              {summaryMeta.subtitle}
            </span>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold uppercase tracking-tight text-ink-950 dark:text-ink-50">
              {summaryMeta.title}
            </h2>
          </div>

          {/* Mode Switcher Buttons */}
          <div className="flex items-center border border-ink-950 dark:border-ink-700 bg-paper-warm dark:bg-paper-darkcard p-0.5">
            {(['brief', 'balanced', 'detailed'] as SummaryMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setSummaryMode(mode)}
                className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs uppercase font-bold font-mono transition-colors ${
                  summaryMode === mode
                    ? 'bg-ink-950 text-paper-light dark:bg-ink-100 dark:text-ink-950'
                    : 'text-ink-700 dark:text-ink-300 hover:text-ink-950 dark:hover:text-paper-light hover:bg-paper-light dark:hover:bg-ink-800'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {isLoadingAnalysis ? (
          <div className="p-6 sm:p-8 text-center text-xs font-mono text-ink-600 dark:text-ink-400 bg-paper-warm dark:bg-paper-darkcard border border-ink-300 dark:border-ink-700">
            <span className="inline-block w-3 h-3 rounded-full bg-ink-950 dark:bg-ink-100 animate-ping mr-2"></span>
            Synthesizing {summaryMode} summary...
          </div>
        ) : analysisError ? (
          <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-400 dark:border-red-600 text-xs text-red-900 dark:text-red-200">
            {analysisError}
          </div>
        ) : (
          <div className="prose prose-sm font-sans max-w-none text-ink-900 dark:text-ink-100 leading-relaxed text-xs sm:text-sm bg-paper-warm dark:bg-paper-darkcard p-3.5 sm:p-4 border border-ink-950 dark:border-ink-700 break-words-anywhere">
            <ReactMarkdown>{displayedSummaryText}</ReactMarkdown>

            {/* Accurate Summary Word Count & Action Footer */}
            <div className="mt-4 pt-3 border-t border-ink-300 dark:border-ink-700 flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-[11px]">
              <div className="flex items-center gap-1.5 sm:gap-2 font-mono text-ink-600 dark:text-ink-400 flex-wrap">
                <span className="font-bold text-ink-900 dark:text-ink-100">
                  {displayedSummaryWordCount} WORDS
                </span>
                <span>•</span>
                <span>TARGET {displayedTargetRange}</span>
                {analysis?.durationMs ? (
                  <>
                    <span>•</span>
                    <span>{analysis.durationMs}ms</span>
                  </>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={handleCopySummary}
                  className="px-2 py-1 border border-ink-950 dark:border-ink-600 bg-paper-light dark:bg-paper-dark hover:bg-ink-950 hover:text-paper-light dark:hover:bg-ink-100 dark:hover:text-ink-950 text-[10px] uppercase font-bold font-mono transition-colors"
                >
                  {copySuccess ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={handleExportMarkdown}
                  className="px-2 py-1 border border-ink-950 dark:border-ink-600 bg-paper-light dark:bg-paper-dark hover:bg-ink-950 hover:text-paper-light dark:hover:bg-ink-100 dark:hover:text-ink-950 text-[10px] uppercase font-bold font-mono transition-colors"
                >
                  Export .MD
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. What Matters / Key Takeaways */}
      {analysis && analysis.keyTakeaways.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <div className="border-b-2 border-ink-950 dark:border-ink-800 pb-2">
            <span className="text-[10px] sm:text-[11px] font-bold text-ink-500 dark:text-ink-400 uppercase tracking-widest font-mono">
              Core Points
            </span>
            <h3 className="text-base sm:text-lg md:text-xl font-bold uppercase tracking-tight text-ink-950 dark:text-ink-50">
              What Matters
            </h3>
          </div>

          <div className="space-y-2 sm:space-y-2.5">
            {analysis.keyTakeaways.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-2.5 sm:p-3 bg-paper-light dark:bg-paper-darkcard border-1.5 border-ink-950 dark:border-ink-700 shadow-brutal-sm dark:shadow-brutal-sm-dark flex items-start justify-between gap-2 sm:gap-3 group transition-colors"
              >
                <div className="flex items-start gap-2 sm:gap-3 break-words-anywhere flex-1">
                  <span className="font-bold text-xs sm:text-sm text-ink-950 dark:text-ink-100 font-mono shrink-0">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <p className="text-xs sm:text-sm text-ink-900 dark:text-ink-100 leading-normal">
                    {item.point}
                  </p>
                </div>

                <button
                  onClick={() => triggerCitationJump(item.page, document.id, item.blockId, item.boundingBox)}
                  className="shrink-0 px-1.5 sm:px-2 py-1 bg-paper-warm dark:bg-paper-dark hover:bg-ink-950 hover:text-paper-light dark:hover:bg-ink-100 dark:hover:text-ink-950 border border-ink-950 dark:border-ink-600 text-[9px] sm:text-[10px] font-bold font-mono uppercase tracking-wider transition-colors"
                  title="Jump and highlight source region in document reader"
                >
                  P.{item.page} →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Numbers Worth Knowing */}
      {analysis && analysis.importantNumbers.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <div className="border-b-2 border-ink-950 dark:border-ink-800 pb-2">
            <span className="text-[10px] sm:text-[11px] font-bold text-ink-500 dark:text-ink-400 uppercase tracking-widest font-mono">
              Key Metrics & Financials
            </span>
            <h3 className="text-base sm:text-lg md:text-xl font-bold uppercase tracking-tight text-ink-950 dark:text-ink-50">
              Numbers Worth Knowing
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {analysis.importantNumbers.map((num, idx) => (
              <div
                key={`num-${idx}`}
                className="p-3 bg-paper-warm dark:bg-paper-darkcard border border-ink-950 dark:border-ink-700 shadow-brutal-sm dark:shadow-brutal-sm-dark flex flex-col justify-between"
              >
                <div>
                  <div className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-ink-950 dark:text-ink-50 break-words-anywhere">
                    {num.value}
                  </div>
                  <div className="text-xs text-ink-700 dark:text-ink-300 font-bold mt-0.5 line-clamp-2">
                    {num.label}
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-ink-300 dark:border-ink-700 flex items-center justify-between text-[10px] font-mono">
                  <span className="uppercase text-ink-500 dark:text-ink-400">{num.category}</span>
                  <button
                    onClick={() => triggerCitationJump(num.page, document.id, num.blockId, num.boundingBox)}
                    className="hover:underline font-bold text-ink-950 dark:text-ink-100"
                  >
                    Page {num.page} →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Document Map */}
      {analysis && analysis.sections.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <div className="border-b-2 border-ink-950 dark:border-ink-800 pb-2">
            <span className="text-[10px] sm:text-[11px] font-bold text-ink-500 dark:text-ink-400 uppercase tracking-widest font-mono">
              Structured Outline
            </span>
            <h3 className="text-base sm:text-lg md:text-xl font-bold uppercase tracking-tight text-ink-950 dark:text-ink-50">
              Document Map
            </h3>
          </div>

          <div className="border border-ink-950 dark:border-ink-700 divide-y divide-ink-300 dark:divide-ink-700 bg-paper-light dark:bg-paper-darkcard">
            {analysis.sections.map((section) => (
              <button
                key={section.number}
                onClick={() => triggerCitationJump(section.page, document.id, section.blockId, section.boundingBox)}
                className="w-full p-2 sm:p-2.5 text-left flex items-center justify-between gap-2 hover:bg-paper-warm dark:hover:bg-paper-darkmuted transition-colors"
              >
                <div className="flex items-center gap-2 sm:gap-3 truncate">
                  <span className="font-bold text-xs text-ink-500 dark:text-ink-400 font-mono shrink-0">{section.number}</span>
                  <span className="text-xs text-ink-950 dark:text-ink-100 font-bold truncate">{section.title}</span>
                </div>
                <span className="text-[10px] font-bold font-mono text-ink-600 dark:text-ink-400 shrink-0 border border-ink-400 dark:border-ink-600 px-1.5 py-0.5 bg-paper-warm dark:bg-paper-dark">
                  P.{section.page}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 6. Worth a Closer Look (Improvement Suggestions) */}
      {analysis && analysis.improvementSuggestions.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <div className="border-b-2 border-ink-950 dark:border-ink-800 pb-2">
            <span className="text-[10px] sm:text-[11px] font-bold text-ink-500 dark:text-ink-400 uppercase tracking-widest font-mono">
              Actionable Feedback
            </span>
            <h3 className="text-base sm:text-lg md:text-xl font-bold uppercase tracking-tight text-ink-950 dark:text-ink-50">
              Worth a Closer Look
            </h3>
          </div>

          <div className="space-y-2.5 sm:space-y-3">
            {analysis.improvementSuggestions.map((sug, idx) => (
              <div
                key={`sug-${idx}`}
                className="p-3 bg-paper-warm dark:bg-paper-darkcard border border-ink-950 dark:border-ink-700 text-xs space-y-1.5 break-words-anywhere"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold uppercase text-ink-950 dark:text-ink-100 font-mono text-[11px] sm:text-xs">{sug.area}</span>
                  <span
                    className={`text-[9px] font-bold font-mono uppercase px-1.5 py-0.5 border shrink-0 ${
                      sug.severity === 'high'
                        ? 'bg-red-100 dark:bg-red-950/60 border-red-600 text-red-900 dark:text-red-200'
                        : sug.severity === 'medium'
                        ? 'bg-yellow-100 dark:bg-yellow-950/60 border-yellow-600 text-yellow-900 dark:text-yellow-200'
                        : 'bg-paper-light dark:bg-paper-dark border-ink-400 dark:border-ink-600 text-ink-700 dark:text-ink-300'
                    }`}
                  >
                    {sug.severity}
                  </span>
                </div>
                <p className="text-ink-700 dark:text-ink-300 text-[11px]">{sug.issue}</p>
                <div className="pt-0.5 text-ink-950 dark:text-ink-100 font-bold text-[11px]">
                  ↳ {sug.recommendation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. Ask Unthinkable (Grounded Q&A) */}
      <div className="space-y-3 sm:space-y-4 pt-4 border-t-2 border-ink-950 dark:border-ink-800">
        <div className="border-b-2 border-ink-950 dark:border-ink-800 pb-2">
          <span className="text-[10px] sm:text-[11px] font-bold text-ink-500 dark:text-ink-400 uppercase tracking-widest font-mono">
            Contextual Q&A
          </span>
          <h3 className="text-base sm:text-lg md:text-xl font-bold uppercase tracking-tight text-ink-950 dark:text-ink-50">
            Ask Unthinkable
          </h3>
        </div>

        {/* Suggested Questions */}
        {analysis?.suggestedQuestions && analysis.suggestedQuestions.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-ink-500 dark:text-ink-400 font-mono">
              Suggested Questions:
            </span>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
              {analysis.suggestedQuestions.slice(0, 3).map((q, idx) => (
                <button
                  key={`sq-${idx}`}
                  onClick={() => handleAskQuestion(q)}
                  disabled={isAsking}
                  className="text-left text-[11px] px-2.5 py-1.5 bg-paper-warm dark:bg-paper-darkcard hover:bg-ink-950 hover:text-paper-light dark:hover:bg-ink-100 dark:hover:text-ink-950 border border-ink-950 dark:border-ink-700 text-ink-900 dark:text-ink-100 transition-colors w-full sm:w-auto"
                >
                  "{q}"
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat History Messages */}
        <div className="space-y-2.5 max-h-72 sm:max-h-80 overflow-y-auto p-2.5 sm:p-3 bg-paper-warm dark:bg-paper-darkcard border border-ink-950 dark:border-ink-700">
          {chatMessages.length === 0 ? (
            <div className="py-5 text-center text-xs text-ink-500 dark:text-ink-400 font-mono">
              Ask anything about this document. Answers are strictly verified against page context.
            </div>
          ) : (
            chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`p-2.5 sm:p-3 text-xs break-words-anywhere ${
                  msg.role === 'user'
                    ? 'bg-paper-light dark:bg-paper-dark border border-ink-950 dark:border-ink-700 ml-2 sm:ml-6 text-ink-950 dark:text-ink-100'
                    : 'bg-paper-warm dark:bg-paper-darkmuted border-l-4 border-ink-950 dark:border-ink-100 mr-1 sm:mr-2 text-ink-900 dark:text-ink-100'
                }`}
              >
                <div className="text-[10px] font-bold uppercase font-mono text-ink-500 dark:text-ink-400 mb-1">
                  {msg.role === 'user' ? 'You' : 'Unthinkable'}
                </div>
                <div className="leading-relaxed whitespace-pre-wrap text-xs sm:text-sm">{msg.content}</div>

                {/* Citation buttons in Assistant Answers */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-2 pt-1.5 border-t border-ink-300 dark:border-ink-700 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="text-ink-500 dark:text-ink-400 font-bold font-mono uppercase">Sources:</span>
                    {msg.citations.map((c, cIdx) => (
                      <button
                        key={`c-${cIdx}`}
                        onClick={() => triggerCitationJump(c.page, document.id, c.blockId, c.boundingBox)}
                        className="px-1.5 py-0.5 bg-paper-light dark:bg-paper-dark border border-ink-950 dark:border-ink-600 text-ink-950 dark:text-ink-100 hover:bg-ink-950 hover:text-paper-light dark:hover:bg-ink-100 dark:hover:text-ink-950 font-bold font-mono transition-colors"
                      >
                        Page {c.page}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}

          {isAsking && (
            <div className="p-2.5 sm:p-3 bg-paper-warm dark:bg-paper-darkmuted border-l-4 border-ink-950 dark:border-ink-100 text-xs font-mono text-ink-600 dark:text-ink-400">
              <span className="inline-block w-2 h-2 rounded-full bg-ink-950 dark:bg-ink-100 animate-ping mr-2"></span>
              Searching document pages and formulating answer...
            </div>
          )}

          {chatError && (
            <div className="p-2 bg-red-50 dark:bg-red-950/40 border border-red-500 text-red-900 dark:text-red-200 text-[11px]">
              {chatError}
            </div>
          )}
        </div>

        {/* Chat Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAskQuestion();
          }}
          className="flex items-center gap-1.5 sm:gap-2"
        >
          <input
            type="text"
            placeholder="Ask anything about this document..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={isAsking}
            className="flex-1 px-3 py-2 border-1.5 border-ink-950 dark:border-ink-700 bg-paper-light dark:bg-paper-darkcard text-ink-950 dark:text-ink-50 text-xs font-mono focus:outline-none focus:bg-paper-warm dark:focus:bg-paper-dark min-w-0"
          />
          <button
            type="submit"
            disabled={isAsking || !chatInput.trim()}
            className="px-3 sm:px-4 py-2 brutal-btn bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950 hover:bg-ink-800 dark:hover:bg-white text-xs font-bold font-mono uppercase disabled:opacity-50 shrink-0"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
};
