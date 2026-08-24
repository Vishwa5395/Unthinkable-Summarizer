import React from "react";
import { useThemeStore, Theme } from "../../store/themeStore";

export const ThemeSwitcher: React.FC = () => {
  const { theme, setTheme } = useThemeStore();

  const options: Array<{
    value: Theme;
    label: string;
    symbol: string;
    title: string;
  }> = [
    { value: "light", label: "Light", symbol: "☀", title: "Light mode" },
    { value: "dark", label: "Dark", symbol: "", title: "Dark mode" },
    { value: "system", label: "Auto", symbol: "", title: "System preference" },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Color theme switcher"
      className="flex items-center border border-ink-950 dark:border-ink-700 bg-paper-light dark:bg-paper-darkcard p-0.5 font-mono text-xs shrink-0"
    >
      {options.map((opt) => {
        const isSelected = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            title={opt.title}
            onClick={() => setTheme(opt.value)}
            className={`px-1.5 sm:px-2 py-1 flex items-center gap-1 transition-all focus:outline-none focus:ring-1 focus:ring-ink-950 dark:focus:ring-ink-100 ${
              isSelected
                ? "bg-ink-950 text-paper-light dark:bg-ink-100 dark:text-ink-950 font-bold shadow-xs"
                : "text-ink-700 dark:text-ink-300 hover:text-ink-950 dark:hover:text-paper-light hover:bg-paper-muted dark:hover:bg-ink-800"
            }`}
          >
            <span className="text-[12px] leading-none">{opt.symbol}</span>
            <span className="hidden md:inline text-[10px] uppercase tracking-wider">
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
