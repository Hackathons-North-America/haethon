"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useSyncExternalStore } from "react";

import {
  parseAuthHint,
  readStoredAuthHint,
  subscribeToStoredAuthHint,
  writeStoredAuthHint,
} from "@/lib/auth-hint";
import { roleFromSessionClaims, type AppRole } from "@/lib/auth-role";

export type ViewerAuth = {
  /* undefined: Clerk hasn't answered and there is no remembered state. */
  isSignedIn: boolean | undefined;
  /* True once the answer is Clerk's own rather than the remembered hint. */
  isConfirmed: boolean;
  role: AppRole;
};

function getServerAuthHint() {
  return null;
}

/**
 * Who is looking at the page, read in the browser so the pages that use it can
 * be static. Before Clerk has loaded it answers from the last known state
 * (lib/auth-hint.ts); the server render and the hydration pass always see
 * "unknown", so the static HTML is the same for everyone.
 */
export function useViewerAuth(): ViewerAuth {
  const { isLoaded, isSignedIn, sessionClaims } = useAuth();
  const storedHint = useSyncExternalStore(subscribeToStoredAuthHint, readStoredAuthHint, getServerAuthHint);

  if (isLoaded) {
    return {
      isSignedIn: Boolean(isSignedIn),
      isConfirmed: true,
      role: isSignedIn ? roleFromSessionClaims(sessionClaims) : "user",
    };
  }

  const hint = parseAuthHint(storedHint);

  return { isSignedIn: hint?.isSignedIn, isConfirmed: false, role: hint?.role ?? "user" };
}

/** Remembers Clerk's answer for the next hard load. Rendered once, at the root. */
export function AuthHintSync() {
  const { isLoaded, isSignedIn, sessionClaims } = useAuth();
  const role = isSignedIn ? roleFromSessionClaims(sessionClaims) : "user";

  useEffect(() => {
    if (isLoaded) {
      writeStoredAuthHint({ isSignedIn: Boolean(isSignedIn), role });
    }
  }, [isLoaded, isSignedIn, role]);

  return null;
}
