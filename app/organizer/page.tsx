import { redirect } from "next/navigation";

import { OrganizerHackathonManager } from "@/components/organizer/organizer-hackathon-manager";
import { getCurrentIdentity } from "@/lib/auth";
import { listManagedHackathons, splitManagedHackathons } from "@/lib/hackathons/organizer-service";

export default async function OrganizerHackathonsPage() {
  const context = await getCurrentIdentity();

  if (!context) {
    redirect("/sign-in");
  }

  const rows = await listManagedHackathons({ userId: context.userId, role: context.role });
  const { current, past } = splitManagedHackathons(rows);

  return (
    <div className="space-y-6">
      <section className="p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">Organizer console</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-medium tracking-tight text-ink">My hackathons</h1>
            <p className="mt-2 max-w-3xl text-base leading-7 text-ink/55">
              The hackathons you organize. Edit the public details, manage attendance check in codes, and verify
              attendees.
            </p>
          </div>
          <div className="border border-ink/15 bg-paper px-4 py-3 text-sm font-semibold text-ink">
            {current.length + past.length} total
          </div>
        </div>
      </section>

      <OrganizerHackathonManager current={current} past={past} />
    </div>
  );
}
