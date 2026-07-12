import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

/* Unsubscribe links are signed so the bare URL in an email can flip the
   opt-out flag without a session, while nobody can forge a link for another
   user. A dedicated secret is preferred; CRON_SECRET (required) is the
   fallback so links always work. */
function signingSecret() {
  return env.EMAIL_UNSUBSCRIBE_SECRET ?? env.CRON_SECRET;
}

function signUserId(userId: string) {
  return createHmac("sha256", signingSecret()).update(userId).digest("base64url");
}

function buildUnsubscribeToken(userId: string) {
  return `${Buffer.from(userId, "utf8").toString("base64url")}.${signUserId(userId)}`;
}

/** Returns the userId the token was issued for, or null if invalid. */
export function verifyUnsubscribeToken(token: string): string | null {
  const [encodedUserId, signature] = token.split(".");

  if (!encodedUserId || !signature) {
    return null;
  }

  let userId: string;
  try {
    userId = Buffer.from(encodedUserId, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = Buffer.from(signUserId(userId), "utf8");
  const provided = Buffer.from(signature, "utf8");

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  return userId;
}

export function buildUnsubscribeUrl(userId: string) {
  return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?token=${buildUnsubscribeToken(userId)}`;
}

/**
 * Standard one-click unsubscribe headers (RFC 8058). Gmail/Yahoo require
 * these for bulk senders; they also power the native "Unsubscribe" button.
 */
export function unsubscribeHeaders(userId: string) {
  return {
    "List-Unsubscribe": `<${buildUnsubscribeUrl(userId)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
