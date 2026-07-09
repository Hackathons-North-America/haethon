import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull, ne, or } from "drizzle-orm";
import { BellRing, CalendarDays, ExternalLink, MapPin, Pin, Trophy } from "lucide-react";

import { HackathonResultActions } from "@/components/hackathon-result-actions";
import { HackathonStatusTracker } from "@/components/hackathon-status-tracker";
import { MarkAttendedButton } from "@/components/mark-attended-button";
import { ReminderMuteButton } from "@/components/reminder-mute-button";
import { getCurrentUserRecord } from "@/lib/auth";
import { db } from "@/lib/db";
import { hackathonDates, hackathonLocations, hackathons, reminders, userHackathons } from "@/lib/db/schema";
import { formatDateRange, formatLocation } from "@/lib/hackathons/card-format";
import { formatReminderDate, reminderTypeLabels } from "@/lib/hackathons/reminder-labels";

export const metadata: Metadata = {
  title: "My Hackathons | Hackathons North America",
  description: "Track where you stand with every hackathon — from interested to attending.",
};

type PipelineRow = {
  id: string;
  applicationStatus: string;
  isPinned: boolean;
  awardName: string | null;
  devpostUrl: string | null;
  hackathonId: string;
  hackathonName: string;
  slug: string;
  venue: string | null;
  format: "online" | "in_person";
  city: string | null;
  region: string | null;
  country: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  applicationOpensAt: Date | null;
  applicationClosesAt: Date | null;
  acceptanceAt: Date | null;
};

const stageOrder = ["interested", "applied", "accepted", "attending"] as const;

const stageTitles: Record<(typeof stageOrder)[number], string> = {
  interested: "Interested",
  applied: "Applied",
  accepted: "Accepted",
  attending: "Attending",
};

function nextDeadline(row: PipelineRow, now: Date) {
  const candidates: { label: string; date: Date | null }[] = [
    { label: "Applications open", date: row.applicationOpensAt },
    { label: "Applications close", date: row.applicationClosesAt },
    { label: "Decisions", date: row.acceptanceAt },
    { label: "Starts", date: row.startsAt },
    { label: "Ends", date: row.endsAt },
  ];

  return candidates.find((candidate) => candidate.date && candidate.date > now) ?? null;
}

export default async function MyHackathonsPage() {
  const user = await getCurrentUserRecord();

  if (!user) {
    redirect("/sign-in");
  }

  const [rows, pendingReminders] = await Promise.all([
    db
      .select({
        id: userHackathons.id,
        applicationStatus: userHackathons.applicationStatus,
        isPinned: userHackathons.isPinned,
        awardName: userHackathons.awardName,
        devpostUrl: userHackathons.devpostUrl,
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
      .where(
        and(
          eq(userHackathons.userId, user.id),
          or(eq(userHackathons.isSaved, true), ne(userHackathons.applicationStatus, "interested"))
        )
      )
      .orderBy(asc(hackathonDates.startsAt)),
    db
      .select({
        id: reminders.id,
        hackathonId: reminders.hackathonId,
        type: reminders.type,
        scheduledFor: reminders.scheduledFor,
      })
      .from(reminders)
      .where(and(eq(reminders.userId, user.id), isNull(reminders.sentAt)))
      .orderBy(asc(reminders.scheduledFor)),
  ]);

  const now = new Date();
  const remindersByHackathon = new Map<string, typeof pendingReminders>();

  for (const reminder of pendingReminders) {
    const list = remindersByHackathon.get(reminder.hackathonId) ?? [];
    list.push(reminder);
    remindersByHackathon.set(reminder.hackathonId, list);
  }

  const byStage = new Map<string, PipelineRow[]>();
  const pastRows: PipelineRow[] = [];

  for (const row of rows) {
    const ended = row.endsAt ? row.endsAt < now : false;

    if (ended || row.applicationStatus === "attended" || row.applicationStatus === "won") {
      pastRows.push(row);
      continue;
    }

    const list = byStage.get(row.applicationStatus) ?? [];
    list.push(row);
    byStage.set(row.applicationStatus, list);
  }

  pastRows.sort((a, b) => (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0));

  const activeCount = stageOrder.reduce((total, stage) => total + (byStage.get(stage)?.length ?? 0), 0);

  return (
    <main className="min-h-screen bg-white px-5 pb-20 pt-14 text-black sm:px-8 sm:pt-16 lg:px-12">
      <div className="mx-auto w-full max-w-[980px]">
        {activeCount === 0 ? (
          <div className="mt-10 rounded-lg border border-black/10 bg-[#F7F7F4] p-8 text-center">
            <p className="text-base font-semibold text-black">Nothing in your pipeline yet.</p>
            <p className="mt-2 text-sm text-[#706F6B]">
              Browse the database and mark hackathons you&apos;re interested in — deadlines and reminders will show up
              here.
            </p>
            <Link
              className="mt-6 inline-flex min-h-10 items-center justify-center border border-[#660000] px-5 text-sm font-semibold text-[#660000] transition-colors hover:bg-[#660000] hover:text-white"
              href="/hackathons"
            >
              Browse the Hackathons DB
            </Link>
          </div>
        ) : null}

        {stageOrder.map((stage) => {
          const stageRows = byStage.get(stage) ?? [];

          if (!stageRows.length) {
            return null;
          }

          return (
            <section className="mt-10" key={stage}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#660000]">
                {stageTitles[stage]} · {stageRows.length}
              </h2>

              <div className="mt-4 space-y-3">
                {stageRows.map((row) => {
                  const deadline = nextDeadline(row, now);
                  const rowReminders = remindersByHackathon.get(row.hackathonId) ?? [];

                  return (
                    <article className="rounded-lg border border-black/10 bg-[#F7F7F4] p-5" key={row.id}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <Link
                            className="text-lg font-semibold text-black underline-offset-4 hover:text-[#660000] hover:underline"
                            href={`/hackathons/${row.slug}`}
                          >
                            {row.hackathonName}
                          </Link>
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#706F6B]">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
                              {formatDateRange(row.startsAt, row.endsAt)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                              {formatLocation(row)}
                            </span>
                          </p>
                        </div>
                        {deadline?.date ? (
                          <span className="rounded-full border border-[#660000]/25 bg-white px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#660000]">
                            {deadline.label} · {formatReminderDate(deadline.date)}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <HackathonStatusTracker
                          compact
                          hackathonId={row.hackathonId}
                          initialStatus={row.applicationStatus}
                        />
                      </div>

                      {rowReminders.length ? (
                        <ul className="mt-4 space-y-1 border-t border-black/10 pt-3">
                          {rowReminders.map((reminder) => {
                            const label = reminderTypeLabels[reminder.type] ?? reminder.type;

                            return (
                              <li className="flex items-center justify-between gap-2 text-sm text-[#3F3E3B]" key={reminder.id}>
                                <span className="inline-flex items-center gap-2">
                                  <BellRing aria-hidden="true" className="size-3.5 shrink-0 text-[#660000]" />
                                  {label} · {formatReminderDate(reminder.scheduledFor)}
                                </span>
                                <ReminderMuteButton label={label} reminderId={reminder.id} />
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}

        {pastRows.length ? (
          <section className="mt-12 border-t border-black/10 pt-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#706F6B]">Past</h2>
            <div className="mt-4 space-y-3">
              {pastRows.map((row) => {
                const won = row.applicationStatus === "won";
                const attended = row.applicationStatus === "attended";

                return (
                  <article className="rounded-lg border border-black/10 bg-[#F7F7F4] p-5" key={row.id}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Link
                          className="text-lg font-semibold text-black underline-offset-4 hover:text-[#660000] hover:underline"
                          href={`/hackathons/${row.slug}`}
                        >
                          {row.hackathonName}
                        </Link>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#706F6B]">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
                            {formatDateRange(row.startsAt, row.endsAt)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                            {formatLocation(row)}
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        {won ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#660000] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-white">
                            <Trophy aria-hidden="true" className="size-3.5" />
                            Winner
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#706F6B]">
                            {attended ? "Attended" : "Ended"}
                          </span>
                        )}
                        {row.isPinned ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#660000]/25 bg-white px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#660000]">
                            <Pin aria-hidden="true" className="size-3.5 fill-current" />
                            Pinned
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {(won && row.awardName) || row.devpostUrl ? (
                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                        {won && row.awardName ? (
                          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#660000]">
                            <Trophy aria-hidden="true" className="size-3.5 shrink-0" />
                            {row.awardName}
                          </p>
                        ) : null}
                        {row.devpostUrl ? (
                          <a
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-black underline-offset-4 hover:text-[#660000] hover:underline"
                            href={row.devpostUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                            View project
                          </a>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-4 border-t border-black/10 pt-4">
                      {won || attended ? (
                        <HackathonResultActions
                          awardName={row.awardName}
                          devpostUrl={row.devpostUrl}
                          isPinned={row.isPinned}
                          status={won ? "won" : "attended"}
                          userHackathonId={row.id}
                        />
                      ) : (
                        <MarkAttendedButton userHackathonId={row.id} />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
