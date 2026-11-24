/* Role helpers with no server imports, so the client-rendered top nav can
   derive the role from the browser's copy of the session claims. lib/auth.ts
   re-exports them for server code. */

export type AppRole = "user" | "admin" | "organizer" | "sponsor";

export type SessionMetadata = {
  role?: AppRole;
  /* The app's own users.id, mirrored into Clerk publicMetadata so read paths
     can resolve it from the session token without a database query. */
  appUserId?: string;
};

const APP_ROLES = new Set<string>(["user", "admin", "organizer", "sponsor"]);

export function parseAppRole(value: unknown): AppRole {
  return typeof value === "string" && APP_ROLES.has(value) ? (value as AppRole) : "user";
}

/**
 * Derives the app role from already-fetched session claims so callers that
 * hold an auth() result don't need a second auth() call for the role.
 */
export function roleFromSessionClaims(sessionClaims: unknown): AppRole {
  const metadata = (sessionClaims as { metadata?: SessionMetadata } | null | undefined)?.metadata;

  return (metadata?.role ?? "user") as AppRole;
}

export function isAdminRole(role: AppRole) {
  return role === "admin";
}

export function isOrganizerRole(role: AppRole) {
  return role === "admin" || role === "organizer";
}
