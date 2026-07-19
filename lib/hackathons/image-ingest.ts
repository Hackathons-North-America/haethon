import { fetchSafeRemoteImage } from "@/lib/security/remote-image";

/* Image URLs are vetted once here, when they enter the database, rather than on
   every read — allowlisted hosts are then served straight to the image
   optimizer (see lib/hackathons/logo-hosts.ts). Matches the 4MB cap enforced by
   the /logo proxy fallback and the UploadThing router. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Admin/organizer edits: reject the save with an actionable message. */
export async function assertReachableImageUrl(url: string) {
  try {
    await fetchSafeRemoteImage(url, MAX_IMAGE_BYTES);
  } catch {
    throw new Error("Image URL must point at a publicly reachable image (PNG, JPEG, GIF, WebP, AVIF, or ICO) under 4MB.");
  }
}

/** Automated imports (Luma sync, bulk JSON): drop a broken image rather than
    fail the whole import. */
export async function verifiedImageUrl(url: string | null | undefined) {
  if (!url) {
    return undefined;
  }

  try {
    await fetchSafeRemoteImage(url, MAX_IMAGE_BYTES);
    return url;
  } catch {
    return undefined;
  }
}
