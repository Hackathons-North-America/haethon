import { fetchSafeRemoteImage } from "@/lib/security/remote-image";

/* Image URLs are vetted once here, when they enter the database, rather than on
   every read (see lib/hackathons/logo-hosts.ts).

   Two limits, by who supplies the image:

   - Imports (bulk JSON, feed sync, merges, approved submissions) and the cover
     thumbnail job: 15MB. Organizers routinely post 5-10MB cover PNGs; with a
     4MB cap those imports lost their cover entirely, and the thumbnail job
     skipped exactly the files that most need shrinking. Catalog cards show
     the 640/1280px thumbnails cut from these bytes, not the original.
   - Admin and organizer edits: 4MB, matching the UploadThing router, and the
     error message tells the editor so. */
const IMPORTED_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const EDITED_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

export type VerifiedImage = Awaited<ReturnType<typeof fetchSafeRemoteImage>>;

/** Admin/organizer edits: reject the save with an actionable message. Returns
    the downloaded image so the cover thumbnails can be cut from the same bytes
    instead of fetching it a second time. */
export async function assertReachableImageUrl(url: string): Promise<VerifiedImage> {
  try {
    return await fetchSafeRemoteImage(url, EDITED_IMAGE_MAX_BYTES);
  } catch {
    throw new Error("Image URL must point at a publicly reachable image (PNG, JPEG, GIF, WebP, AVIF, or ICO) under 4MB.");
  }
}

/** Imports and the thumbnail job: the image's bytes (up to 15MB), or undefined
    when the URL is missing, dead, larger than that or not a supported raster
    image. */
export async function fetchVerifiedImage(url: string | null | undefined): Promise<VerifiedImage | undefined> {
  if (!url) {
    return undefined;
  }

  try {
    return await fetchSafeRemoteImage(url, IMPORTED_IMAGE_MAX_BYTES);
  } catch {
    return undefined;
  }
}

/** Automated imports (Luma sync, bulk JSON): drop a broken image rather than
    fail the whole import. */
export async function verifiedImageUrl(url: string | null | undefined) {
  return (await fetchVerifiedImage(url)) ? url! : undefined;
}
