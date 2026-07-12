import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CalendarDays, MapPin } from "lucide-react";

import { HackathonNotificationPreferences } from "@/components/hackathon-notification-preferences";
import { getCurrentUserRecord } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  hackathonDates,
  hackathonLocations,
  hackathons,
  userHackathonNotificationPreferences,
  userHackathons,
} from "@/lib/db/schema";
import { formatDateRange, formatLocation } from "@/lib/hackathons/card-format";
import {
  computeSelectableReminderSchedule,
  getSelectableReminderTypesForStatus,
} from "@/lib/hackathons/reminder-plan";

export const metadata: Metadata = {
  title: "Add Reminder | Hackathons North America",
  description: "Choose which email reminders you want for this hackathon.",
};

export default async function HackathonRemindersPage({
  params,
}: {
  params: Promise<{ hackathonId: string }>;
}) {
  const { hackathonId } = await params;
  const user = await getCurrentUserRecord();

  if (!user) {
    redirect("/sign-in");
  }

  const [[row], preferenceRows] = await Promise.all([
    db
      .select({
        applicationStatus: userHackathons.applicationStatus,
        hackathonId: hackathons.id,
        hackathonName: hackathons.name,
        slug: hackathons.slug,
        venue: hackathons.venue,
        format: hackathons.format,
        city: hackathonLocations.city,
        region: hackathonLocations.region,
        country: hackathonLocations.country,
        startsAt: hackathonDates.startsAt,
        endsAt: hackathonDates.endsAt,
        applicationOpensAt: hackathonDates.applicationOpensAt,
        applicationClosesAt: hackathonDates.applicationClosesAt,
        acceptanceAt: hackathonDates.acceptanceAt,
      })
      .from(userHackathons)
      .innerJoin(hackathons, eq(hackathons.id, userHackathons.hackathonId))
      .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
      .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
      .where(and(eq(userHackathons.userId, user.id), eq(userHackathons.hackathonId, hackathonId)))
      .limit(1),
    db
      .select({
        type: userHackathonNotificationPreferences.type,
        enabled: userHackathonNotificationPreferences.enabled,
      })
      .from(userHackathonNotificationPreferences)
      .where(
        and(
          eq(userHackathonNotificationPreferences.userId, user.id),
          eq(userHackathonNotificationPreferences.hackathonId, hackathonId),
          eq(userHackathonNotificationPreferences.channel, "email")
        )
      ),
  ]);

  if (!row) {
    notFound();
  }

  const now = new Date();
  const enabledByType = new Map(preferenceRows.map((preference) => [preference.type, preference.enabled]));

  // Same selection logic as the pipeline used inline: the reminders offered
  // depend on where the hacker stands — those still interested get
  // application-open reminders, while applied and accepted hackers get the
  // event-start ones. Anything without a stored row defaults to enabled,
  // matching the reminder sync.
  const availableReminderTypes = new Set(getSelectableReminderTypesForStatus(row.applicationStatus));
  const notificationPreferences = computeSelectableReminderSchedule({
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    applicationOpensAt: row.applicationOpensAt,
    applicationClosesAt: row.applicationClosesAt,
    acceptanceAt: row.acceptanceAt,
  })
    .filter(({ type }) => availableReminderTypes.has(type))
    .map(({ type, scheduledFor }) => ({
      type,
      enabled: enabledByType.get(type) ?? true,
      scheduledFor: scheduledFor.toISOString(),
      upcoming: scheduledFor > now,
    }));

  return (
    <main className="min-h-screen px-5 pb-20 pt-14 text-navy dark:text-wheat sm:px-8 sm:pt-16 lg:px-12">
      <div className="mx-auto w-full max-w-[720px]">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-rust">Add Reminder</p>
        <h1 className="mt-3 font-serif text-3xl font-semibold tracking-[-0.02em] text-navy dark:text-wheat sm:text-4xl">
          <Link
            className="underline-offset-4 hover:text-cabernet dark:hover:text-[#e4a3ab] hover:underline"
            href={`/hackathons/${row.slug}`}
          >
            {row.hackathonName}
          </Link>
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-navy/55 dark:text-wheat/55">
          <span className="inline-flex items-center gap-1">
            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
            {formatDateRange(row.startsAt, row.endsAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            {formatLocation(row)}
          </span>
        </p>

        <section className="mt-8 rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 p-6">
          {notificationPreferences.length ? (
            <>
              <p className="text-sm text-navy/55 dark:text-wheat/55">
                Pick which email reminders you want for this hackathon. Changes save instantly.
              </p>
              <HackathonNotificationPreferences
                hackathonId={row.hackathonId}
                initialPreferences={notificationPreferences}
              />
            </>
          ) : (
            <p className="text-sm text-navy/55 dark:text-wheat/55">
              No reminders are available for this hackathon yet — we&apos;ll offer them once its key dates are
              confirmed.
            </p>
          )}
        </section>

        <Link
          className="mt-8 inline-flex rounded-full min-h-10 items-center justify-center border border-cabernet dark:border-[#e4a3ab]/50 px-5 text-sm font-semibold text-cabernet dark:text-[#e4a3ab] transition-colors hover:bg-cabernet hover:text-wheat"
          href="/my"
        >
          Back to My Hackathons
        </Link>
      </div>
    </main>
  );
}
