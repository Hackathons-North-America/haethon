/* Light/dark theme plumbing shared by the root layout's boot script and the
   ThemeToggle. A visitor who has never clicked the toggle has no `theme`
   cookie, so <html> carries no `data-theme` and the CSS follows their OS
   setting (see app/globals.css). Clicking the toggle stores an explicit
   choice, which then wins over the OS from that point on. */

export type Theme = "light" | "dark";

export const THEME_COOKIE = "theme";

/* One year: the choice should outlive sessions but not be immortal. */
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/* Inlined into <head> so it runs before first paint. Kept dependency-free and
   wrapped in try/catch: a blocked cookie jar must never break the page. */
export const THEME_BOOT_SCRIPT = `try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)(?:;|$)/);if(m)document.documentElement.dataset.theme=m[1]}catch(e){}`;

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function parseTheme(value: string | null | undefined): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

/* The theme actually on screen: the explicit choice if there is one,
   otherwise whatever the OS asks for. */
export function getResolvedTheme(): Theme {
  return parseTheme(document.documentElement.dataset.theme) ?? (window.matchMedia(DARK_QUERY).matches ? "dark" : "light");
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/* Notifies on anything that can change the resolved theme: a toggle click
   (the data-theme attribute) or the OS switching while no choice is saved. */
export function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"], attributes: true });

  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);

  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}
