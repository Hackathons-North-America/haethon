import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { AttendedHackathonsTable } from "@/components/attended-hackathons-table";
import { PrimaryNav } from "@/components/primary-nav";
import { ProfileActivity } from "@/components/profile-activity";
import {
  buildProfileLinks,
  ProfilePinnedSection,
  ProfileSkillsSection,
  ProfileSocialsSection,
} from "@/components/profile/profile-sections";
import { db } from "@/lib/db";
import { userProfiles, users } from "@/lib/db/schema";
import { loadProfilePageData } from "@/lib/profile/profile-page-data";
import { isProfileShareToken } from "@/lib/profile/share-token";
import { sanitizeSkills } from "@/lib/profile/skills";

// Rendered per request so revoking or regenerating a token takes effect
// immediately — a cached copy would keep serving a link the owner turned off.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

/**
 * Resolves the share token to its owner. The token is the only credential:
 * it is 256 bits of CSPRNG output, so a lookup miss is the whole access check.
 * Columns are listed explicitly — email, Clerk id, and notification state are
 * deliberately absent so they cannot leak into the page or its RSC payload.
 */
async function loadSharedProfile(token: string) {
  if (!isProfileShareToken(token)) {
    return null;
  }

  const [row] = await db
    .select({
      userId: userProfiles.userId,
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
    .from(userProfiles)
    .innerJoin(users, eq(users.id, userProfiles.userId))
    .where(eq(userProfiles.shareToken, token))
    .limit(1);

  return row ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const profile = await loadSharedProfile(token);
  const displayName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();

  return {
    title: displayName ? `${displayName} · HNA` : "Hacker profile · HNA",
    description: displayName ? `${displayName}'s hackathon profile on HNA.` : undefined,
    // The URL is a secret, so it must never end up in a search index or in the
    // Referer header of an outbound click from this page.
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}

export default async function SharedProfilePage({ params }: PageProps) {
  const { token } = await params;
  const profile = await loadSharedProfile(token);

  if (!profile) {
    notFound();
  }

  const profileData = await loadProfilePageData(profile.userId);
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

            <ProfileSocialsSection emptyText="No social profiles yet." links={links} />
            <ProfileSkillsSection emptyText="No skills listed yet." skills={skills} />
          </section>

          <ProfilePinnedSection
            empty={<p className="text-sm text-navy/55 dark:text-wheat/55">No pinned wins or events yet.</p>}
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
