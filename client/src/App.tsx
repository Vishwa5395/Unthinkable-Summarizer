import React, { useEffect } from 'react';
import { useWorkspaceStore } from './store/workspaceStore';
import { Header } from './components/common/Header';
import { HeroUpload } from './features/upload/HeroUpload';
import { HowItWorks } from './features/upload/HowItWorks';
import { Workspace } from './features/workspace/Workspace';
import { AuthModal } from './features/auth/AuthModal';
import { DocumentHistoryDrawer } from './features/history/DocumentHistoryDrawer';
import { api } from './lib/api';

export const App: React.FC = () => {
  const { documents, setUser } = useWorkspaceStore();

  useEffect(() => {
    // Check initial user authentication state
    api
      .getMe()
      .then((res) => {
        if (res.authenticated && res.user) {
          setUser(res.user);
        }
      })
      .catch(() => {});
  }, [setUser]);

  const hasActiveDocuments = documents.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-paper-warm dark:bg-paper-dark text-ink-950 dark:text-ink-50 font-sans transition-colors duration-150 w-full max-w-full overflow-x-hidden">
      {/* Top Header */}
      <Header />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col w-full max-w-full overflow-x-hidden">
        {hasActiveDocuments ? (
          <Workspace />
        ) : (
          <>
            {/* Tool-first Hero (Above the fold) */}
            <HeroUpload />

            {/* Below-the-fold Story & Features */}
            <HowItWorks />

            {/* Editorial Footer */}
            <footer className="w-full border-t-2 border-ink-950 dark:border-ink-800 py-6 sm:py-8 bg-paper-light dark:bg-paper-darkcard mt-12 sm:mt-16 text-center font-mono text-xs text-ink-600 dark:text-ink-400 transition-colors duration-150">
              <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
                <div className="text-center sm:text-left">
                  <span className="font-bold text-ink-950 dark:text-ink-100 uppercase">UNTHINKABLE SUMMARIZER</span> — Multimodal Document Comprehension
                </div>
                <div className="text-[10px] sm:text-[11px] text-ink-500 dark:text-ink-400">
                  Built with React · Node.js · TypeScript · Tesseract OCR
                </div>
              </div>
            </footer>
          </>
        )}
      </main>

      {/* Modals & Drawers */}
      <AuthModal />
      <DocumentHistoryDrawer />
    </div>
  );
};
