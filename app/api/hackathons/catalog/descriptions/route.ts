import { catalogDescriptionsBody, respondWithCatalogFile } from "@/lib/hackathons/catalog-files";

/* The catalog's card blurbs, by hackathon id, as a static file. Kept out of
   the catalog file because they are about half its bytes and no search needs
   them to decide which cards to show: the browser draws cards first and fills
   the blurbs in when this arrives. Same schedule and cache tag as the catalog
   file (see ../route.ts). */
export const dynamic = "force-static";
export const revalidate = 600;

export function GET() {
  return respondWithCatalogFile("catalog-descriptions-file", catalogDescriptionsBody, { version: null, descriptions: null });
}
