'use client';

import React from 'react';
import { useTheme } from '@/lib/themeContext';
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
  className?: string;
  variant?: 'icon' | 'pill';
  showLabel?: boolean;
}

export function ThemeToggle({
  className = '',
  variant = 'icon',
  showLabel = false,
}: ThemeToggleProps) {
  const { theme, toggleTheme, mounted } = useTheme();

  // Render a placeholder with the same layout while not mounted to prevent layout shift
  if (!mounted) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-xl border border-slate-700/50 bg-slate-800/40 opacity-70 ${
          variant === 'pill' ? 'px-3 py-1.5 gap-2' : 'h-8 w-8'
        } ${className}`}
        aria-hidden="true"
      >
        <div className="h-4 w-4 rounded-full bg-slate-600/40 animate-pulse" />
      </div>
    );
  }

  const isDark = theme === 'dark';

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className={`group relative inline-flex items-center gap-2.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all duration-300 outline-none backdrop-blur-md ${
          isDark
            ? 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700 hover:bg-slate-800/80 hover:text-white shadow-sm'
            : 'border-slate-200 bg-white/90 text-slate-700 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 shadow-sm'
        } ${className}`}
      >
        <div className="relative flex h-4 w-4 items-center justify-center">
          <Moon
            className={`h-4 w-4 text-indigo-400 transition-all duration-300 ${
              isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0 absolute'
            }`}
          />
          <Sun
            className={`h-4 w-4 text-amber-500 transition-all duration-300 ${
              !isDark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0 absolute'
            }`}
          />
        </div>
        <span className="font-semibold tracking-tight">
          {isDark ? 'Dark' : 'Light'}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`group relative flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-300 outline-none backdrop-blur-md active:scale-95 ${
        isDark
          ? 'border-slate-800 bg-slate-900/80 text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-amber-400 shadow-sm hover:shadow-indigo-500/10'
          : 'border-slate-200 bg-white/90 text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-indigo-600 shadow-sm hover:shadow-amber-500/10'
      } ${className}`}
    >
      <div className="relative flex h-4 w-4 items-center justify-center">
        <Moon
          className={`h-4 w-4 text-indigo-400 transition-all duration-300 group-hover:text-indigo-300 ${
            isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0 absolute'
          }`}
        />
        <Sun
          className={`h-4 w-4 text-amber-500 transition-all duration-300 group-hover:text-amber-600 ${
            !isDark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0 absolute'
          }`}
        />
      </div>
      {showLabel && (
        <span className="sr-only">
          {isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        </span>
      )}
    </button>
  );
}
