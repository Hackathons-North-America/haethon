/* Image hosts the Next image optimizer may fetch from directly. Kept
   dependency-free so next.config.ts (remotePatterns) and client components can
   both import it.

   URLs on these hosts are served straight to <Image>, skipping the
   /api/hackathons/[id]/logo proxy — no middleware, function invocation, DB
   lookup, or SSRF-guarded upstream fetch on the read path. The proxy remains
   only as a fallback for legacy rows whose host isn't listed here; URLs are
   vetted once at write time instead (lib/hackathons/image-ingest.ts). */
export const DIRECT_IMAGE_HOSTS = [
  // Devpost challenge thumbnails and placeholder assets.
  "d112y698adiu2z.cloudfront.net",
  "d2dmyh35ffsxbl.cloudfront.net",
  "images.lumacdn.com",
  "mlhusercontent.com",
  "images.unsplash.com",
  // UploadThing (admin photo uploads) — legacy host; current URLs use
  // <appId>.ufs.sh, matched via DIRECT_IMAGE_HOST_SUFFIXES.
  "utfs.io",
] as const;

export const DIRECT_IMAGE_HOST_SUFFIXES = [".ufs.sh", ".mlhusercontent.com"] as const;

export function isDirectImageUrl(url: string) {
  try {
    const { protocol, hostname } = new URL(url);

    return (
      protocol === "https:" &&
      ((DIRECT_IMAGE_HOSTS as readonly string[]).includes(hostname) ||
        DIRECT_IMAGE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)))
    );
  } catch {
    return false;
  }
}

/** The src a hackathon logo should load from: the remote URL itself when its
    host is allowlisted, otherwise the same-origin proxy fallback. */
export function hackathonLogoSrc(hackathonId: string, imageUrl: string) {
  return isDirectImageUrl(imageUrl) ? imageUrl : `/api/hackathons/${encodeURIComponent(hackathonId)}/logo`;
}
