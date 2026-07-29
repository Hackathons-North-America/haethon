import { revalidateTag } from "next/cache";

/* One coarse tag for every cached public profile page. Profile-affecting
   writes are rare enough that flushing all profiles at once is fine — each
   profile rebuilds lazily on its next view, and the 10-minute revalidate
   window is the backstop for anything that slips through. */
export const PUBLIC_PROFILE_CACHE_TAG = "public-profile";

export function revalidatePublicProfiles() {
  revalidateTag(PUBLIC_PROFILE_CACHE_TAG, "max");
}
