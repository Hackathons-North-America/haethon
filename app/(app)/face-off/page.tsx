import type { Metadata } from "next";

import { FaceoffArena } from "@/components/faceoff-arena";
import { getPublicHackathonCatalogSnapshot } from "@/lib/hackathons/catalog";

export const metadata: Metadata = {
  title: "Face Off | Hackathons North America",
  description:
    "Guess which hackathon ranks higher or lower, chase your high score, and shift the live Elo leaderboard with every pick.",
};

export default async function FaceOffPage({
  searchParams,
}: {
  /* `?hackathon=<slug>` arrives from a card's Face Off action — the first
     matchup is then dealt with that hackathon on the board. An unknown slug
     just falls through to a random pairing. */
  searchParams: Promise<{ hackathon?: string }>;
}) {
  const [{ cards }, params] = await Promise.all([getPublicHackathonCatalogSnapshot(), searchParams]);
  const anchorId = params.hackathon
    ? (cards.find((card) => card.slug === params.hackathon)?.id ?? null)
    : null;

  const pool = cards.map((card) => ({
    id: card.id,
    name: card.name,
    slug: card.slug,
    image: card.image,
    eloRating: card.eloRating,
    faceoffWins: card.faceoffWins,
    faceoffLosses: card.faceoffLosses,
    location: card.location,
    date: card.date,
    country: card.country,
    description: card.description,
    prizeAmountUsd: card.prizeAmountUsd,
  }));

  return (
    <main className="min-h-screen w-full">
      <FaceoffArena anchorId={anchorId} pool={pool} />
    </main>
  );
}
