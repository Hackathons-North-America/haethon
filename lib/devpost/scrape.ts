import { fetch } from "undici";

// Fetching and parsing for Devpost public pages (profile + project). Devpost
// has no API, so this reads the same HTML a visitor sees. Parsers are
// regex-based and deliberately tolerant: every field is best-effort except the
// project slug list and the "Submitted to" entries, which the import depends on.

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 3_000_000;
const MAX_REDIRECTS = 3;

/** Handles are validated by lib/validations/social before ever reaching a URL. */
export const DEVPOST_HANDLE_PATTERN = /^[A-Za-z0-9_-]{1,60}$/;
const PROJECT_SLUG_PATTERN = /^[a-z0-9_-]{1,120}$/i;

export class DevpostFetchError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "DevpostFetchError";
  }
}

function assertDevpostUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();

  if (url.protocol !== "https:" || (host !== "devpost.com" && !host.endsWith(".devpost.com"))) {
    throw new DevpostFetchError("Only devpost.com pages can be fetched.");
  }

  return url;
}

/**
 * Fetches a Devpost page as text. Every URL is built server-side from a
 * validated handle or slug, and redirects are only followed within
 * devpost.com, so this never becomes an open fetch proxy.
 */
export async function fetchDevpostHtml(rawUrl: string): Promise<string> {
  let url = assertDevpostUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HaethonBot/1.0; +https://haethon.com)" },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new DevpostFetchError("Devpost returned too many redirects.", response.status);
      }

      await response.body?.cancel();
      url = assertDevpostUrl(new URL(location, url).toString());
      continue;
    }

    if (response.status === 404) {
      throw new DevpostFetchError("That Devpost page does not exist.", 404);
    }

    if (!response.ok || !response.body) {
      throw new DevpostFetchError(`Devpost responded with status ${response.status}.`, response.status);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;
      bytes += value.byteLength;

      if (bytes > MAX_HTML_BYTES) {
        await reader.cancel();
        throw new DevpostFetchError("Devpost page is unexpectedly large.");
      }

      html += decoder.decode(value, { stream: true });
    }

    return html + decoder.decode();
  }

  throw new DevpostFetchError("Devpost returned too many redirects.");
}

export function devpostProfileUrl(handle: string, page?: number) {
  if (!DEVPOST_HANDLE_PATTERN.test(handle)) {
    throw new DevpostFetchError("Invalid Devpost handle.");
  }

  return `https://devpost.com/${handle}${page && page > 1 ? `?page=${page}` : ""}`;
}

export function devpostProjectUrl(slug: string) {
  if (!PROJECT_SLUG_PATTERN.test(slug)) {
    throw new DevpostFetchError("Invalid Devpost project slug.");
  }

  return `https://devpost.com/software/${slug}`;
}

function decodeEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—");
}

function textContent(htmlFragment: string) {
  return decodeEntities(htmlFragment.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export type DevpostProfile = {
  displayName: string | null;
  /** Plain text of the bio paragraph only — the ownership code must appear here. */
  bio: string | null;
  projectRefs: { slug: string; title: string | null }[];
  hasNextPage: boolean;
};

export function parseDevpostProfile(html: string): DevpostProfile {
  const nameMatch = html.match(/<h1 id="portfolio-user-name">\s*([^<]+)/);
  const bioMatch = html.match(/<p[^>]*id="portfolio-user-bio"[^>]*>([\s\S]*?)<\/p>/);

  const projectRefs: DevpostProfile["projectRefs"] = [];
  const seen = new Set<string>();
  const anchorPattern =
    /<a[^>]*class="[^"]*link-to-software[^"]*"[^>]*href="https:\/\/devpost\.com\/software\/([A-Za-z0-9_-]+)"[^>]*>([\s\S]*?)<\/a>/g;

  for (const match of html.matchAll(anchorPattern)) {
    const slug = match[1];

    if (seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    const titleMatch = match[2].match(/<h5>\s*([\s\S]*?)\s*<\/h5>/);
    projectRefs.push({ slug, title: titleMatch ? textContent(titleMatch[1]) || null : null });
  }

  return {
    displayName: nameMatch ? textContent(nameMatch[1]) || null : null,
    bio: bioMatch ? textContent(bioMatch[1]) || null : null,
    projectRefs,
    hasNextPage: /<a[^>]*rel="next"[^>]*>/.test(html),
  };
}

export type DevpostProjectSubmission = {
  hackathonName: string;
  /** The hackathon's Devpost site, e.g. https://some-event.devpost.com/ */
  hackathonUrl: string | null;
  /** Prize labels, e.g. "Dinner In on Devpost"; non-empty means the project won there. */
  awards: string[];
};

export type DevpostProject = {
  slug: string;
  title: string | null;
  tagline: string | null;
  /** Earliest activity timestamp on the page — a close proxy for the event date. */
  submittedAt: Date | null;
  /** "Try it out" URLs (repo, demo). */
  links: string[];
  submissions: DevpostProjectSubmission[];
};

function parseSubmissions(html: string): DevpostProjectSubmission[] {
  const sectionStart = html.indexOf('id="submissions"');

  if (sectionStart === -1) {
    return [];
  }

  const sectionEnd = html.indexOf('id="app-team"', sectionStart);
  const section = html.slice(sectionStart, sectionEnd === -1 ? sectionStart + 20_000 : sectionEnd);
  const submissions: DevpostProjectSubmission[] = [];
  const contentPattern = /<div class="software-list-content">([\s\S]*?)(?=<div class="software-list-content">|$)/g;

  for (const match of section.matchAll(contentPattern)) {
    const block = match[1];
    const linkMatch = block.match(/<a href="(https?:\/\/[^"]+)">([\s\S]*?)<\/a>/);

    if (!linkMatch) {
      continue;
    }

    const awards: string[] = [];
    const awardPattern = /<span class="winner label[^"]*">([\s\S]*?)<\/span>([\s\S]*?)<\/li>/g;

    for (const awardMatch of block.matchAll(awardPattern)) {
      const label = textContent(awardMatch[1]);
      const detail = textContent(awardMatch[2]);
      awards.push(detail || label || "Winner");
    }

    const hackathonName = textContent(linkMatch[2]);

    if (hackathonName) {
      submissions.push({
        hackathonName,
        hackathonUrl: decodeEntities(linkMatch[1]),
        awards,
      });
    }
  }

  return submissions;
}

export function parseDevpostProject(slug: string, html: string): DevpostProject {
  const titleMatch = html.match(/<h1 id="app-title"[^>]*>\s*([\s\S]*?)\s*<\/h1>/);
  // The tagline is the first "large" paragraph right after the title.
  const taglineMatch = html
    .slice(titleMatch ? html.indexOf(titleMatch[0]) : 0, titleMatch ? html.indexOf(titleMatch[0]) + 2_000 : 2_000)
    .match(/<p class="large">\s*([\s\S]*?)\s*<\/p>/);

  let submittedAt: Date | null = null;

  for (const timeMatch of html.matchAll(/<time[^>]*datetime="([^"]+)"/g)) {
    const parsed = new Date(timeMatch[1]);

    if (!Number.isNaN(parsed.getTime()) && (!submittedAt || parsed < submittedAt)) {
      submittedAt = parsed;
    }
  }

  const links: string[] = [];
  const linksSection = html.match(/data-role="software-urls"[\s\S]*?<\/ul>/);

  if (linksSection) {
    for (const linkMatch of linksSection[0].matchAll(/href="(https?:\/\/[^"]+)"/g)) {
      const url = decodeEntities(linkMatch[1]);

      if (!links.includes(url)) {
        links.push(url);
      }
    }
  }

  return {
    slug,
    title: titleMatch ? textContent(titleMatch[1]) || null : null,
    tagline: taglineMatch ? textContent(taglineMatch[1]) || null : null,
    submittedAt,
    links,
    submissions: parseSubmissions(html),
  };
}
