import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { cache } from "react";

import { AttendedHackathonsTable } from "@/components/attended-hackathons-table";
import { FollowButton } from "@/components/follow-button";
import { PrimaryNav } from "@/components/primary-nav";
import { ProfileActivity } from "@/components/profile-activity";
import {
  buildProfileLinks,
  ProfilePinnedSection,
  ProfileSkillsSection,
  ProfileSocialsSection,
} from "@/components/profile/profile-sections";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { userProfiles, users } from "@/lib/db/schema";
import { getFollowState } from "@/lib/follows/queries";
import { loadProfilePageData, type ProfilePageData } from "@/lib/profile/profile-page-data";
import { PUBLIC_PROFILE_CACHE_TAG } from "@/lib/profile/public-profile-cache";
import { sanitizeSkills } from "@/lib/profile/skills";
import { isProfileUsername } from "@/lib/profile/username";

export const dynamic = "force-dynamic";

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

/* Everything on this page that isn't viewer-specific — the profile row plus
   the whole hackathon-history fan-out — cached across requests per username,
   so a shared profile link stops re-running four join-heavy queries on every
   view. Only the follow state and the viewer lookup stay per-request. */
const getCachedPublicProfile = unstable_cache(
  async (username: string) => {
    const profile = await loadSharedProfile(username);

    if (!profile) {
      return null;
    }

    return { profile, profileData: await loadProfilePageData(profile.userId) };
  },
  [PUBLIC_PROFILE_CACHE_TAG],
  { revalidate: 600, tags: [PUBLIC_PROFILE_CACHE_TAG] }
);

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
  const [data, viewerId] = await Promise.all([getPublicProfile(username), getCurrentUserId()]);

  if (!data) {
    notFound();
  }

  const { profile, profileData } = data;
  // Signed-out visitors still get the button; their follow attempt 401s into
  // the sign-in flow. Only the profile's owner has nothing to follow here.
  const isOwnProfile = viewerId === profile.userId;
  const followState = viewerId && !isOwnProfile ? await getFollowState(viewerId, profile.userId) : null;
  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  const links = buildProfileLinks(profile);
  const skills = sanitizeSkills(profile.skills ?? []);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <PrimaryNav />

      <div className="px-5 pb-16 pt-28 sm:px-8 sm:pt-32 lg:px-12">
        <div className="mx-auto w-full max-w-[840px] space-y-10">
          <section className="py-8 sm:py-14">
            <h1 className="text-[clamp(3rem,8vw,4.75rem)] font-medium leading-[0.92] tracking-tight text-ink">
              {displayName ? <>Hi, I&apos;m {displayName}</> : "Hacker profile"}
            </h1>
            {profile.school ? (
              <p className="mt-5 text-xl font-medium leading-snug text-ink sm:text-2xl">{profile.school}</p>
            ) : null}
            {profile.bio ? (
              <p className="mt-8 max-w-xl text-base leading-7 text-ink/55 sm:text-lg">{profile.bio}</p>
            ) : null}

            {!isOwnProfile ? (
              <div className="mt-8">
                <FollowButton initialFollow={followState} username={username} />
              </div>
            ) : null}

            <ProfileSocialsSection emptyText="No social profiles yet." links={links} />
            <ProfileSkillsSection emptyText="No skills listed yet." skills={skills} />
          </section>

          <ProfilePinnedSection
            empty={<p className="text-sm text-ink/55 dark:text-paper/55">No pinned wins or events yet.</p>}
            items={profileData.pinnedItems}
          />

          <ProfileActivity latestAttended={profileData.latestAttended} years={profileData.yearActivity} />

          <section className="pb-2 pt-5">
            <h2 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">Hackathons attended</h2>
            <div className="mt-4">
              <AttendedHackathonsTable
                emptyText="No hackathons attended yet."
                readOnly
                rows={profileData.attendedRows}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
