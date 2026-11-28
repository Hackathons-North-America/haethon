import { catalogVersionsBody, respondWithCatalogFile } from "@/lib/hackathons/catalog-files";

/* The current version of each catalog file, in about 150 bytes. An open
   /hackathons tab fetches this every minute and re-downloads only the files
   it holds an older version of (lib/hackathons/catalog-client.ts), so staying
   current costs almost nothing while nothing changes. Regenerated as often as
   the votes file (every 10 minutes, see ../votes/route.ts), from the same
   data the files are made from; the CDN answers the checks in between, and a
   catalog write still reaches it at once through the catalog's cache tag.
   Static and outside Clerk's proxy like them (see ../route.ts). */
export const dynamic = "force-static";
export const revalidate = 600;

export function GET() {
  return respondWithCatalogFile("catalog-versions-file", catalogVersionsBody, {
    catalog: null,
    descriptions: null,
    votes: null,
  });
}
