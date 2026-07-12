// Platform-aware parsing for social profile links, shared by the profile
// form (instant feedback) and the profile API route (enforcement).
//
// Users type just their handle — the form shows a fixed "linkedin.com/in/"
// style prefix — but pasted full URLs are accepted too: the handle is
// extracted, the domain is checked against the platform, and a canonical
// https URL is rebuilt for storage. Wrong-domain links and malformed
// handles are rejected instead of stored.

export type SocialPlatformKey =
  | "linkedinUrl"
  | "githubUrl"
  | "instagramUrl"
  | "xUrl"
  | "devpostUrl";

type SocialPlatform = {
  label: string;
  /** Fixed prefix shown before the handle input, e.g. "linkedin.com/in/". */
  prefix: string;
  /** Hostnames accepted when a full URL is pasted (subdomains included). */
  hosts: string[];
  /** Path segment that precedes the handle on this platform, if any. */
  pathPrefix?: string;
  handlePattern: RegExp;
  /** Human description of the allowed handle shape, used in error copy. */
  handleHint: string;
  canonicalUrl: (handle: string) => string;
};

export const SOCIAL_PLATFORMS: Record<SocialPlatformKey, SocialPlatform> = {
  linkedinUrl: {
    label: "LinkedIn",
    prefix: "linkedin.com/in/",
    hosts: ["linkedin.com"],
    pathPrefix: "in",
    handlePattern: /^[A-Za-z0-9-]{3,100}$/,
    handleHint: "3-100 letters, numbers, or dashes",
    canonicalUrl: (handle) => `https://www.linkedin.com/in/${handle}`,
  },
  githubUrl: {
    label: "GitHub",
    prefix: "github.com/",
    hosts: ["github.com"],
    handlePattern: /^[A-Za-z0-9](?:-?[A-Za-z0-9]){0,38}$/,
    handleHint: "up to 39 letters, numbers, or single dashes",
    canonicalUrl: (handle) => `https://github.com/${handle}`,
  },
  instagramUrl: {
    label: "Instagram",
    prefix: "instagram.com/",
    hosts: ["instagram.com", "instagr.am"],
    handlePattern: /^[A-Za-z0-9._]{1,30}$/,
    handleHint: "up to 30 letters, numbers, dots, or underscores",
    canonicalUrl: (handle) => `https://www.instagram.com/${handle}`,
  },
  xUrl: {
    label: "X",
    prefix: "x.com/",
    hosts: ["x.com", "twitter.com"],
    handlePattern: /^[A-Za-z0-9_]{1,15}$/,
    handleHint: "up to 15 letters, numbers, or underscores",
    canonicalUrl: (handle) => `https://x.com/${handle}`,
  },
  devpostUrl: {
    label: "Devpost",
    prefix: "devpost.com/",
    hosts: ["devpost.com"],
    handlePattern: /^[A-Za-z0-9_-]{1,60}$/,
    handleHint: "up to 60 letters, numbers, dashes, or underscores",
    canonicalUrl: (handle) => `https://devpost.com/${handle}`,
  },
};

export type SocialParseResult =
  | { ok: true; handle: string; url: string }
  | { ok: false; error: string };

function hostMatches(hostname: string, allowed: string[]) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return allowed.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function safeDecode(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Accepts a bare handle ("jane-doe", "@jane-doe") or a full/partial profile
 * URL ("www.linkedin.com/in/jane-doe"), and returns the validated handle
 * plus the canonical https URL to store.
 */
export function parseSocialInput(key: SocialPlatformKey, raw: string): SocialParseResult {
  const platform = SOCIAL_PLATFORMS[key];
  let value = raw.trim().replace(/^@+/, "");

  if (!value) {
    return { ok: false, error: `Enter your ${platform.label} handle.` };
  }

  const looksLikeUrl =
    value.includes("://") || value.includes("/") || value.toLowerCase().startsWith("www.");

  if (looksLikeUrl) {
    const withProtocol = value.includes("://") ? value : `https://${value}`;
    let url: URL;

    try {
      url = new URL(withProtocol);
    } catch {
      return { ok: false, error: `That doesn't look like a valid ${platform.label} link.` };
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { ok: false, error: `${platform.label} links must start with https://.` };
    }

    if (!hostMatches(url.hostname, platform.hosts)) {
      return {
        ok: false,
        error: `That link isn't a ${platform.label} profile — it should look like ${platform.prefix}your-handle.`,
      };
    }

    const segments = url.pathname.split("/").filter(Boolean).map(safeDecode);

    if (platform.pathPrefix) {
      if (segments[0]?.toLowerCase() !== platform.pathPrefix || !segments[1]) {
        return {
          ok: false,
          error: `Link your profile page, like ${platform.prefix}your-handle.`,
        };
      }

      value = segments[1];
    } else {
      if (!segments[0]) {
        return {
          ok: false,
          error: `Link your profile page, like ${platform.prefix}your-handle.`,
        };
      }

      value = segments[0];
    }
  }

  if (!platform.handlePattern.test(value)) {
    return {
      ok: false,
      error: `That ${platform.label} handle doesn't look right (${platform.handleHint}).`,
    };
  }

  return { ok: true, handle: value, url: platform.canonicalUrl(value) };
}

/**
 * Validates a personal-site URL. Any domain is allowed, but the protocol
 * must be http(s) — this is what keeps javascript:/data: links out of hrefs.
 * A missing protocol is filled in with https://.
 */
export function parsePortfolioUrl(raw: string): SocialParseResult {
  const value = raw.trim();

  if (!value) {
    return { ok: false, error: "Enter your portfolio URL." };
  }

  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(value);
  const withProtocol = hasProtocol ? value : `https://${value}`;
  let url: URL;

  try {
    url = new URL(withProtocol);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Portfolio links must start with http:// or https://." };
  }

  if (!url.hostname.includes(".")) {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  const normalized = url.toString();

  if (normalized.length > 300) {
    return { ok: false, error: "That URL is too long (300 characters max)." };
  }

  return { ok: true, handle: normalized, url: normalized };
}
