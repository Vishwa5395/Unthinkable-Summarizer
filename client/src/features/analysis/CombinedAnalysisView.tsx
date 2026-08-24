import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { UnifiedDocument, MultiDocumentAnalysis, ChatMessage } from '../../types';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { api, getSessionId } from '../../lib/api';

interface CombinedAnalysisViewProps {
  documents: UnifiedDocument[];
}

export const CombinedAnalysisView: React.FC<CombinedAnalysisViewProps> = ({ documents }) => {
  const {
    triggerCitationJump,
    cachedMultiAnalysis,
    cacheMultiAnalysis,
  } = useWorkspaceStore();

  const [multiAnalysis, setMultiAnalysis] = useState<MultiDocumentAnalysis | null>(cachedMultiAnalysis);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedMultiAnalysis);
  const [error, setError] = useState<string | null>(null);

  // Chat State for Multi-document
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);

  useEffect(() => {
    if (cachedMultiAnalysis) {
      setMultiAnalysis(cachedMultiAnalysis);
      return;
    }

    setIsLoading(true);
    setError(null);

    const docIds = documents.map((d) => d.id);
    const sessionId = getSessionId();

    api
      .compareDocuments(docIds, sessionId)
      .then((data) => {
        setMultiAnalysis(data);
        cacheMultiAnalysis(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Unable to generate multi-document comparison.');
        setIsLoading(false);
      });
  }, [documents, cachedMultiAnalysis]);

  const handleAskQuestion = async (queryText?: string) => {
    const questionToAsk = (queryText || chatInput).trim();
    if (!questionToAsk || isAsking) return;

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
      const res = await api.askQuestion('session', questionToAsk, true, getSessionId());

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
    } catch {
      setIsAsking(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-paper-light dark:bg-paper-dark p-3 sm:p-6 md:p-8 space-y-6 sm:space-y-8 font-mono text-ink-950 dark:text-ink-50 max-w-5xl mx-auto transition-colors duration-150 w-full">
      {/* Header */}
      <div className="border-b-2 border-ink-950 dark:border-ink-800 pb-3 sm:pb-4">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
          <span className="px-2 py-0.5 bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950 text-[10px] font-bold uppercase">
            CROSS-DOCUMENT SYNTHESIS
          </span>
          <span className="text-[11px] sm:text-xs text-ink-500 dark:text-ink-400">
            {documents.length} DOCUMENTS COMPARED
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold uppercase tracking-tight text-ink-950 dark:text-ink-50">
          Combined Analysis
        </h2>
        <div className="text-xs text-ink-600 dark:text-ink-400 mt-1 break-words-anywhere">
          Comparing: {documents.map((d) => d.originalName).join(', ')}
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 sm:p-12 text-center text-xs text-ink-600 dark:text-ink-400 bg-paper-warm dark:bg-paper-darkcard border border-ink-950 dark:border-ink-700">
          <span className="inline-block w-3 h-3 rounded-full bg-ink-950 dark:bg-ink-100 animate-ping mr-2"></span>
          Synthesizing cross-document connections and comparison matrix...
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-500 text-xs text-red-900 dark:text-red-200">
          {error}
        </div>
      ) : (
        <>
          {/* Combined Executive Summary */}
          <div className="p-3.5 sm:p-4 bg-paper-warm dark:bg-paper-darkcard border-1.5 border-ink-950 dark:border-ink-700 shadow-brutal-sm dark:shadow-brutal-sm-dark space-y-3">
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-ink-950 dark:text-ink-50">
              Cross-Document Executive Summary
            </h3>
            <div className="prose prose-sm font-mono max-w-none text-xs md:text-sm text-ink-900 dark:text-ink-100 leading-relaxed break-words-anywhere">
              <ReactMarkdown>{multiAnalysis?.combinedSummary || ''}</ReactMarkdown>
            </div>
          </div>

          {/* Comparison Matrix Table */}
          {multiAnalysis?.comparisonMatrix && multiAnalysis.comparisonMatrix.length > 0 && (
            <div className="space-y-2.5 sm:space-y-3">
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-ink-950 dark:text-ink-50">
                Comparison Matrix
              </h3>
              <div className="overflow-x-auto border border-ink-950 dark:border-ink-700 bg-paper-light dark:bg-paper-darkcard w-full">
                <table className="w-full text-xs text-left border-collapse min-w-[300px]">
                  <thead>
                    <tr className="bg-paper-warm dark:bg-paper-dark border-b border-ink-950 dark:border-ink-700">
                      <th className="p-2 sm:p-3 font-bold border-r border-ink-950 dark:border-ink-700 text-ink-950 dark:text-ink-100">Dimension</th>
                      {documents.map((d) => (
                        <th key={d.id} className="p-2 sm:p-3 font-bold border-r border-ink-950 dark:border-ink-700 truncate max-w-[140px] sm:max-w-[200px] text-ink-950 dark:text-ink-100">
                          {d.originalName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200 dark:divide-ink-700">
                    {multiAnalysis.comparisonMatrix.map((row, idx) => (
                      <tr key={idx} className="hover:bg-paper-warm dark:hover:bg-paper-darkmuted">
                        <td className="p-2 sm:p-3 font-bold border-r border-ink-950 dark:border-ink-700 bg-paper-warm dark:bg-paper-dark text-ink-800 dark:text-ink-200">
                          {row.feature}
                        </td>
                        {documents.map((d) => (
                          <td key={d.id} className="p-2 sm:p-3 border-r border-ink-950 dark:border-ink-700 text-ink-900 dark:text-ink-100 break-words-anywhere">
                            {row.values[d.originalName] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Shared Themes & Key Differences */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {/* Shared Themes */}
            <div className="p-3.5 sm:p-4 bg-paper-light dark:bg-paper-darkcard border-1.5 border-ink-950 dark:border-ink-700 shadow-brutal-sm dark:shadow-brutal-sm-dark space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-950 dark:text-ink-50 border-b border-ink-300 dark:border-ink-700 pb-2">
                Shared Themes
              </h3>
              <ul className="space-y-2 text-xs">
                {multiAnalysis?.sharedThemes.map((theme, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-ink-900 dark:text-ink-200 break-words-anywhere">
                    <span className="font-bold text-ink-950 dark:text-ink-50 shrink-0">✦</span>
                    <span>{theme}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Cross-Document Insights */}
            <div className="p-3.5 sm:p-4 bg-paper-light dark:bg-paper-darkcard border-1.5 border-ink-950 dark:border-ink-700 shadow-brutal-sm dark:shadow-brutal-sm-dark space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-950 dark:text-ink-50 border-b border-ink-300 dark:border-ink-700 pb-2">
                Cross-Document Insights
              </h3>
              <ul className="space-y-2 text-xs">
                {multiAnalysis?.crossDocumentInsights.map((insight, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-ink-900 dark:text-ink-200 break-words-anywhere">
                    <span className="font-bold text-ink-950 dark:text-ink-50 shrink-0">→</span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Multi-Document Q&A */}
          <div className="space-y-3 sm:space-y-4 pt-4 border-t-2 border-ink-950 dark:border-ink-800">
            <div className="border-b-2 border-ink-950 dark:border-ink-800 pb-2">
              <span className="text-[10px] sm:text-[11px] font-bold text-ink-500 dark:text-ink-400 uppercase tracking-widest">
                Cross-Document Reasoning
              </span>
              <h3 className="text-base sm:text-lg md:text-xl font-bold uppercase tracking-tight text-ink-950 dark:text-ink-50">
                Ask Across All Documents
              </h3>
            </div>

            {/* Smart questions */}
            {multiAnalysis?.suggestedQuestions && (
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
                {multiAnalysis.suggestedQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAskQuestion(q)}
                    disabled={isAsking}
                    className="text-left text-[11px] px-2.5 py-1.5 bg-paper-warm dark:bg-paper-darkcard hover:bg-ink-950 hover:text-paper-light dark:hover:bg-ink-100 dark:hover:text-ink-950 border border-ink-950 dark:border-ink-700 text-ink-900 dark:text-ink-100 transition-colors w-full sm:w-auto"
                  >
                    "{q}"
                  </button>
                ))}
              </div>
            )}

            {/* Chat message stream */}
            <div className="space-y-2.5 max-h-72 sm:max-h-80 overflow-y-auto p-2.5 sm:p-3 bg-paper-warm dark:bg-paper-darkcard border border-ink-950 dark:border-ink-700">
              {chatMessages.length === 0 ? (
                <div className="py-5 text-center text-xs text-ink-500 dark:text-ink-400">
                  Ask questions that require comparing or synthesizing information across all uploaded files.
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
                    <div className="text-[10px] font-bold uppercase text-ink-500 dark:text-ink-400 mb-1">
                      {msg.role === 'user' ? 'You' : 'Unthinkable'}
                    </div>
                    <div className="leading-relaxed whitespace-pre-wrap">{msg.content}</div>

                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-2 pt-1.5 border-t border-ink-300 dark:border-ink-700 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="text-ink-500 dark:text-ink-400 font-bold uppercase">Sources:</span>
                        {msg.citations.map((c, cIdx) => (
                          <button
                            key={`c-${cIdx}`}
                            onClick={() => triggerCitationJump(c.page, c.documentId, c.blockId, c.boundingBox)}
                            className="px-1.5 py-0.5 bg-paper-light dark:bg-paper-dark border border-ink-950 dark:border-ink-600 text-ink-950 dark:text-ink-100 hover:bg-ink-950 hover:text-paper-light dark:hover:bg-ink-100 dark:hover:text-ink-950 font-bold transition-colors"
                          >
                            Doc P.{c.page}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}

              {isAsking && (
                <div className="p-2.5 sm:p-3 bg-paper-warm dark:bg-paper-darkmuted border-l-4 border-ink-950 dark:border-ink-100 text-xs text-ink-600 dark:text-ink-400">
                  <span className="inline-block w-2 h-2 rounded-full bg-ink-950 dark:bg-ink-100 animate-ping mr-2"></span>
                  Synthesizing multi-document answer...
                </div>
              )}
            </div>

            {/* Input bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAskQuestion();
              }}
              className="flex items-center gap-1.5 sm:gap-2"
            >
              <input
                type="text"
                placeholder="Ask across all documents..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isAsking}
                className="flex-1 px-3 py-2 border-1.5 border-ink-950 dark:border-ink-700 bg-paper-light dark:bg-paper-darkcard text-ink-950 dark:text-ink-50 text-xs font-mono focus:outline-none focus:bg-paper-warm dark:focus:bg-paper-dark min-w-0"
              />
              <button
                type="submit"
                disabled={isAsking || !chatInput.trim()}
                className="px-3 sm:px-4 py-2 brutal-btn bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950 hover:bg-ink-800 dark:hover:bg-white text-xs font-bold uppercase disabled:opacity-50 shrink-0"
              >
                Ask
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
