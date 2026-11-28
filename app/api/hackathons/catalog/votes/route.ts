import { catalogVotesBody, respondWithCatalogFile } from "@/lib/hackathons/catalog-files";

/* Vote totals of the listed hackathons, as a static file regenerated at most
   every 10 minutes, like the catalog. A regeneration is one small query; an
   open /hackathons tab picks up a new version through …/versions and updates
   the scores on screen. Signed-in visitors get exact live totals for the
   cards they see through /api/hackathons/card-state.

   Not every minute: an open tab would then query the database every minute,
   which keeps Neon from ever suspending its compute (it suspends after 5 idle
   minutes). Signed-out scores lag by about 10 minutes instead.

   Not read from the request, so the CDN serves it (see ../route.ts). */
export const dynamic = "force-static";
export const revalidate = 600;

export function GET() {
  return respondWithCatalogFile("catalog-votes-file", catalogVotesBody, { version: null, votes: null });
}
