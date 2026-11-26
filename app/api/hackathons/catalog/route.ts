import { catalogFileBody, respondWithCatalogFile } from "@/lib/hackathons/catalog-files";

/* The public catalog as one static JSON file: every listed hackathon,
   unfiltered, without its description (…/descriptions) or vote totals
   (…/votes). /hackathons downloads it after it paints and then answers every
   search, sort and infinite-scroll page in the browser
   (lib/hackathons/catalog-client.ts), so none of them waits on the network.

   Like the page, this must not read the request (no auth(), cookies() or
   headers()), and proxy.ts keeps all three files out of Clerk's proxy, so the
   CDN serves them without invoking a function. It is rebuilt on the same
   schedule as the page: at most every 10 minutes, and sooner when a write
   calls revalidateHackathonCaches() (it inherits the catalog's cache tag
   through getPublicCatalogSnapshot()). Next requires the literal number here. */
export const dynamic = "force-static";
export const revalidate = 600;

export function GET() {
  return respondWithCatalogFile("catalog-snapshot-file", catalogFileBody, { version: null, entries: null });
}
