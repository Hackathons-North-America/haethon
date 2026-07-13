import { OrganizerPreview } from "@/components/organizer/organizer-preview";
import { listPublishedHackathons } from "@/lib/hackathons/admin-service";
import { serializeManagedHackathon } from "@/lib/hackathons/organizer-service";

export default async function AdminOrganizerPreviewPage() {
  const rows = await listPublishedHackathons();
  const hackathons = rows.map(serializeManagedHackathon);

  return (
    <div className="space-y-6">
      <section className="rounded-xl p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rust">Organizer preview</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl font-semibold tracking-[-0.02em] text-navy dark:text-wheat">See the organizer view</h1>
            <p className="mt-2 max-w-3xl text-base leading-7 text-navy/55 dark:text-wheat/55">
              Select a hackathon to see exactly what its organizer sees and can edit in the organizer console.
            </p>
          </div>
          <div className="rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-4 py-3 text-sm font-semibold text-navy dark:text-wheat">
            {hackathons.length} {hackathons.length === 1 ? "hackathon" : "hackathons"}
          </div>
        </div>
      </section>

      <OrganizerPreview hackathons={hackathons} />
    </div>
  );
}
