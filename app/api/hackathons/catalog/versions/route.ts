import { catalogVersionsBody, respondWithCatalogFile } from "@/lib/hackathons/catalog-files";

/* The current version of each catalog file, in about 150 bytes. An open
   /hackathons tab fetches this every minute and re-downloads only the files
   it holds an older version of (lib/hackathons/catalog-client.ts), so staying
   current costs almost nothing while nothing changes. Regenerated as often as
   the votes file, from the same cached data the files are made from. Static
   and outside Clerk's proxy like them (see ../route.ts). */
export const dynamic = "force-static";
export const revalidate = 60;

export function GET() {
  return respondWithCatalogFile("catalog-versions-file", catalogVersionsBody, {
    catalog: null,
    descriptions: null,
    votes: null,
  });
}
