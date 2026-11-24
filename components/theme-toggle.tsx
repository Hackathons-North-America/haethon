"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { getResolvedTheme, setTheme, subscribeToTheme, type Theme } from "@/lib/theme";

/* The server can't know the theme (it may come from the OS), so it renders
   null and the label settles after hydration. */
function getServerTheme(): Theme | null {
  return null;
}

/* The "Switch to dark/light mode" row in the app top nav's ☰ menu. The icon is
   picked by CSS (the `dark:` variant), not by React state, so it is right on
   first paint; the label needs the resolved theme, which the menu (only
   rendered once opened, after hydration) always has. Clicking leaves the menu
   open so the change is visible in place. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeToTheme, getResolvedTheme, getServerTheme);
  const label =
    theme === "dark" ? "Switch to light mode" : theme === "light" ? "Switch to dark mode" : "Toggle dark mode";

  return (
    <button
      className={className}
      onClick={() => setTheme(getResolvedTheme() === "dark" ? "light" : "dark")}
      type="button"
    >
      <Moon aria-hidden="true" className="size-4 shrink-0 dark:hidden" />
      <Sun aria-hidden="true" className="hidden size-4 shrink-0 dark:block" />
      {label}
    </button>
  );
}
