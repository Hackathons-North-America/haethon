import { fetchSafeRemoteImage } from "@/lib/security/remote-image";

/* Image URLs are vetted once here, when they enter the database, rather than on
   every read — allowlisted hosts are then served straight to the image
   optimizer (see lib/hackathons/logo-hosts.ts). Matches the 4MB cap enforced by
   the /logo proxy fallback and the UploadThing router. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type VerifiedImage = Awaited<ReturnType<typeof fetchSafeRemoteImage>>;

/** Admin/organizer edits: reject the save with an actionable message. Returns
    the downloaded image so the cover thumbnails can be cut from the same bytes
    instead of fetching it a second time. */
export async function assertReachableImageUrl(url: string): Promise<VerifiedImage> {
  try {
    return await fetchSafeRemoteImage(url, MAX_IMAGE_BYTES);
  } catch {
    throw new Error("Image URL must point at a publicly reachable image (PNG, JPEG, GIF, WebP, AVIF, or ICO) under 4MB.");
  }
}

/** The vetted image's bytes, or undefined when the URL is missing, dead, too
    large or not a supported raster image. */
export async function fetchVerifiedImage(url: string | null | undefined): Promise<VerifiedImage | undefined> {
  if (!url) {
    return undefined;
  }

  try {
    return await fetchSafeRemoteImage(url, MAX_IMAGE_BYTES);
  } catch {
    return undefined;
  }
}

/* The thumbnail job reads the original only to shrink it, on the server and
   in the background (lib/hackathons/cover-thumbnails.ts), so it may download
   more than an image we would accept for display. Without this, the covers
   that most need shrinking (organizers' 5-10 MB PNGs) were the ones skipped,
   and visitors downloaded them at full size instead. */
const THUMBNAIL_SOURCE_MAX_BYTES = 15 * 1024 * 1024;

/** The original cover's bytes for cutting thumbnails, up to 15MB, or
    undefined when the URL is dead, larger than that or not a supported raster
    image. Not a vetting step: what may be stored is still decided by the 4MB
    checks above. */
export async function fetchImageForThumbnails(url: string): Promise<VerifiedImage | undefined> {
  try {
    return await fetchSafeRemoteImage(url, THUMBNAIL_SOURCE_MAX_BYTES);
  } catch {
    return undefined;
  }
}

/** Automated imports (Luma sync, bulk JSON): drop a broken image rather than
    fail the whole import. */
export async function verifiedImageUrl(url: string | null | undefined) {
  return (await fetchVerifiedImage(url)) ? url! : undefined;
}
