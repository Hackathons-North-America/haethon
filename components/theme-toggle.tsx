"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/providers/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-navy/10 bg-navy/[0.03] text-navy/70 transition-colors hover:bg-navy/[0.06] hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy/30 dark:border-white/10 dark:bg-white/5 dark:text-wheat/70 dark:hover:bg-white/10 dark:hover:text-wheat dark:focus-visible:outline-wheat/40"
    >
      {isDark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
