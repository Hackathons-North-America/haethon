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
      <section className="rounded-lg border border-black/10 bg-white p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#660000]">Organizer console</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold text-black">My hackathons</h1>
            <p className="mt-2 max-w-3xl text-base leading-7 text-[#706F6B]">
              The hackathons you organize. Edit the public details, manage attendance check-in codes, and verify
              attendees.
            </p>
          </div>
          <div className="rounded-lg border border-black/10 bg-[#F7F7F4] px-4 py-3 text-sm font-semibold text-black">
            {current.length + past.length} total
          </div>
        </div>
      </section>

      <OrganizerHackathonManager current={current} past={past} />
    </div>
  );
}
