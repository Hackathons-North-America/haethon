import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { AttendedHackathonsTable } from "@/components/attended-hackathons-table";
import { AccountProfileForm } from "@/components/forms/account-profile-form";
import { ProfileActivity } from "@/components/profile-activity";
import { ProfilePinnedSection } from "@/components/profile/profile-sections";
import { getCurrentUserId, getCurrentUserRecord, syncCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { devpostVerificationState } from "@/lib/devpost/import-service";
import { loadProfilePageData } from "@/lib/profile/profile-page-data";

const sectionTitleClassName = "text-4xl font-semibold tracking-tight text-ink sm:text-5xl";

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

  return (
    <main className="relative min-h-[calc(100vh-80px)] px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-[840px]">
        <div className="space-y-10">
          <section id="profile" className="pt-2">
            <AccountProfileForm
              firstName={user.firstName}
              lastName={user.lastName}
              username={user.username}
              profile={profile ?? null}
              devpostImport={devpostImport}
            />
          </section>

          <div className="min-w-0 space-y-10">
            <ProfilePinnedSection
              empty={
                <p className="text-sm text-ink/55">
                  Pin wins and attended events from{" "}
                  <Link
                    className="font-semibold text-pine underline decoration-1 underline-offset-4 hover:no-underline"
                    href="/my"
                  >
                    My hackathons
                  </Link>{" "}
                  to feature them here.
                </p>
              }
              items={profileData.pinnedItems}
            />

            <ProfileActivity latestAttended={profileData.latestAttended} years={profileData.yearActivity} />

            <section id="hackathons-attended" className="pb-2 pt-5">
              <h2 className={sectionTitleClassName}>Hackathons attended</h2>
              <div className="mt-4">
                <AttendedHackathonsTable rows={profileData.attendedRows} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
