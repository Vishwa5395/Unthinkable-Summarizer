import React, { useRef } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { ContinuousDocumentViewer } from '../viewer/ContinuousDocumentViewer';
import { DocumentIntelligencePanel } from '../analysis/DocumentIntelligencePanel';
import { CombinedAnalysisView } from '../analysis/CombinedAnalysisView';
import { api } from '../../lib/api';

export const Workspace: React.FC = () => {
  const {
    documents,
    activeDocumentId,
    activeTab,
    setActiveTab,
    addDocuments,
    mobileViewMode,
    setMobileViewMode,
  } = useWorkspaceStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeDocument =
    documents.find((d) => d.id === activeDocumentId) || documents[0];

  const handleAddMoreFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    try {
      const files = Array.from(e.target.files);
      const res = await api.uploadFiles(files);
      addDocuments(res.documents);
    } catch (err: any) {
      alert(err.message || 'Failed to add more files');
    }
  };

  if (documents.length === 0 || !activeDocument) {
    return null;
  }

  const isCombinedTab = activeTab === 'combined';

  return (
    <div className="flex flex-col h-[calc(100dvh-53px)] sm:h-[calc(100vh-57px)] overflow-hidden bg-paper-warm dark:bg-paper-dark transition-colors duration-150 w-full max-w-full">
      {/* Top Document Tabs Bar */}
      <div className="bg-paper-light dark:bg-paper-darkcard editorial-border-b dark:border-ink-800 px-3 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between gap-2 overflow-x-auto select-none z-20 transition-colors duration-150 shrink-0">
        {/* Horizontal scrollable document list */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 max-w-[70vw] md:max-w-none">
          {documents.map((doc) => {
            const isActive = activeTab === `doc_${doc.id}` || (!isCombinedTab && activeDocumentId === doc.id);
            return (
              <button
                key={doc.id}
                onClick={() => setActiveTab(`doc_${doc.id}`)}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-mono font-bold uppercase truncate max-w-[130px] sm:max-w-[180px] md:max-w-[220px] border transition-all shrink-0 ${
                  isActive
                    ? 'border-2 border-ink-950 dark:border-ink-100 bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950 shadow-brutal-sm dark:shadow-brutal-sm-dark'
                    : 'border-ink-300 dark:border-ink-700 bg-paper-warm dark:bg-paper-dark text-ink-800 dark:text-ink-300 hover:border-ink-950 dark:hover:border-ink-400'
                }`}
                title={doc.originalName}
              >
                <span className="truncate">{doc.originalName}</span>
              </button>
            );
          })}

          {/* Combined Analysis Tab for Multiple Files */}
          {documents.length > 1 && (
            <button
              onClick={() => setActiveTab('combined')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-mono font-bold uppercase border transition-all shrink-0 ${
                isCombinedTab
                  ? 'border-2 border-ink-950 dark:border-ink-100 bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950 shadow-brutal-sm dark:shadow-brutal-sm-dark'
                  : 'border-ink-950 dark:border-ink-600 bg-paper-warm dark:bg-paper-dark text-ink-950 dark:text-ink-100 hover:bg-paper-light dark:hover:bg-ink-800'
              }`}
            >
              ★ Comparison
            </button>
          )}

          {/* Add more files hidden input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleAddMoreFiles}
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2 sm:px-2.5 py-1 sm:py-1.5 text-[11px] sm:text-xs font-mono uppercase border border-dashed border-ink-400 dark:border-ink-600 hover:border-ink-950 dark:hover:border-ink-300 hover:bg-paper-warm dark:hover:bg-ink-900 text-ink-600 dark:text-ink-400 hover:text-ink-950 dark:hover:text-ink-100 shrink-0"
            title="Add more documents to this session"
          >
            + Add
          </button>
        </div>

        {/* Mobile View Toggle Buttons */}
        <div className="flex md:hidden items-center border border-ink-950 dark:border-ink-700 bg-paper-warm dark:bg-paper-dark p-0.5 shrink-0 ml-1">
          <button
            onClick={() => setMobileViewMode('document')}
            className={`px-2.5 py-1 text-[11px] font-mono uppercase font-bold transition-colors ${
              mobileViewMode === 'document'
                ? 'bg-ink-950 text-paper-light dark:bg-ink-100 dark:text-ink-950 shadow-xs'
                : 'text-ink-700 dark:text-ink-300 hover:text-ink-950'
            }`}
          >
            Document
          </button>
          <button
            onClick={() => setMobileViewMode('analysis')}
            className={`px-2.5 py-1 text-[11px] font-mono uppercase font-bold transition-colors ${
              mobileViewMode === 'analysis'
                ? 'bg-ink-950 text-paper-light dark:bg-ink-100 dark:text-ink-950 shadow-xs'
                : 'text-ink-700 dark:text-ink-300 hover:text-ink-950'
            }`}
          >
            Analysis
          </button>
        </div>
      </div>

      {/* Main Workspace Split Layout */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden w-full max-w-full">
        {/* Left Pane: Document Viewer */}
        <div
          className={`h-full overflow-hidden w-full ${
            isCombinedTab ? 'hidden' : mobileViewMode === 'document' ? 'block' : 'hidden md:block'
          }`}
        >
          <ContinuousDocumentViewer document={activeDocument} />
        </div>

        {/* Right Pane: Intelligence or Combined View */}
        <div
          className={`h-full overflow-hidden w-full ${
            isCombinedTab
              ? 'col-span-1 md:col-span-2 block'
              : mobileViewMode === 'analysis'
              ? 'block'
              : 'hidden md:block'
          }`}
        >
          {isCombinedTab ? (
            <CombinedAnalysisView documents={documents} />
          ) : (
            <DocumentIntelligencePanel document={activeDocument} />
          )}
        </div>
      </div>
    </div>
  );
};
