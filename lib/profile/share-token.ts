import { randomBytes } from "node:crypto";

/**
 * The share link is a capability URL: anyone holding it can read the profile,
 * so the token has to be unguessable rather than merely unique. 32 random
 * bytes (256 bits) from the CSPRNG makes enumeration infeasible, which is what
 * lets the page stay open to signed-out visitors without an extra gate.
 *
 * base64url keeps it URL-safe with no escaping (43 chars, no padding).
 */
export const SHARE_TOKEN_BYTES = 32;

/** 43 base64url characters — the exact output shape of randomBytes(32). */
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createProfileShareToken() {
  return randomBytes(SHARE_TOKEN_BYTES).toString("base64url");
}

/**
 * Cheap shape check run before any database lookup, so junk paths (`/p/admin`,
 * scanner noise, oversized strings) never reach Postgres.
 */
export function isProfileShareToken(value: string): boolean {
  return SHARE_TOKEN_PATTERN.test(value);
}

export function profileShareUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/p/${token}`;
}
