import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarPlus } from "lucide-react";

import { OrganizerEmptyState } from "@/components/organizer/overview/organizer-empty-state";
import { OrganizerOverview } from "@/components/organizer/overview/organizer-overview";
import { groupOverviewHackathons, toOverviewHackathon } from "@/components/organizer/overview/overview-format";
import { getCurrentIdentity } from "@/lib/auth";
import { listManagedHackathons, serializeManagedHackathon } from "@/lib/hackathons/organizer-service";

export default async function OrganizerHackathonsPage() {
  const context = await getCurrentIdentity();

  if (!context) {
    redirect("/sign-in");
  }

  const rows = await listManagedHackathons({ userId: context.userId, role: context.role });
  /* One clock for the grouping and the badges, so a row's status always
     matches the section it is listed under. */
  const now = new Date();
  const { current, past } = groupOverviewHackathons(
    rows.map((row) => toOverviewHackathon(serializeManagedHackathon(row))),
    now
  );
  const total = current.length + past.length;

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Your hackathons</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink/55">
            {total
              ? "Open a hackathon to edit its listing, run attendance check-in, and verify attendees."
              : "Edit listings, run attendance check-in, and verify attendees for the events you organize."}
          </p>
        </div>
        {total ? (
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ink/15 bg-surface px-4 text-sm font-semibold text-ink hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            href="/submit"
          >
            <CalendarPlus aria-hidden="true" className="size-4" />
            Submit a hackathon
          </Link>
        ) : null}
      </header>

      {total ? (
        <OrganizerOverview
          current={current}
          now={now.toISOString()}
          past={past}
        />
      ) : (
        <OrganizerEmptyState />
      )}
    </div>
  );
}
