import React from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { ThemeSwitcher } from './ThemeSwitcher';

export const Header: React.FC = () => {
  const { documents, resetSession, setAuthModalOpen, user, setHistoryDrawerOpen } = useWorkspaceStore();

  return (
    <header className="w-full bg-paper-warm dark:bg-paper-dark editorial-border-b dark:border-ink-800 sticky top-0 z-40 px-3 sm:px-6 md:px-8 py-2.5 sm:py-3 flex items-center justify-between gap-2 transition-colors duration-150">
      {/* Brand Identity */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          onClick={resetSession}
          className="text-left flex items-baseline gap-1.5 sm:gap-2 group hover:opacity-80 transition-opacity focus:outline-none"
        >
          <span className="font-bold text-lg sm:text-xl md:text-2xl tracking-tighter text-ink-950 dark:text-ink-50 uppercase">
            Unthinkable
          </span>
          <span className="text-[10px] sm:text-xs uppercase px-1 sm:px-1.5 py-0.5 border border-ink-950 dark:border-ink-100 bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950 tracking-wider font-mono">
            Summarizer
          </span>
        </button>

        <span className="hidden lg:inline-block text-[11px] text-ink-500 dark:text-ink-400 font-mono pl-3 border-l border-ink-300 dark:border-ink-700">
          MULTIMODAL DOCUMENT INTELLIGENCE
        </span>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3">
        {/* Theme Switcher */}
        <ThemeSwitcher />

        {documents.length > 0 && (
          <>
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono border border-ink-950 dark:border-ink-700 bg-paper-light dark:bg-paper-darkcard text-ink-900 dark:text-ink-100">
              <span className="inline-block w-2 h-2 rounded-full bg-ink-950 dark:bg-ink-100"></span>
              <span>{documents.length} {documents.length === 1 ? 'FILE' : 'FILES'}</span>
            </div>

            <button
              onClick={resetSession}
              className="text-[11px] sm:text-xs font-mono uppercase px-2 sm:px-3 py-1 sm:py-1.5 brutal-btn bg-paper-light dark:bg-paper-darkcard text-ink-950 dark:text-ink-50 hover:bg-paper-muted dark:hover:bg-ink-800"
              title="Start a new document session"
            >
              <span className="hidden sm:inline">+ New Session</span>
              <span className="sm:hidden">+ New</span>
            </button>
          </>
        )}

        {user ? (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setHistoryDrawerOpen(true)}
              className="text-[11px] sm:text-xs font-mono uppercase px-2 sm:px-3 py-1 sm:py-1.5 border border-ink-950 dark:border-ink-700 bg-paper-light dark:bg-paper-darkcard text-ink-950 dark:text-ink-50 hover:bg-ink-950 hover:text-paper-light dark:hover:bg-ink-100 dark:hover:text-ink-950 transition-colors"
            >
              <span className="hidden sm:inline">Saved History</span>
              <span className="sm:hidden">History</span>
            </button>
            <div className="text-[10px] sm:text-xs font-mono font-bold px-1.5 sm:px-2 py-1 bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950">
              {user.name.split(' ')[0].toUpperCase()}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAuthModalOpen(true)}
            className="text-[11px] sm:text-xs font-mono uppercase px-2.5 sm:px-3 py-1 sm:py-1.5 brutal-btn bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950 hover:bg-ink-850 dark:hover:bg-ink-200 shrink-0"
          >
            Sign In
          </button>
        )}
      </div>
    </header>
  );
};
