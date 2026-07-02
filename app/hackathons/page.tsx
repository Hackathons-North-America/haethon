import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  Code2,
  MapPin,
  Minus,
  Plus,
  Search,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

import { HackathonCard } from "@/components/hackathon-card";
import type { HackathonCardData } from "@/components/hackathon-card";
import { NavAuthLink } from "@/components/nav-auth-link";
import { getCurrentUserRecord } from "@/lib/auth";
import { db } from "@/lib/db";
import { hackathonDates, hackathonLocations, hackathons, userHackathons, userHackathonVotes } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "Hackathons | Hackathons North America",
  description: "Browse upcoming hackathons across North America.",
};

const navItems = [
  { label: "About", href: "/#about" },
  { label: "FQA", href: "/#fqa" },
  { label: "Submit", href: "/submit" },
  { label: "Hackathons", href: "/hackathons" },
];

const navLinkClassName =
  "decoration-[#660000] decoration-1 underline-offset-6 hover:text-[#660000] hover:underline focus-visible:text-[#660000] focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#660000]";

const loginLinkClassName =
  "inline-flex min-h-9 items-center justify-center border border-[#660000] px-4 text-[#660000] transition-colors hover:bg-[#660000] hover:text-white focus-visible:bg-[#660000] focus-visible:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#660000]";

const locationSuggestions = [
  {
    city: "Toronto, Ontario",
    detail: "Strong university and startup scene",
  },
  {
    city: "New York, New York",
    detail: "Major in-person and hybrid events",
  },
  {
    city: "San Francisco, California",
    detail: "AI, infra, and developer tools",
  },
  {
    city: "Montreal, Quebec",
    detail: "Creative coding and applied research",
  },
  {
    city: "Austin, Texas",
    detail: "Builder weekends and sponsor tracks",
  },
];

const dateRangePills = [
  "Exact dates",
  "1 day",
  "+/- 1 day",
  "2 days",
  "+/- 2 days",
  "3 days",
  "+/- 3 days",
  "7 days",
];

const themes = [
  {
    icon: Sparkles,
    name: "AI and agents",
    detail: "Model apps, evals, automation",
  },
  {
    icon: Code2,
    name: "Developer tools",
    detail: "Infra, APIs, cloud, DX",
  },
  {
    icon: Trophy,
    name: "Social impact",
    detail: "Climate, civic tech, health",
  },
  {
    icon: Users,
    name: "Student friendly",
    detail: "Mentors, beginner tracks",
  },
];

const teamRows = [
  {
    label: "Participants",
    detail: "People on your team",
    value: "0",
  },
  {
    label: "Experience",
    detail: "Beginner to advanced",
    value: "Any",
  },
  {
    label: "Team size",
    detail: "Solo or group builds",
    value: "Any",
  },
];

const publicStatuses = ["upcoming", "live"] as const;
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateRange(startsAt: Date | null, endsAt: Date | null) {
  if (!startsAt) {
    return "Dates TBA";
  }

  const start = {
    day: startsAt.getUTCDate(),
    month: monthNames[startsAt.getUTCMonth()],
    year: startsAt.getUTCFullYear(),
  };

  if (!endsAt) {
    return `${start.month} ${start.day}, ${start.year}`;
  }

  const end = {
    day: endsAt.getUTCDate(),
    month: monthNames[endsAt.getUTCMonth()],
    year: endsAt.getUTCFullYear(),
  };

  if (start.year === end.year && start.month === end.month && start.day === end.day) {
    return `${start.month} ${start.day}, ${start.year}`;
  }

  if (start.year === end.year && start.month === end.month) {
    return `${start.month} ${start.day}-${end.day}, ${start.year}`;
  }

  if (start.year === end.year) {
    return `${start.month} ${start.day}-${end.month} ${end.day}, ${start.year}`;
  }

  return `${start.month} ${start.day}, ${start.year}-${end.month} ${end.day}, ${end.year}`;
}

function formatDuration(startsAt: Date | null, endsAt: Date | null, format: string) {
  const formatLabel = format.replace("_", " ");

  if (!startsAt || !endsAt) {
    return `Duration TBA · ${formatLabel}`;
  }

  const hours = Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 3_600_000));
  const duration = hours <= 96 ? `${hours} hours` : `${Math.ceil(hours / 24)} days`;

  return `${duration} · ${formatLabel}`;
}

function formatLocation({
  city,
  country,
  format,
  region,
  venue,
}: {
  city: string | null;
  country: string | null;
  format: string;
  region: string | null;
  venue: string | null;
}) {
  if (format === "online") {
    return "Online";
  }

  const locality = [city, region].filter(Boolean).join(", ");

  return locality || venue || country || "Location TBA";
}

function buildBadges({
  beginnerFriendly,
  format,
  status,
  travelReimbursement,
}: {
  beginnerFriendly: boolean;
  format: string;
  status: string;
  travelReimbursement: boolean;
}) {
  return [
    status === "live" ? "Live now" : "Upcoming",
    format.replace("_", " "),
    beginnerFriendly ? "Beginner friendly" : null,
    travelReimbursement ? "Travel support" : null,
  ].filter(Boolean) as string[];
}

async function getHackathonCards(): Promise<HackathonCardData[]> {
  const user = await getCurrentUserRecord();
  const rows = await db
    .select({
      id: hackathons.id,
      name: hackathons.name,
      shortDescription: hackathons.shortDescription,
      venue: hackathons.venue,
      format: hackathons.format,
      status: hackathons.status,
      beginnerFriendly: hackathons.beginnerFriendly,
      travelReimbursement: hackathons.travelReimbursement,
      voteScore: hackathons.voteScore,
      city: hackathonLocations.city,
      region: hackathonLocations.region,
      country: hackathonLocations.country,
      startsAt: hackathonDates.startsAt,
      endsAt: hackathonDates.endsAt,
    })
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(and(isNotNull(hackathons.publishedAt), inArray(hackathons.status, publicStatuses)))
    .orderBy(asc(hackathonDates.startsAt))
    .limit(48);

  const hackathonIds = rows.map((row) => row.id);
  const [savedRows, voteRows] =
    user && hackathonIds.length
      ? await Promise.all([
          db
            .select({
              hackathonId: userHackathons.hackathonId,
              isSaved: userHackathons.isSaved,
            })
            .from(userHackathons)
            .where(and(eq(userHackathons.userId, user.id), inArray(userHackathons.hackathonId, hackathonIds))),
          db
            .select({
              hackathonId: userHackathonVotes.hackathonId,
              vote: userHackathonVotes.vote,
            })
            .from(userHackathonVotes)
            .where(and(eq(userHackathonVotes.userId, user.id), inArray(userHackathonVotes.hackathonId, hackathonIds))),
        ])
      : [[], []];

  const savedByHackathon = new Map(savedRows.map((row) => [row.hackathonId, row.isSaved]));
  const voteByHackathon = new Map(voteRows.map((row) => [row.hackathonId, row.vote]));

  return rows.map((row) => ({
    badges: buildBadges(row),
    date: formatDateRange(row.startsAt, row.endsAt),
    description: row.shortDescription ?? "Event details are being verified by the Hackathons North America team.",
    duration: formatDuration(row.startsAt, row.endsAt, row.format),
    id: row.id,
    image: null,
    isSaved: savedByHackathon.get(row.id) ?? false,
    location: formatLocation(row),
    name: row.name,
    userVote: (voteByHackathon.get(row.id) ?? 0) as -1 | 0 | 1,
    voteScore: row.voteScore,
  }));
}

type SearchFieldProps = {
  children: React.ReactNode;
  label: string;
  panelClassName?: string;
  value: string;
};

function SearchField({
  children,
  label,
  panelClassName = "",
  value,
}: SearchFieldProps) {
  return (
    <details className="group relative min-w-0 flex-1" name="hackathon-search">
      <summary className="flex h-full min-h-[4.2rem] cursor-pointer list-none flex-col justify-center rounded-[2rem] px-6 py-3 text-left outline-none hover:bg-[#F7F7F4] focus-visible:bg-[#F7F7F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#660000]/35 group-open:bg-[#F7F7F4] [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-semibold leading-5 text-black">
          {label}
        </span>
        <span className="truncate text-sm leading-5 text-[#706F6B]">
          {value}
        </span>
      </summary>
      <div
        className={`z-50 mt-3 hidden rounded-[2rem] border border-black/10 bg-white p-4 text-black shadow-[0_18px_60px_rgba(0,0,0,0.18)] group-open:block md:absolute md:top-full ${panelClassName}`}
      >
        {children}
      </div>
    </details>
  );
}

function WhereDropdown() {
  return (
    <div className="w-full md:w-[360px]">
      <p className="px-2 pb-3 text-sm font-semibold">Suggested locations</p>
      <div className="space-y-1">
        {locationSuggestions.map((suggestion) => (
          <button
            className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-[#F7F7F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#660000]/35"
            key={suggestion.city}
            type="button"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#F7F7F4] text-[#660000]">
              <MapPin aria-hidden="true" className="size-5" strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {suggestion.city}
              </span>
              <span className="block truncate text-sm text-[#706F6B]">
                {suggestion.detail}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({
  days,
  month,
  offset,
}: {
  days: number;
  month: string;
  offset: number;
}) {
  return (
    <div>
      <h3 className="mb-4 text-center text-sm font-semibold">{month}</h3>
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-[#706F6B]">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
          <span className="py-2" key={`${month}-${day}-${index}`}>
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {Array.from({ length: offset }).map((_, index) => (
          <span aria-hidden="true" key={`${month}-blank-${index}`} />
        ))}
        {Array.from({ length: days }).map((_, index) => {
          const day = index + 1;
          const isHighlighted =
            (month === "July 2026" && day >= 24 && day <= 26) ||
            (month === "August 2026" && day >= 21 && day <= 23);

          return (
            <button
              className={`mx-auto grid size-9 place-items-center rounded-full hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#660000]/35 ${
                isHighlighted ? "bg-black text-white" : "text-black"
              }`}
              key={`${month}-${day}`}
              type="button"
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WhenDropdown() {
  return (
    <div className="w-full md:w-[680px]">
      <div className="mx-auto mb-5 grid w-fit grid-cols-2 rounded-full bg-[#F7F7F4] p-1 text-sm font-semibold">
        <button className="rounded-full bg-white px-8 py-2 shadow-sm" type="button">
          Dates
        </button>
        <button className="rounded-full px-8 py-2 text-[#706F6B]" type="button">
          Flexible
        </button>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <MonthGrid days={31} month="July 2026" offset={3} />
        <MonthGrid days={31} month="August 2026" offset={6} />
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
        {dateRangePills.map((range, index) => (
          <button
            className={`shrink-0 rounded-full border px-4 py-2 text-sm ${
              index === 0
                ? "border-black bg-black text-white"
                : "border-black/15 text-black hover:border-black"
            }`}
            key={range}
            type="button"
          >
            {range}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThemeDropdown() {
  return (
    <div className="w-full md:w-[420px]">
      <p className="px-2 pb-3 text-sm font-semibold">Browse by track</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {themes.map((theme) => (
          <button
            className="rounded-2xl border border-black/10 p-4 text-left hover:border-black hover:bg-[#F7F7F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#660000]/35"
            key={theme.name}
            type="button"
          >
            <theme.icon
              aria-hidden="true"
              className="mb-4 size-5 text-[#660000]"
              strokeWidth={2}
            />
            <span className="block text-sm font-semibold">{theme.name}</span>
            <span className="mt-1 block text-sm leading-5 text-[#706F6B]">
              {theme.detail}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TeamDropdown() {
  return (
    <div className="w-full md:w-[420px]">
      {teamRows.map((row, index) => (
        <div
          className={`flex items-center justify-between gap-6 py-4 ${
            index === 0 ? "" : "border-t border-black/10"
          }`}
          key={row.label}
        >
          <div>
            <h3 className="text-sm font-semibold">{row.label}</h3>
            <p className="mt-1 text-sm text-[#706F6B]">{row.detail}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              aria-label={`Decrease ${row.label}`}
              className="grid size-8 place-items-center rounded-full border border-black/20 text-[#706F6B]"
              type="button"
            >
              <Minus aria-hidden="true" className="size-3.5" />
            </button>
            <span className="min-w-8 text-center text-sm">{row.value}</span>
            <button
              aria-label={`Increase ${row.label}`}
              className="grid size-8 place-items-center rounded-full border border-black text-black"
              type="button"
            >
              <Plus aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchNavigation() {
  return (
    <section
      aria-label="Hackathon filters"
      className="bg-white px-5 pb-7 pt-14 sm:pt-16"
    >
      <div className="mx-auto max-w-[1080px]">
        <div className="relative z-30 flex flex-col rounded-[2.35rem] border border-black/10 bg-white p-2 shadow-[0_10px_36px_rgba(0,0,0,0.14)] md:flex-row md:items-stretch">
          <SearchField
            label="Where"
            panelClassName="md:left-0"
            value="Search destinations"
          >
            <WhereDropdown />
          </SearchField>

          <SearchField
            label="When"
            panelClassName="md:left-1/2 md:-translate-x-1/2"
            value="Add dates"
          >
            <WhenDropdown />
          </SearchField>

          <SearchField
            label="Theme"
            panelClassName="md:left-1/2 md:-translate-x-1/2"
            value="Choose a track"
          >
            <ThemeDropdown />
          </SearchField>

          <SearchField
            label="Team"
            panelClassName="md:right-0"
            value="Add builders"
          >
            <TeamDropdown />
          </SearchField>

          <div className="flex items-center px-2 py-2 md:px-3">
            <button
              aria-label="Search hackathons"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#D9043D] px-5 text-sm font-semibold text-white hover:bg-[#B80033] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#660000]/35 md:size-12 md:min-h-0 md:px-0"
              type="button"
            >
              <Search aria-hidden="true" className="size-5" strokeWidth={2.5} />
              <span className="md:sr-only">Search</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function HackathonsPage() {
  const hackathonCards = await getHackathonCards();

  return (
    <main className="min-h-screen bg-white text-black">
      <header className="sticky top-0 z-40 bg-white">
        <nav
          aria-label="Primary navigation"
          className="border-b border-black/10 bg-white px-8 font-mono text-xs font-medium uppercase tracking-[0.14em] text-[#706F6B] sm:px-14 lg:px-20"
        >
          <div className="mx-auto flex min-h-20 max-w-[1120px] flex-col items-start justify-center gap-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-0">
            <Link
              className={`${navLinkClassName} font-serif text-xl font-semibold normal-case leading-none tracking-normal text-black sm:text-2xl`}
              href="/"
            >
              Hackathons North America
            </Link>

            <div className="flex flex-wrap items-center justify-start gap-x-5 gap-y-3 sm:justify-end sm:gap-x-8">
              {navItems.map((item) => (
                <Link
                  aria-current={item.href === "/hackathons" ? "page" : undefined}
                  className={`${navLinkClassName} ${
                    item.href === "/hackathons" ? "text-[#660000] underline" : ""
                  }`}
                  href={item.href}
                  key={item.label}
                >
                  {item.label}
                </Link>
              ))}
              <NavAuthLink className={loginLinkClassName} />
            </div>
          </div>
        </nav>
      </header>

      <SearchNavigation />

      <section className="px-5 pb-16 pt-10 sm:px-8 sm:pb-20 lg:px-12">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-7">
            <h1 className="text-3xl font-semibold tracking-normal text-black sm:text-4xl">
              Upcoming hackathons
            </h1>
          </div>

          {hackathonCards.length ? (
            <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {hackathonCards.map((hackathon, index) => (
                <HackathonCard hackathon={hackathon} index={index} key={hackathon.id} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-black/10 bg-[#F7F7F4] p-8 text-center">
              <h2 className="text-xl font-semibold text-black">No published hackathons yet</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#706F6B]">
                Approved hackathons from the database will appear here as soon as they are published.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
