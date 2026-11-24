"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { getResolvedTheme, setTheme, subscribeToTheme, type Theme } from "@/lib/theme";

/* The server can't know the theme (it may come from the OS), so it renders
   null and the label settles after hydration. */
function getServerTheme(): Theme | null {
  return null;
}

/* Sun/moon button for the app top nav. The icon is picked by CSS (the `dark:`
   variant), not by React state, so it is already right on first paint and
   never mismatches during hydration. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeToTheme, getResolvedTheme, getServerTheme);
  const label =
    theme === "dark" ? "Switch to light mode" : theme === "light" ? "Switch to dark mode" : "Toggle dark mode";

  return (
    <button
      aria-label={label}
      className={className}
      onClick={() => setTheme(getResolvedTheme() === "dark" ? "light" : "dark")}
      title={label}
      type="button"
    >
      <Moon aria-hidden="true" className="size-[18px] dark:hidden" strokeWidth={2.2} />
      <Sun aria-hidden="true" className="hidden size-[18px] dark:block" strokeWidth={2.2} />
    </button>
  );
}
