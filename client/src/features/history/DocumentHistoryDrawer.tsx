import React from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';

export const DocumentHistoryDrawer: React.FC = () => {
  const { isHistoryDrawerOpen, setHistoryDrawerOpen, user, setUser, resetSession } = useWorkspaceStore();

  if (!isHistoryDrawerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-ink-950/60 dark:bg-black/80 backdrop-blur-sm flex justify-end">
      <div className="bg-paper-light dark:bg-paper-darkcard border-l-2 border-ink-950 dark:border-ink-700 w-full max-w-sm sm:max-w-md h-full p-4 sm:p-6 font-mono text-ink-950 dark:text-ink-50 flex flex-col justify-between shadow-2xl transition-colors duration-150 overflow-y-auto">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between border-b-2 border-ink-950 dark:border-ink-800 pb-3 sm:pb-4 mb-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-ink-500 dark:text-ink-400">
                User Space
              </span>
              <h3 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-ink-950 dark:text-ink-50">
                Document History
              </h3>
            </div>
            <button
              onClick={() => setHistoryDrawerOpen(false)}
              className="p-1 text-ink-600 dark:text-ink-400 hover:text-ink-950 dark:hover:text-ink-100 text-base font-bold"
              aria-label="Close history drawer"
            >
              ✕
            </button>
          </div>

          {/* User profile details */}
          {user && (
            <div className="p-3 bg-paper-warm dark:bg-paper-dark border border-ink-950 dark:border-ink-700 text-xs mb-4 sm:mb-6 space-y-1">
              <div className="font-bold text-ink-950 dark:text-ink-100">{user.name}</div>
              <div className="text-ink-600 dark:text-ink-400 text-[11px] break-words-anywhere">{user.email}</div>
            </div>
          )}

          {/* History List placeholder / session archive */}
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-700 dark:text-ink-300">
              Active & Saved Sessions
            </span>
            <div className="p-3.5 sm:p-4 bg-paper-warm dark:bg-paper-dark border border-dashed border-ink-400 dark:border-ink-600 text-xs text-center text-ink-600 dark:text-ink-400 space-y-2">
              <p>Your authenticated documents and persistent analyses will be stored here.</p>
              <div className="text-[10px] text-ink-500 dark:text-ink-400">
                Documents are automatically indexed and encrypted in MongoDB storage.
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="pt-4 border-t border-ink-300 dark:border-ink-800 space-y-2 mt-6">
          <button
            onClick={() => {
              setUser(null, null);
              setHistoryDrawerOpen(false);
              resetSession();
            }}
            className="w-full py-2.5 border border-ink-950 dark:border-ink-600 bg-paper-warm dark:bg-paper-dark hover:bg-ink-950 hover:text-paper-light dark:hover:bg-ink-100 dark:hover:text-ink-950 text-xs uppercase font-bold transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
