import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { cache } from "react";

import { AttendedHackathonsTable } from "@/components/attended-hackathons-table";
import { ProfileActivity } from "@/components/profile-activity";
import { ProfileHeader } from "@/components/profile/profile-header";
import {
  buildProfileLinks,
  ProfilePinnedSection,
  ProfileSection,
  ProfileSkillsSection,
} from "@/components/profile/profile-sections";
import { ProfileStats } from "@/components/profile/profile-stats";
import { db } from "@/lib/db";
import { userProfiles, users } from "@/lib/db/schema";
import { loadProfilePageData, type ProfilePageData } from "@/lib/profile/profile-page-data";
import { publicProfileCacheTag } from "@/lib/profile/public-profile-cache";
import { sanitizeSkills } from "@/lib/profile/skills";
import { isProfileUsername } from "@/lib/profile/username";

/* Rendered once per username and then served as a static file (ISR): a shared
   profile link no longer invokes a function per view. Nothing here reads the
   visitor's session, so one rendering is correct for everyone.

   Freshness is unchanged from the previous per-request rendering, which read
   the same data through unstable_cache: every profile-affecting write calls
   revalidatePublicProfiles() with the users it changed, whose tags are
   recorded on these pages too, and the ten-minute window is the backstop. */
export const revalidate = 600;

/* No profiles are built at deploy time; each is generated on its first visit. */
export function generateStaticParams() {
  return [];
}

type PageProps = { params: Promise<{ username: string }> };

/**
 * Columns are listed explicitly — email, Clerk id, and notification state are
 * deliberately absent so they cannot leak into the page or its RSC payload.
 */
async function loadSharedProfile(username: string) {
  if (!isProfileUsername(username)) {
    return null;
  }

  const [row] = await db
    .select({
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      bio: userProfiles.bio,
      school: userProfiles.school,
      skills: userProfiles.skills,
      githubUrl: userProfiles.githubUrl,
      linkedinUrl: userProfiles.linkedinUrl,
      instagramUrl: userProfiles.instagramUrl,
      xUrl: userProfiles.xUrl,
      devpostUrl: userProfiles.devpostUrl,
      portfolioUrl: userProfiles.portfolioUrl,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.username, username))
    .limit(1);

  return row ?? null;
}

/* A username never changes owner (usernames are permanent), so its user id
   is cached without a tag. */
const getCachedProfileUserId = unstable_cache(
  async (username: string) => {
    if (!isProfileUsername(username)) {
      return null;
    }

    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);

    return row?.id ?? null;
  },
  ["public-profile-user-id"],
  { revalidate: 600 }
);

/* Everything on this page that isn't viewer-specific — the profile row plus
   the whole hackathon-history fan-out — cached across requests per username,
   so a shared profile link stops re-running four join-heavy queries on every
   view. Tagged with the owner's id, which is why the id is looked up first:
   another user's writes leave this profile's cache alone. */
async function getCachedPublicProfile(username: string) {
  const userId = await getCachedProfileUserId(username);

  if (!userId) {
    return null;
  }

  return unstable_cache(
    async () => {
      const profile = await loadSharedProfile(username);

      if (!profile) {
        return null;
      }

      return { profile, profileData: await loadProfilePageData(profile.userId) };
    },
    ["public-profile", username],
    { revalidate: 600, tags: [publicProfileCacheTag(userId)] }
  )();
}

/* unstable_cache round-trips through JSON, so pinned items' Date columns come
   back as ISO strings on a cache hit; revive them for the components. */
function revivePinnedDates(profileData: ProfilePageData): ProfilePageData {
  return {
    ...profileData,
    pinnedItems: profileData.pinnedItems.map((item) => ({
      ...item,
      startsAt: item.startsAt ? new Date(item.startsAt) : null,
      endsAt: item.endsAt ? new Date(item.endsAt) : null,
    })),
  };
}

/* React cache() dedupes within a request: generateMetadata and the page body
   share one cached lookup. */
const getPublicProfile = cache(async (username: string) => {
  const data = await getCachedPublicProfile(username);

  if (!data) {
    return null;
  }

  return { profile: data.profile, profileData: revivePinnedDates(data.profileData) };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = (await getPublicProfile(username))?.profile ?? null;
  const displayName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();

  return {
    title: displayName ? `${displayName} · HNA` : "Hacker profile · HNA",
    description: displayName ? `${displayName}'s hackathon profile on HNA.` : undefined,
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function SharedProfilePage({ params }: PageProps) {
  const { username } = await params;
  const data = await getPublicProfile(username);

  if (!data) {
    notFound();
  }

  const { profile, profileData } = data;
  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  const links = buildProfileLinks(profile);
  const skills = sanitizeSkills(profile.skills ?? []);

  const attendedCount = profileData.totals?.hackathonsAttended ?? profileData.attendedRows.length;
  const attendedAside =
    attendedCount > profileData.attendedRows.length
      ? `Latest ${profileData.attendedRows.length} of ${attendedCount}`
      : undefined;

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="px-4 pb-16 pt-10 sm:px-8 sm:pt-16 lg:px-12">
        <div className="mx-auto w-full max-w-[760px] space-y-10">
          <div className="space-y-6">
            <ProfileHeader
              bio={profile.bio}
              links={links}
              name={displayName}
              school={profile.school}
              username={profile.username}
            />
            <ProfileStats data={profileData} />
          </div>

          {/* Visitors don't need empty-state copy: sections with nothing to
              show are left out. */}
          {profileData.pinnedItems.length > 0 ? (
            <ProfilePinnedSection empty={null} items={profileData.pinnedItems} />
          ) : null}

          {skills.length > 0 ? <ProfileSkillsSection emptyText="No skills listed yet." skills={skills} /> : null}

          <ProfileActivity latestAttended={profileData.latestAttended} years={profileData.yearActivity} />

          <ProfileSection aside={attendedAside} id="hackathons-attended" title="Hackathons attended">
            <AttendedHackathonsTable
              emptyText="No hackathons attended yet."
              readOnly
              rows={profileData.attendedRows}
            />
          </ProfileSection>
        </div>
      </div>
    </main>
  );
}
