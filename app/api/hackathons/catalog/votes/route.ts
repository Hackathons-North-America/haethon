import { catalogVotesBody, respondWithCatalogFile } from "@/lib/hackathons/catalog-files";

/* Live vote totals of the listed hackathons, as a static file regenerated at
   most every minute (the catalog's own totals can be ten minutes old). A
   regeneration is one small query; an open /hackathons tab re-checks it every
   minute and updates the scores on screen. Signed-in visitors also get exact
   live totals for the cards they see through /api/hackathons/card-state. Not
   read from the request, so the CDN serves it (see ../route.ts). */
export const dynamic = "force-static";
export const revalidate = 60;

export function GET() {
  return respondWithCatalogFile("catalog-votes-file", catalogVotesBody, { version: null, votes: null });
}
