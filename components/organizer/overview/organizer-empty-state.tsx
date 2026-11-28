import Link from "next/link";
import { BadgeCheck, Building2, CalendarPlus, Search } from "lucide-react";

const ways = [
  {
    icon: Building2,
    title: "Your organization",
    body: "Every hackathon belonging to an organization you're a verified member of is listed here.",
  },
  {
    icon: BadgeCheck,
    title: "An approved organizer claim",
    body: "Once the HNA team confirms you run a listed hackathon, it joins your console.",
  },
];

/* Shown when an organizer has nothing to manage yet: explains how access is
   granted (lib/hackathons/organizer-service.ts listManagedHackathons) and
   points at the submit flow, which publishes straight away for verified
   organization members and is reviewed otherwise. */
export function OrganizerEmptyState() {
  return (
    <section
      aria-labelledby="organizer-empty-title"
      className="rounded-2xl border border-dashed border-ink/15 bg-surface px-5 py-10 text-center sm:px-10 sm:py-14"
    >
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-pine-soft text-pine">
        <CalendarPlus aria-hidden="true" className="size-6" />
      </div>
      <h2 className="mt-4 text-lg font-semibold tracking-tight text-ink" id="organizer-empty-title">
        No hackathons to manage yet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink/55">
        Hackathons appear here once your account is linked to them. There are two ways that happens:
      </p>

      <ul className="mx-auto mt-6 grid max-w-2xl gap-3 text-left sm:grid-cols-2">
        {ways.map(({ body, icon: Icon, title }) => (
          <li className="flex gap-3 rounded-2xl border border-ink/10 bg-paper p-4" key={title}>
            <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-pine" />
            <div>
              <p className="text-sm font-semibold text-ink">{title}</p>
              <p className="mt-1 text-sm leading-6 text-ink/55">{body}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mx-auto mt-6 max-w-md text-sm leading-6 text-ink/55">
        Running an event that isn&apos;t listed? Submit it under your organization&apos;s name. Verified members
        publish straight away; anything else is reviewed by the HNA team first.
      </p>

      <div className="mt-6 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-pine px-5 text-sm font-semibold text-paper hover:bg-pine/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
          href="/submit"
        >
          <CalendarPlus aria-hidden="true" className="size-4" />
          Submit a hackathon
        </Link>
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ink/15 px-5 text-sm font-semibold text-ink hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
          href="/hackathons"
        >
          <Search aria-hidden="true" className="size-4" />
          Browse hackathons
        </Link>
      </div>
    </section>
  );
}
