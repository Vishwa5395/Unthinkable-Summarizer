import React, { useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { api } from '../../lib/api';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, setAuthModalOpen, setUser } = useWorkspaceStore();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isLogin) {
        const res = await api.login(email, password);
        setUser(res.user, res.token);
      } else {
        const res = await api.register(email, password, name);
        setUser(res.user, res.token);
      }
      setIsLoading(false);
      setAuthModalOpen(false);
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || 'Authentication failed. Please check your credentials.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink-950/70 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-paper-light dark:bg-paper-darkcard border-2 border-ink-950 dark:border-ink-700 shadow-brutal-lg dark:shadow-brutal-lg-dark max-w-md w-full p-4 sm:p-6 font-mono text-ink-950 dark:text-ink-50 relative transition-colors duration-150 max-h-[92vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={() => setAuthModalOpen(false)}
          className="absolute top-3 sm:top-4 right-3 sm:right-4 p-1 text-ink-600 dark:text-ink-400 hover:text-ink-950 dark:hover:text-ink-100 text-base font-bold"
          aria-label="Close modal"
        >
          ✕
        </button>

        {/* Header */}
        <div className="mb-4 sm:mb-6 pr-6">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-500 dark:text-ink-400">
            Unthinkable Account
          </span>
          <h3 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-ink-950 dark:text-ink-50 mt-0.5">
            {isLogin ? 'Sign In' : 'Create Account'}
          </h3>
          <p className="text-[11px] sm:text-xs text-ink-600 dark:text-ink-400 mt-1 leading-normal">
            {isLogin
              ? 'Sign in to access persistent history, saved analyses & comparisons.'
              : 'Register to unlock persistent document memory and export collections.'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex border border-ink-950 dark:border-ink-700 bg-paper-warm dark:bg-paper-dark mb-4 p-0.5">
          <button
            type="button"
            onClick={() => {
              setIsLogin(true);
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs uppercase font-bold transition-colors ${
              isLogin
                ? 'bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950'
                : 'text-ink-700 dark:text-ink-300 hover:text-ink-950 dark:hover:text-ink-100'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLogin(false);
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs uppercase font-bold transition-colors ${
              !isLogin
                ? 'bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950'
                : 'text-ink-700 dark:text-ink-300 hover:text-ink-950 dark:hover:text-ink-100'
            }`}
          >
            Register
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-500 text-red-900 dark:text-red-200 text-xs">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {!isLogin && (
            <div>
              <label className="block text-xs uppercase font-bold text-ink-700 dark:text-ink-300 mb-1">
                Your Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Mercer"
                className="w-full px-3 py-2 border border-ink-950 dark:border-ink-700 bg-paper-warm dark:bg-paper-dark text-xs text-ink-950 dark:text-ink-50 focus:outline-none focus:bg-paper-light dark:focus:bg-paper-darkmuted"
              />
            </div>
          )}

          <div>
            <label className="block text-xs uppercase font-bold text-ink-700 dark:text-ink-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@company.com"
              className="w-full px-3 py-2 border border-ink-950 dark:border-ink-700 bg-paper-warm dark:bg-paper-dark text-xs text-ink-950 dark:text-ink-50 focus:outline-none focus:bg-paper-light dark:focus:bg-paper-darkmuted"
            />
          </div>

          <div>
            <label className="block text-xs uppercase font-bold text-ink-700 dark:text-ink-300 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-ink-950 dark:border-ink-700 bg-paper-warm dark:bg-paper-dark text-xs text-ink-950 dark:text-ink-50 focus:outline-none focus:bg-paper-light dark:focus:bg-paper-darkmuted"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 brutal-btn bg-ink-950 dark:bg-ink-100 text-paper-light dark:text-ink-950 hover:bg-ink-800 dark:hover:bg-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
            >
              {isLoading ? 'Authenticating...' : isLogin ? 'Sign In' : 'Create Free Account'}
            </button>
          </div>
        </form>

        <div className="mt-4 text-center text-[11px] text-ink-500 dark:text-ink-400">
          Anonymous document analysis is always free and requires no sign-in.
        </div>
      </div>
    </div>
  );
};
