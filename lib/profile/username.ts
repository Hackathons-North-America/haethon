export const PROFILE_USERNAME_MAX_LENGTH = 48;

const PROFILE_USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,46}[a-z0-9])?$/;

export function normalizeProfileUsername(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, PROFILE_USERNAME_MAX_LENGTH)
    .replace(/[-_]+$/g, "");
}

/**
 * Prefer Clerk's instance-unique username. Accounts without one receive a
 * readable email-based fallback plus a deterministic collision suffix.
 *
 * This value is only written on insert, so changing a Clerk username, email,
 * or display name later never changes an existing public profile URL.
 */
export function createPermanentProfileUsername({
  clerkUsername,
  email,
  clerkUserId,
}: {
  clerkUsername: string | null;
  email: string;
  clerkUserId: string;
}) {
  const preferred = normalizeProfileUsername(clerkUsername ?? "");

  if (preferred) {
    return preferred;
  }

  const base = normalizeProfileUsername(email.split("@")[0] ?? "") || "hacker";
  const suffix = normalizeProfileUsername(clerkUserId).slice(-24) || "account";
  const maxBaseLength = PROFILE_USERNAME_MAX_LENGTH - suffix.length - 1;

  return `${base.slice(0, maxBaseLength).replace(/[-_]+$/g, "") || "hacker"}-${suffix}`;
}

export function isProfileUsername(value: string) {
  return PROFILE_USERNAME_PATTERN.test(value);
}

export function profileShareUrl(origin: string, username: string) {
  return `${origin.replace(/\/$/, "")}/p/${username}`;
}
