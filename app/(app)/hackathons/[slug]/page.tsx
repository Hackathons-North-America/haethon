import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import {
  ArrowLeft,
  ArrowUpRight,
  BellRing,
  CalendarClock,
  CalendarDays,
  CircleCheck,
  CircleDot,
  Clock,
  Globe,
  Landmark,
  type LucideIcon,
  MapPin,
  Tag as TagIcon,
  Trophy,
} from "lucide-react";

import { AddToCalendarButton } from "@/components/add-to-calendar-button";
import { DiscordGlyph } from "@/components/discord-glyph";
import { HackathonNotificationPreferences } from "@/components/hackathon-notification-preferences";
import { HackathonStatusTracker } from "@/components/hackathon-status-tracker";
import { getCurrentUserRecord } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  discordChannels,
  discordGuilds,
  hackathonDates,
  hackathonLocations,
  hackathonTags,
  hackathons,
  organizations,
  reminders,
  tags,
  userHackathonNotificationPreferences,
  userHackathons,
} from "@/lib/db/schema";
import { formatDateRange, formatDuration, formatLocation } from "@/lib/hackathons/card-format";
import {
  computeSelectableReminderPlan,
  getSelectableReminderTypesForStatus,
  selectableReminderTypes,
} from "@/lib/hackathons/reminder-plan";
import { formatReminderDate, reminderTypeLabels } from "@/lib/hackathons/reminder-labels";

const publicStatuses = ["upcoming", "live", "completed"] as const;

type PageProps = {
  params: Promise<{ slug: string }>;
};

function isSelectableReminderType(type: string): type is (typeof selectableReminderTypes)[number] {
  return selectableReminderTypes.some((selectableType) => selectableType === type);
}

async function getHackathon(slug: string) {
  const [row] = await db
    .select({
      id: hackathons.id,
      seriesId: hackathons.seriesId,
      name: hackathons.name,
      shortDescription: hackathons.shortDescription,
      websiteUrl: hackathons.websiteUrl,
      imageUrl: hackathons.imageUrl,
      applicationUrl: hackathons.applicationUrl,
      venue: hackathons.venue,
      format: hackathons.format,
      status: hackathons.status,
      beginnerFriendly: hackathons.beginnerFriendly,
      travelReimbursement: hackathons.travelReimbursement,
      prizeAmountUsd: hackathons.prizeAmountUsd,
      organizationName: organizations.name,
      city: hackathonLocations.city,
      region: hackathonLocations.region,
      country: hackathonLocations.country,
      startsAt: hackathonDates.startsAt,
      endsAt: hackathonDates.endsAt,
      applicationOpensAt: hackathonDates.applicationOpensAt,
      applicationClosesAt: hackathonDates.applicationClosesAt,
      acceptanceAt: hackathonDates.acceptanceAt,
    })
    .from(hackathons)
    .leftJoin(organizations, eq(organizations.id, hackathons.organizationId))
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(
      and(eq(hackathons.slug, slug), isNotNull(hackathons.publishedAt), inArray(hackathons.status, publicStatuses))
    )
    .limit(1);

  return row ?? null;
}

async function getDiscordChannelLink(hackathonId: string, seriesId: string | null) {
  const [channel] = await db
    .select({
      channelSnowflake: discordChannels.channelSnowflake,
      guildSnowflake: discordGuilds.guildSnowflake,
    })
    .from(discordChannels)
    .innerJoin(discordGuilds, eq(discordGuilds.id, discordChannels.guildId))
    .where(
      or(
        eq(discordChannels.hackathonId, hackathonId),
        seriesId ? eq(discordChannels.seriesId, seriesId) : undefined
      )
    )
    .limit(1);

  if (!channel) {
    return null;
  }

  return `https://discord.com/channels/${channel.guildSnowflake}/${channel.channelSnowflake}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const hackathon = await getHackathon(slug);

  if (!hackathon) {
    return { title: "Hackathon not found | Hackathons North America" };
  }

  return {
    title: `${hackathon.name} | Hackathons North America`,
    description: hackathon.shortDescription ?? `Dates, deadlines, and details for ${hackathon.name}.`,
  };
}

function formatDeadline(date: Date | null) {
  if (!date) {
    return "TBA";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    date
  );
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function getStatusPill(status: string) {
  switch (status) {
    case "live":
      return { label: "Live now", dot: "#1A7F37", bg: "#E6F4EA", text: "#1A7F37" };
    case "completed":
      return { label: "Completed", dot: "#838a98", bg: "#f4f4f6", text: "#616a7c" };
    default:
      return { label: "Upcoming", dot: "#B7791F", bg: "#FBF3E4", text: "#8A5A00" };
  }
}

// Notion-style property row: muted label column on the left, value on the right.
function Property({ children, icon: Icon, label }: { children: ReactNode; icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-start gap-4 rounded-md px-2 py-1.5 transition-colors hover:bg-ivory dark:hover:bg-white/10">
      <div className="flex w-40 shrink-0 items-center gap-2 pt-px text-sm text-navy/55 dark:text-wheat/55">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="min-w-0 flex-1 text-sm text-navy dark:text-wheat">{children}</div>
    </div>
  );
}

export default async function HackathonDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const [hackathon, user] = await Promise.all([getHackathon(slug), getCurrentUserRecord()]);

  if (!hackathon) {
    notFound();
  }

  const [tagRows, [tracked], upcomingReminders, notificationPreferenceRows, discordChannelLink] = await Promise.all([
    db
      .select({ name: tags.name })
      .from(hackathonTags)
      .innerJoin(tags, eq(tags.id, hackathonTags.tagId))
      .where(eq(hackathonTags.hackathonId, hackathon.id)),
    user
      ? db
          .select({ applicationStatus: userHackathons.applicationStatus })
          .from(userHackathons)
          .where(and(eq(userHackathons.userId, user.id), eq(userHackathons.hackathonId, hackathon.id)))
          .limit(1)
      : Promise.resolve([] as { applicationStatus: string }[]),
    user
      ? db
          .select({
            id: reminders.id,
            type: reminders.type,
            scheduledFor: reminders.scheduledFor,
          })
          .from(reminders)
          .where(
            and(eq(reminders.userId, user.id), eq(reminders.hackathonId, hackathon.id), isNull(reminders.sentAt))
          )
          .orderBy(asc(reminders.scheduledFor))
      : Promise.resolve([]),
    user
      ? db
          .select({
            type: userHackathonNotificationPreferences.type,
            enabled: userHackathonNotificationPreferences.enabled,
          })
          .from(userHackathonNotificationPreferences)
          .where(
            and(
              eq(userHackathonNotificationPreferences.userId, user.id),
              eq(userHackathonNotificationPreferences.hackathonId, hackathon.id),
              eq(userHackathonNotificationPreferences.channel, "email")
            )
          )
      : Promise.resolve([]),
    getDiscordChannelLink(hackathon.id, hackathon.seriesId),
  ]);

  const applyUrl = hackathon.applicationUrl ?? hackathon.websiteUrl;
  const statusPill = getStatusPill(hackathon.status);
  const propertyTags = [
    hackathon.beginnerFriendly ? "Beginner friendly" : null,
    hackathon.travelReimbursement ? "Travel support" : null,
    ...tagRows.map((tag) => tag.name),
  ].filter(Boolean) as string[];
  const selectableReminderPlan = computeSelectableReminderPlan(
    {
      startsAt: hackathon.startsAt,
      endsAt: hackathon.endsAt,
      applicationOpensAt: hackathon.applicationOpensAt,
      applicationClosesAt: hackathon.applicationClosesAt,
      acceptanceAt: hackathon.acceptanceAt,
    },
    new Date()
  );
  const enabledByType = new Map(selectableReminderTypes.map((type) => [type, true]));

  for (const row of notificationPreferenceRows) {
    if (isSelectableReminderType(row.type)) {
      enabledByType.set(row.type, row.enabled);
    }
  }

  // Only show a notification control when its source date is known and the
  // reminder can still be delivered. This keeps a missing application window
  // from looking like a selectable "Date TBA" reminder, while the event
  // reminders continue to be calculated from the hackathon start date.
  const availableReminderTypes = new Set(getSelectableReminderTypesForStatus(tracked?.applicationStatus ?? null));
  const notificationPreferences = selectableReminderPlan
    .filter(({ type }) => availableReminderTypes.has(type))
    .map(({ type, scheduledFor }) => ({
      type,
      enabled: enabledByType.get(type) ?? true,
      scheduledFor: scheduledFor.toISOString(),
    }));

  return (
    <main className="min-h-screen px-5 pb-40 pt-10 text-navy dark:text-wheat sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-[860px]">
        <Link
          className="inline-flex items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-[0.14em] text-navy/55 dark:text-wheat/55 hover:text-cabernet dark:hover:text-[#e4a3ab]"
          href="/hackathons"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Hackathons DB
        </Link>

        <header className="mt-8 flex items-start gap-5">
          <div className="relative grid size-20 shrink-0 place-items-center border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5">
            {hackathon.imageUrl ? (
              <Image
                alt={`${hackathon.name} logo`}
                className="object-contain p-2.5"
                fill
                sizes="80px"
                src={hackathon.imageUrl}
                unoptimized
              />
            ) : (
              <span className="text-xl font-semibold text-cabernet dark:text-[#e4a3ab]">{getInitials(hackathon.name) || "HN"}</span>
            )}
          </div>
          <div className="min-w-0 self-center">
            <h1 className="font-serif text-3xl font-semibold tracking-[-0.02em] text-navy dark:text-wheat sm:text-4xl">{hackathon.name}</h1>
          </div>
        </header>

        <section className="mt-8">
          <p className="px-2 text-sm font-medium text-navy/55 dark:text-wheat/55">Properties</p>
          <div className="mt-2 space-y-0.5">
            <Property icon={CalendarDays} label="Date">
              <span className="font-medium">{formatDateRange(hackathon.startsAt, hackathon.endsAt)}</span>
              <span className="ml-2 text-navy/55 dark:text-wheat/55">
                {formatDuration(hackathon.startsAt, hackathon.endsAt, hackathon.format)}
              </span>
            </Property>

            <Property icon={Clock} label="Application deadline">
              <span className="font-medium">{formatDeadline(hackathon.applicationClosesAt)}</span>
            </Property>

            <Property icon={CalendarClock} label="Applications open">
              <span className="font-medium">{formatDeadline(hackathon.applicationOpensAt)}</span>
            </Property>

            <Property icon={CircleCheck} label="Acceptances out">
              <span className="font-medium">
                {hackathon.acceptanceAt ? formatDeadline(hackathon.acceptanceAt) : "TBA"}
              </span>
            </Property>

            <Property icon={MapPin} label="Location">
              <span className="font-medium">{formatLocation(hackathon)}</span>
              {hackathon.venue ? <span className="ml-2 text-navy/55 dark:text-wheat/55">{hackathon.venue}</span> : null}
            </Property>

            <Property icon={Globe} label="Format">
              <span className="font-medium capitalize">{hackathon.format.replace("_", " ")}</span>
            </Property>

            <Property icon={Trophy} label="Prize">
              <span className="font-medium">
                {hackathon.prizeAmountUsd ? `$${hackathon.prizeAmountUsd.toLocaleString("en-US")} prize pool` : "TBA"}
              </span>
            </Property>

            {hackathon.organizationName ? (
              <Property icon={Landmark} label="Source">
                <span className="font-medium">{hackathon.organizationName}</span>
              </Property>
            ) : null}

            {propertyTags.length ? (
              <Property icon={TagIcon} label="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {propertyTags.map((tag) => (
                    <span
                      className="rounded-full bg-cabernet/5 dark:bg-[#e4a3ab]/10 px-2 py-0.5 text-xs font-medium text-cabernet dark:text-[#e4a3ab]"
                      key={tag}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Property>
            ) : null}

            <Property icon={CircleDot} label="Status">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium"
                style={{ backgroundColor: statusPill.bg, color: statusPill.text }}
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: statusPill.dot }}
                />
                {statusPill.label}
              </span>
            </Property>
          </div>
        </section>

        {hackathon.shortDescription ? (
          <section className="mt-8">
            <p className="px-2 text-sm font-medium text-navy/55 dark:text-wheat/55">Description</p>
            <p className="mt-2 max-w-[640px] px-2 text-base leading-7 text-navy/70 dark:text-wheat/70">
              {hackathon.shortDescription}
            </p>
          </section>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          {hackathon.startsAt ? (
            <AddToCalendarButton
              description={hackathon.shortDescription}
              endsAt={(hackathon.endsAt ?? hackathon.startsAt).toISOString()}
              location={
                hackathon.format === "online"
                  ? "Online"
                  : [hackathon.venue, hackathon.city, hackathon.region, hackathon.country]
                      .filter(Boolean)
                      .join(", ")
              }
              startsAt={hackathon.startsAt.toISOString()}
              title={hackathon.name}
              url={hackathon.websiteUrl}
            />
          ) : null}
          {applyUrl ? (
            <a
              className="inline-flex rounded-full min-h-11 items-center justify-center gap-1.5 border border-cabernet dark:border-[#e4a3ab]/50 bg-cabernet px-6 text-sm font-semibold text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white transition-colors hover:bg-[#5c151c]"
              href={applyUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Website link
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </a>
          ) : null}
          {discordChannelLink ? (
            <a
              className="inline-flex rounded-full min-h-11 items-center justify-center gap-1.5 border border-[#5865F2] bg-[#5865F2] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
              href={discordChannelLink}
              rel="noopener noreferrer"
              target="_blank"
            >
              <DiscordGlyph className="size-4" />
              Chat on Discord
            </a>
          ) : null}
          {hackathon.websiteUrl && hackathon.websiteUrl !== applyUrl ? (
            <a
              className="inline-flex rounded-full min-h-11 items-center justify-center gap-1.5 border border-cabernet dark:border-[#e4a3ab]/50 px-6 text-sm font-semibold text-cabernet dark:text-[#e4a3ab] transition-colors hover:bg-cabernet hover:text-wheat"
              href={hackathon.websiteUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Event website
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </a>
          ) : null}
        </div>

        <section className="mt-8 rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-rust">Your status</h2>
          <p className="mt-2 text-sm text-navy/55 dark:text-wheat/55">
            Set where you are with this hackathon and we&apos;ll remind you about the right deadlines — applications,
            acceptance, and check-in.
          </p>
          <div className="mt-4">
            {user ? (
              <HackathonStatusTracker
                hackathonId={hackathon.id}
                initialStatus={tracked?.applicationStatus ?? null}
              />
            ) : (
              <Link
                className="inline-flex rounded-full min-h-10 items-center justify-center border border-cabernet dark:border-[#e4a3ab]/50 px-5 text-sm font-semibold text-cabernet dark:text-[#e4a3ab] transition-colors hover:bg-cabernet hover:text-wheat"
                href="/sign-in"
              >
                Sign in to track this hackathon
              </Link>
            )}
          </div>
          {user && notificationPreferences.length ? (
            <HackathonNotificationPreferences
              hackathonId={hackathon.id}
              initialPreferences={notificationPreferences}
            />
          ) : null}
          {upcomingReminders.length ? (
            <ul className="mt-5 space-y-2 border-t border-navy/10 dark:border-white/10 pt-4">
              {upcomingReminders.map((reminder) => (
                <li className="flex items-center gap-2 text-sm text-navy/70 dark:text-wheat/70" key={reminder.id}>
                  <BellRing aria-hidden="true" className="size-3.5 shrink-0 text-cabernet dark:text-[#e4a3ab]" />
                  <span>
                    {reminderTypeLabels[reminder.type] ?? reminder.type} · {formatReminderDate(reminder.scheduledFor)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </main>
  );
}
