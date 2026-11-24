/* Pure source helpers, safe to use from client components.

   A hackathon's source is compiled once from explicit feed provenance or,
   when that is absent, the import URL. It is stored on hackathons.source,
   never re-derived on reads, and remains admin-editable. */
export type HackathonSource =
  | "devpost"
  | "mlh"
  | "luma"
  | "cerebral_valley"
  | "hackclub"
  | "organizer_site"
  | "manual"
  | "other";

export type HackathonSourceBadge = {
  label: string;
  type: HackathonSource;
};

// A hackathon is only labelled "User entered" when it originated in the public
// submission form and a reviewer approved it. Imported URLs never use this.
export const COMMUNITY_FORM_SOURCE_URL = "https://haethon.local/submissions/community-form";

/* Dropdown order for the admin edit dialog. */
export const HACKATHON_SOURCES = ["mlh", "luma", "cerebral_valley", "devpost", "hackclub", "organizer_site", "manual", "other"] as const;

const SOURCE_HOST_HINTS: Array<{ hint: string; source: HackathonSource }> = [
  { hint: "mlh.com", source: "mlh" },
  { hint: "mlh.io", source: "mlh" },
  { hint: "majorleaguehacking.com", source: "mlh" },
  { hint: "lu.ma", source: "luma" },
  { hint: "luma.com", source: "luma" },
  { hint: "cerebralvalley.ai", source: "cerebral_valley" },
  { hint: "devpost.com", source: "devpost" },
  { hint: "hackclub.com", source: "hackclub" },
];

const SOURCE_LABELS: Record<HackathonSource, string> = {
  mlh: "MLH",
  luma: "Luma",
  cerebral_valley: "Cerebral Valley",
  devpost: "Devpost",
  hackclub: "Hack Club",
  organizer_site: "Organizer",
  manual: "User entered",
  other: "Other",
};

export function sourceBadge(type: HackathonSource): HackathonSourceBadge {
  return { type, label: SOURCE_LABELS[type] };
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * MLH, Luma, Cerebral Valley, Devpost, and Hack Club are recognized by host. Only the
 * community-form URL resolves to `manual`; other sites become `other`. Runs
 * once when a hackathon is created from an import or approved submission —
 * never on reads.
 */
export function deriveSourceType(...urls: Array<string | null | undefined>): HackathonSource {
  for (const url of urls) {
    if (!url) {
      continue;
    }

    if (url === COMMUNITY_FORM_SOURCE_URL) {
      return "manual";
    }

    const host = sourceHost(url);
    if (!host) {
      continue;
    }

    const match = SOURCE_HOST_HINTS.find(({ hint }) => host === hint || host.endsWith(`.${hint}`));
    if (match) {
      return match.source;
    }
  }

  return "other";
}

/** Explicit feed provenance wins over URLs owned by a downstream host. */
export function compileSourceType(
  source: HackathonSource | null | undefined,
  ...urls: Array<string | null | undefined>
): HackathonSource {
  return source ?? deriveSourceType(...urls);
}
