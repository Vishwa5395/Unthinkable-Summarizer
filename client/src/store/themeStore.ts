import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('unthinkable_theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {}
  return 'system';
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function applyTheme(theme: Theme): 'light' | 'dark' {
  const isDark = theme === 'dark' || (theme === 'system' && getSystemTheme() === 'dark');
  if (typeof document !== 'undefined') {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
  return isDark ? 'dark' : 'light';
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initialTheme = getInitialTheme();
  const initialResolved = applyTheme(initialTheme);

  // Setup system theme media query listener
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      const current = get().theme;
      if (current === 'system') {
        const resolved = applyTheme('system');
        set({ resolvedTheme: resolved });
      }
    });
  }

  return {
    theme: initialTheme,
    resolvedTheme: initialResolved,
    setTheme: (newTheme: Theme) => {
      try {
        localStorage.setItem('unthinkable_theme', newTheme);
      } catch {}
      const resolved = applyTheme(newTheme);
      set({ theme: newTheme, resolvedTheme: resolved });
    },
  };
});
