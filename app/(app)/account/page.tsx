import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { AccountDevpostImportButton } from "@/components/account/account-devpost-import";
import { AccountProfileEditor } from "@/components/account/account-profile-editor";
import { AttendedHackathonsTable } from "@/components/attended-hackathons-table";
import { ProfileActivity } from "@/components/profile-activity";
import { ProfilePinnedSection, ProfileSection, ProfileSkillsSection } from "@/components/profile/profile-sections";
import { ProfileStats } from "@/components/profile/profile-stats";
import { getCurrentUserId, getCurrentUserRecord, syncCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { devpostVerificationState } from "@/lib/devpost/import-service";
import { loadProfilePageData } from "@/lib/profile/profile-page-data";
import { sanitizeSkills } from "@/lib/profile/skills";

const inlineLinkClassName =
  "font-semibold text-pine underline decoration-1 underline-offset-4 hover:no-underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

function loadAccountData(userId: string) {
  return Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
    loadProfilePageData(userId),
  ]);
}

export default async function AccountPage() {
  // The id comes from the session token, so nothing below has to wait for it.
  const userId = await getCurrentUserId();

  if (!userId) {
    redirect("/sign-in");
  }

  // Most pages skip the Clerk profile sync for speed; the account page is
  // where profile data is shown/edited, so refresh it here explicitly. The
  // sync is a network call to Clerk's API and by far the slowest thing on this
  // page, so the profile queries run alongside it instead of queueing behind.
  const [syncedUser, accountData] = await Promise.all([syncCurrentUser(), loadAccountData(userId)]);
  const user = syncedUser ?? (await getCurrentUserRecord());

  if (!user) {
    redirect("/sign-in");
  }

  // The claim and the row agree except in the instant after an account is
  // relinked to a new Clerk identity; trust the row and reload for it.
  const [[profile], profileData] = user.id === userId ? accountData : await loadAccountData(user.id);

  const devpostState = profile
    ? devpostVerificationState(profile)
    : { handle: null, code: null, verified: false, lastImportedAt: null };
  const devpostImport = {
    handle: devpostState.handle,
    code: devpostState.code,
    verified: devpostState.verified,
    lastImportedAt: devpostState.lastImportedAt?.toISOString() ?? null,
  };

  const skills = sanitizeSkills(profile?.skills ?? []);

  // Only the editable columns go to the client, never the whole profile row
  // (it also holds the Devpost verification bookkeeping).
  const values = {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    headline: profile?.headline ?? "",
    bio: profile?.bio ?? "",
    locationCity: profile?.locationCity ?? "",
    locationRegion: profile?.locationRegion ?? "",
    school: profile?.school ?? "",
    githubUrl: profile?.githubUrl ?? "",
    linkedinUrl: profile?.linkedinUrl ?? "",
    instagramUrl: profile?.instagramUrl ?? "",
    xUrl: profile?.xUrl ?? "",
    devpostUrl: profile?.devpostUrl ?? "",
    portfolioUrl: profile?.portfolioUrl ?? "",
    skills,
  };

  const attendedCount = profileData.totals?.hackathonsAttended ?? profileData.attendedRows.length;
  const attendedSummary =
    attendedCount > profileData.attendedRows.length
      ? `Latest ${profileData.attendedRows.length} of ${attendedCount}`
      : null;

  return (
    <main className="min-h-[calc(100vh-80px)] px-4 pb-16 pt-8 sm:px-8 sm:pt-12 lg:px-12">
      {/* Same column and section order as the public /p/<username> page, so
          the owner sees what visitors see, plus owner actions and empty
          states that point at where to fill each section in. */}
      <div className="mx-auto w-full max-w-[760px] space-y-10">
        {/* The sections are server-rendered and passed through the client
            editor, which hides them while the edit form is open. */}
        <AccountProfileEditor
          devpostImport={devpostImport}
          stats={<ProfileStats data={profileData} />}
          username={user.username}
          values={values}
        >
          <ProfilePinnedSection
            empty={
              <p className="text-sm text-ink/55">
                Pin wins and attended events from{" "}
                <Link className={inlineLinkClassName} href="/my">
                  My hackathons
                </Link>{" "}
                to feature them here.
              </p>
            }
            items={profileData.pinnedItems}
          />

          <ProfileSkillsSection
            emptyText="Add the languages and frameworks you know with Edit profile to show them here."
            skills={skills}
          />

          <ProfileActivity latestAttended={profileData.latestAttended} years={profileData.yearActivity} />

          <ProfileSection
            aside={
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                {attendedSummary ? <span>{attendedSummary}</span> : null}
                <AccountDevpostImportButton state={devpostImport} />
              </div>
            }
            id="hackathons-attended"
            title="Hackathons attended"
          >
            <AttendedHackathonsTable
              emptyText="Hackathons you attend will appear here. Mark events as attended in My hackathons, or import them from Devpost."
              rows={profileData.attendedRows}
            />
          </ProfileSection>
        </AccountProfileEditor>
      </div>
    </main>
  );
}
