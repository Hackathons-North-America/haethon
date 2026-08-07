/**
 * The Icon Face Off roster. Unlike the hackathon arena — whose pool is the live
 * catalog — every icon here is a hand-made trading card, so the roster lives in
 * code alongside the artwork it ships with. The database only stores ballots.
 */

/* Drives which backdrop treatment renders behind a card. Adding an icon means
   picking an existing vibe or adding one to ICON_VIBES in the card component. */
export type TechIconVibe = "prism" | "cobalt";

export type TechIcon = {
  slug: string;
  name: string;
  /* The card's small kicker line — "Mars daddy", "Sugar daddy". */
  kicker: string;
  title: string;
  investorRank: number;
  /* 720x1280 card art, served from /public. */
  card: string;
  vibe: TechIconVibe;
  /* Signature color for the glow, bars, and result readouts around the card. */
  accent: string;
};

export const TECH_ICONS: readonly TechIcon[] = [
  {
    slug: "elon-musk",
    name: "Elon Musk",
    kicker: "Mars daddy",
    title: "CEO of Tesla & SpaceX",
    investorRank: 1,
    card: "/faceoff/elon-musk.png",
    vibe: "prism",
    accent: "#d8a63c",
  },
  {
    slug: "vinod-khosla",
    name: "Vinod Khosla",
    kicker: "Sugar daddy",
    title: "Founder of Khosla Ventures",
    investorRank: 74,
    card: "/faceoff/vinod-khosla.png",
    vibe: "cobalt",
    accent: "#6f8dff",
  },
];

const ICONS_BY_SLUG = new Map(TECH_ICONS.map((icon) => [icon.slug, icon]));

export function findTechIcon(slug: string): TechIcon | null {
  return ICONS_BY_SLUG.get(slug) ?? null;
}

/**
 * Stable identifier for a pairing regardless of which side won, so "one ballot
 * per matchup per voter" is a single unique index rather than two ordered rows.
 */
export function matchupKey(slugA: string, slugB: string): string {
  return [slugA, slugB].sort().join("|");
}
