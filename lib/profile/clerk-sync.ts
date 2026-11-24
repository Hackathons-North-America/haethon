import type { SelectUser } from "@/lib/db/schema";

/** The Clerk-owned columns syncCurrentUser() mirrors onto the users row. */
export type SyncedProfile = Pick<SelectUser, "email" | "firstName" | "lastName" | "imageUrl" | "role">;

const syncedProfileKeys = ["email", "firstName", "lastName", "imageUrl", "role"] as const;

/**
 * Whether the Clerk profile differs from what the users row already holds.
 * The account page re-syncs on every visit and almost always finds nothing to
 * write; this is what lets it skip the UPDATE. null and undefined both mean
 * "not set", so a missing Clerk name never counts as a change against NULL.
 */
export function syncedProfileChanged(current: SyncedProfile, next: SyncedProfile) {
  return syncedProfileKeys.some((key) => (current[key] ?? null) !== (next[key] ?? null));
}
