import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { AttendedHackathonsTable } from "@/components/attended-hackathons-table";
import { AccountProfileForm } from "@/components/forms/account-profile-form";
import { EmailPreferencesToggle } from "@/components/email-preferences-toggle";
import { ProfileActivity } from "@/components/profile-activity";
import { ProfilePinnedSection } from "@/components/profile/profile-sections";
import { getCurrentUserContext, syncCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { devpostVerificationState } from "@/lib/devpost/import-service";
import { loadProfilePageData } from "@/lib/profile/profile-page-data";

const sectionTitleClassName = "text-4xl font-semibold tracking-tight text-ink sm:text-5xl";

export default async function AccountPage() {
  // Most pages skip the Clerk profile sync for speed; the account page is
  // where profile data is shown/edited, so refresh it here explicitly.
  await syncCurrentUser();

  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/sign-in");
  }

  const [[profile], profileData] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, context.user.id)).limit(1),
    loadProfilePageData(context.user.id),
  ]);

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
              firstName={context.user.firstName}
              lastName={context.user.lastName}
              username={context.user.username}
              profile={profile ?? null}
              devpostImport={devpostImport}
            />
          </section>

          <section id="email-preferences">
            <EmailPreferencesToggle initialEnabled={!context.user.emailUnsubscribedAt} />
          </section>

          <div className="min-w-0 space-y-10">
            <ProfilePinnedSection
              empty={
                <p className="text-sm text-navy/55 dark:text-wheat/55">
                  Pin wins and attended events from{" "}
                  <Link
                    className="font-semibold text-pine dark:text-moss underline decoration-1 underline-offset-4 hover:no-underline"
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
