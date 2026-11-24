import { parseAppRole, type AppRole } from "@/lib/auth-role";

/* The app shell and the /hackathons page are static, so nothing on the server
   tells a hard-loaded page who is looking at it; Clerk answers a few hundred
   milliseconds later, once its script has loaded. This is the visitor's last
   known sign-in state, kept in localStorage so the UI can start from a good
   guess instead of flipping when Clerk settles.

   It is only a hint: it holds no credential, and it only ever picks which
   links to show or whether to ask the server for the viewer's card state
   early. Clerk's answer replaces it as soon as it arrives, and every protected
   route and API still checks the real session. */

export type AuthHint = { isSignedIn: boolean; role: AppRole };

export const AUTH_HINT_STORAGE_KEY = "hna:auth-hint";

export function serializeAuthHint(hint: AuthHint) {
  return hint.isSignedIn ? `in:${hint.role}` : "out";
}

export function parseAuthHint(value: string | null | undefined): AuthHint | null {
  if (value === "out") {
    return { isSignedIn: false, role: "user" };
  }

  if (value?.startsWith("in:")) {
    return { isSignedIn: true, role: parseAppRole(value.slice(3)) };
  }

  return null;
}

/* Storage can be unavailable (private mode, blocked cookies). The hint is an
   optimization, so every failure just means "no hint". */
export function readStoredAuthHint(): string | null {
  try {
    return window.localStorage.getItem(AUTH_HINT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredAuthHint(hint: AuthHint) {
  try {
    const value = serializeAuthHint(hint);

    if (window.localStorage.getItem(AUTH_HINT_STORAGE_KEY) !== value) {
      window.localStorage.setItem(AUTH_HINT_STORAGE_KEY, value);
    }
  } catch {
    // Nothing to do without storage.
  }
}

/* Another tab signing in or out changes the hint under this one. */
export function subscribeToStoredAuthHint(onChange: () => void) {
  function handle(event: StorageEvent) {
    if (event.key === null || event.key === AUTH_HINT_STORAGE_KEY) {
      onChange();
    }
  }

  window.addEventListener("storage", handle);
  return () => window.removeEventListener("storage", handle);
}
