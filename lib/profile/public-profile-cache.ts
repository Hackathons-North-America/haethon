import { revalidateTag } from "next/cache";

/* Each cached public profile page carries its owner's tag, so a write
   rebuilds only the profiles it changed (each lazily, on its next view). The
   10-minute revalidate window is the backstop for anything that slips
   through, such as an admin renaming a hackathon a profile lists. */
export function publicProfileCacheTag(userId: string) {
  return `public-profile:${userId}`;
}

export function revalidatePublicProfiles(userIds: string[]) {
  for (const userId of new Set(userIds)) {
    revalidateTag(publicProfileCacheTag(userId), "max");
  }
}
