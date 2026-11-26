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

/** Automated imports (Luma sync, bulk JSON): drop a broken image rather than
    fail the whole import. */
export async function verifiedImageUrl(url: string | null | undefined) {
  return (await fetchVerifiedImage(url)) ? url! : undefined;
}
