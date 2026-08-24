import React, { useState, useRef } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { api } from '../../lib/api';
import { SummaryMode } from '../../types';

export const HeroUpload: React.FC = () => {
  const {
    summaryMode,
    setSummaryMode,
    addDocuments,
    setIsUploading,
    setIsAnalyzing,
    isUploading,
    isAnalyzing,
  } = useWorkspaceStore();

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelection = (files: FileList | File[]) => {
    setErrorMessage(null);
    const newFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext || '')) {
        // Prevent duplicate filenames in same batch
        if (!selectedFiles.some((f) => f.name === file.name)) {
          newFiles.push(file);
        }
      } else {
        setErrorMessage(`File "${file.name}" has an unsupported format. Supported: PDF, PNG, JPG, JPEG, WEBP.`);
      }
    }

    if (selectedFiles.length + newFiles.length > 5) {
      setErrorMessage('You can upload up to 5 documents per session.');
      setSelectedFiles((prev) => [...prev, ...newFiles].slice(0, 5));
    } else {
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files);
    }
  };

  const startAnalysis = async () => {
    if (selectedFiles.length === 0) {
      setErrorMessage('Please choose or drop at least one document to analyze.');
      return;
    }

    try {
      setErrorMessage(null);
      setIsUploading(true);
      setCurrentStage('Opening documents and validating signatures...');

      const uploadResult = await api.uploadFiles(selectedFiles);
      const docs = uploadResult.documents;

      setIsUploading(false);
      setIsAnalyzing(true);
      setCurrentStage('Extracting text, layout, and visual elements...');

      addDocuments(docs);

      // Poll until document extraction and initial analysis are ready
      const pollInterval = setInterval(async () => {
        try {
          const firstDoc = docs[0];
          const latest = await api.getDocument(firstDoc.id);

          if (latest.status === 'READY' || latest.status === 'COMPLETE' || latest.status === 'DEGRADED') {
            clearInterval(pollInterval);
            setIsAnalyzing(false);
            addDocuments([latest]);
          } else if (latest.status === 'FAILED') {
            clearInterval(pollInterval);
            setIsAnalyzing(false);
            addDocuments([latest]);
            setErrorMessage(latest.statusMessage || 'Unthinkable could not extract readable content from this file.');
          } else {
            setCurrentStage(latest.statusMessage || 'Analyzing document contents...');
          }
        } catch {
          // keep polling
        }
      }, 1000);

      // Max timeout safeguard (45s)
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsAnalyzing(false);
      }, 45000);
    } catch (err: any) {
      setIsUploading(false);
      setIsAnalyzing(false);
      setErrorMessage(err.message || 'An unexpected error occurred during upload.');
    }
  };

  const isBusy = isUploading || isAnalyzing;

  return (
    <section className="w-full max-w-4xl mx-auto px-3 sm:px-6 md:px-8 py-6 sm:py-10 md:py-12 transition-colors duration-150">
      {/* Title & Editorial Microcopy */}
      <div className="text-center mb-6 sm:mb-8">
        <div className="inline-block px-2.5 py-1 bg-ink-100 dark:bg-ink-900 border border-ink-950 dark:border-ink-700 text-[10px] sm:text-xs font-mono tracking-widest uppercase mb-3 sm:mb-4 text-ink-950 dark:text-ink-100">
          ✦ Multimodal Document Comprehension
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter text-ink-950 dark:text-ink-50 uppercase mb-2 sm:mb-3 leading-tight">
          Drop a document. <br className="hidden sm:inline" />
          <span className="hand-drawn-underline">We'll find what matters.</span>
        </h1>
        <p className="text-xs sm:text-sm md:text-base text-ink-700 dark:text-ink-400 max-w-xl mx-auto font-mono mt-3 sm:mt-4">
          Reads text, handwriting, scanned pages, charts, tables & formulas.
          Extracts grounded insights with page-level citations.
        </p>
      </div>

      {/* Main Tool Container */}
      <div className="bg-paper-light dark:bg-paper-darkcard border-2 border-ink-950 dark:border-ink-700 shadow-brutal-lg dark:shadow-brutal-lg-dark p-4 sm:p-6 md:p-8 transition-colors duration-150">
        {/* Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isBusy && fileInputRef.current?.click()}
          className={`border-2 border-dashed p-6 sm:p-8 md:p-12 text-center cursor-pointer transition-all ${
            isDragOver
              ? 'border-ink-950 dark:border-ink-100 bg-ink-100 dark:bg-ink-900 scale-[0.99]'
              : 'border-ink-400 dark:border-ink-600 bg-paper-warm dark:bg-paper-dark hover:border-ink-950 dark:hover:border-ink-400 hover:bg-paper-muted dark:hover:bg-ink-900'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files && handleFileSelection(e.target.files)}
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="hidden"
            disabled={isBusy}
          />

          <div className="max-w-md mx-auto space-y-2.5 sm:space-y-3">
            <div className="text-base sm:text-lg md:text-xl font-bold uppercase tracking-tight text-ink-950 dark:text-ink-50">
              {isDragOver ? 'Release to upload files' : 'Drop your documents here'}
            </div>

            <div className="text-[11px] sm:text-xs font-mono text-ink-600 dark:text-ink-400">
              Supports <strong className="text-ink-950 dark:text-ink-100">PDF · JPG · PNG · WEBP</strong> (Up to 25 MB each)
            </div>

            <div className="pt-1.5 sm:pt-2">
              <button
                type="button"
                className="text-xs font-mono uppercase px-3.5 sm:px-4 py-2 brutal-btn bg-paper-light dark:bg-paper-darkcard text-ink-950 dark:text-ink-50 hover:bg-paper-muted dark:hover:bg-ink-800 pointer-events-none"
              >
                [ Choose Documents ]
              </button>
            </div>
          </div>
        </div>

        {/* Selected File Chips */}
        {selectedFiles.length > 0 && (
          <div className="mt-5 sm:mt-6 space-y-2">
            <div className="text-xs font-mono uppercase tracking-wider text-ink-600 dark:text-ink-400 flex justify-between items-center">
              <span>Selected Documents ({selectedFiles.length}/5)</span>
              <button
                onClick={() => setSelectedFiles([])}
                className="text-ink-700 dark:text-ink-300 hover:text-ink-950 dark:hover:text-paper-light underline"
                disabled={isBusy}
              >
                Clear all
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {selectedFiles.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between p-2 sm:p-2.5 bg-paper-warm dark:bg-paper-dark border border-ink-950 dark:border-ink-700 text-xs font-mono"
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="px-1.5 py-0.5 bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950 text-[10px] uppercase font-bold shrink-0">
                      {file.name.split('.').pop()}
                    </span>
                    <span className="truncate text-ink-950 dark:text-ink-100 font-bold">{file.name}</span>
                    <span className="text-ink-500 dark:text-ink-400 text-[10px] shrink-0">
                      ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                    </span>
                  </div>

                  {!isBusy && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(idx);
                      }}
                      className="text-ink-500 dark:text-ink-400 hover:text-ink-950 dark:hover:text-paper-light px-1 font-bold text-sm"
                      title="Remove file"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary Depth Mode Selector */}
        <div className="mt-5 sm:mt-6 pt-5 sm:pt-6 border-t border-ink-300 dark:border-ink-700">
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-700 dark:text-ink-300 mb-2.5 sm:mb-3">
            Summary Detail Level
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            {(
              [
                { mode: 'brief', label: 'Brief', desc: '100–150 words · Executive' },
                { mode: 'balanced', label: 'Balanced', desc: '250–350 words · Recommended' },
                { mode: 'detailed', label: 'Detailed', desc: '600–800 words · Comprehensive' },
              ] as const
            ).map((item) => (
              <button
                key={item.mode}
                type="button"
                onClick={() => setSummaryMode(item.mode as SummaryMode)}
                disabled={isBusy}
                className={`p-2.5 sm:p-3 text-left border transition-all ${
                  summaryMode === item.mode
                    ? 'border-2 border-ink-950 dark:border-ink-100 bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950 shadow-brutal-sm dark:shadow-brutal-sm-dark'
                    : 'border-ink-300 dark:border-ink-700 bg-paper-warm dark:bg-paper-dark text-ink-950 dark:text-ink-100 hover:border-ink-950 dark:hover:border-ink-400'
                }`}
              >
                <div className="font-bold text-xs sm:text-sm uppercase font-mono">{item.label}</div>
                <div className={`text-[10px] sm:text-[11px] font-mono mt-0.5 sm:mt-1 ${summaryMode === item.mode ? 'text-ink-300 dark:text-ink-700' : 'text-ink-600 dark:text-ink-400'}`}>
                  {item.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-500 text-red-900 dark:text-red-200 text-xs font-mono">
            <strong>UNTHINKABLE COULDN'T PROCESS THAT:</strong> {errorMessage}
          </div>
        )}

        {/* Progress & Staging Experience */}
        {isBusy && (
          <div className="mt-5 sm:mt-6 p-3.5 sm:p-4 bg-paper-warm dark:bg-paper-dark border border-ink-950 dark:border-ink-700 space-y-3 font-mono">
            <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
              <span className="font-bold uppercase tracking-wider text-ink-950 dark:text-ink-100 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-ink-950 dark:bg-ink-100 animate-ping"></span>
                Processing Pipeline Active
              </span>
              <span className="text-ink-600 dark:text-ink-400 text-[10px] sm:text-[11px]">{currentStage}</span>
            </div>

            {/* Stages Checkpoints */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] sm:text-[11px] text-ink-700 dark:text-ink-300">
              <div className="flex items-center gap-1.5">
                <span className="text-ink-950 dark:text-ink-100 font-bold">✓</span> File Validation
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-ink-950 dark:text-ink-100 font-bold">✓</span> Layout & OCR
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-ink-950 dark:text-ink-100 font-bold">●</span> Multimodal Index
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-ink-400 dark:text-ink-600 font-bold">○</span> Final Intelligence
              </div>
            </div>
          </div>
        )}

        {/* CTA Analyze Button */}
        <div className="mt-5 sm:mt-6">
          <button
            type="button"
            onClick={startAnalysis}
            disabled={isBusy || selectedFiles.length === 0}
            className={`w-full py-3.5 sm:py-4 text-xs sm:text-sm md:text-base font-bold uppercase tracking-wider font-mono brutal-btn transition-all ${
              selectedFiles.length === 0 || isBusy
                ? 'bg-ink-200 dark:bg-ink-800 text-ink-500 dark:text-ink-500 border-ink-400 dark:border-ink-700 cursor-not-allowed shadow-none'
                : 'bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950 hover:bg-ink-850 dark:hover:bg-white'
            }`}
          >
            {isUploading
              ? 'Uploading Documents...'
              : isAnalyzing
              ? 'Extracting Document Intelligence...'
              : selectedFiles.length > 1
              ? `[ Analyze ${selectedFiles.length} Documents ]`
              : '[ Analyze Document ]'}
          </button>
        </div>
      </div>
    </section>
  );
};
