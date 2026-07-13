import { redirect } from "next/navigation";

import { OrganizerHackathonManager } from "@/components/organizer/organizer-hackathon-manager";
import { getCurrentUserContext } from "@/lib/auth";
import { listManagedHackathons, splitManagedHackathons } from "@/lib/hackathons/organizer-service";

export default async function OrganizerHackathonsPage() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/sign-in");
  }

  const rows = await listManagedHackathons({ userId: context.user.id, role: context.role });
  const { current, past } = splitManagedHackathons(rows);

  return (
    <div className="space-y-6">
      <section className="rounded-xl p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rust">Organizer console</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl font-semibold tracking-[-0.02em] text-navy dark:text-wheat">My hackathons</h1>
            <p className="mt-2 max-w-3xl text-base leading-7 text-navy/55 dark:text-wheat/55">
              The hackathons you organize. Edit the public details, manage attendance check-in codes, and verify
              attendees.
            </p>
          </div>
          <div className="rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-4 py-3 text-sm font-semibold text-navy dark:text-wheat">
            {current.length + past.length} total
          </div>
        </div>
      </section>

      <OrganizerHackathonManager current={current} past={past} />
    </div>
  );
}
