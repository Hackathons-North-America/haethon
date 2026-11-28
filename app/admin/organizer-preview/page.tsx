import { OrganizerPreview } from "@/components/organizer/organizer-preview";
import { listPublishedHackathons } from "@/lib/hackathons/admin-service";
import { serializeManagedHackathon } from "@/lib/hackathons/organizer-service";

export default async function AdminOrganizerPreviewPage() {
  const rows = await listPublishedHackathons();
  const hackathons = rows.map(serializeManagedHackathon);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* The admin layout already pads the page, so the header sits flush
          rather than in its own padded section. */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/55">Organizer preview</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">See the organizer view</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink/55">
            Select a hackathon to see exactly what its organizer sees and can edit in the organizer console.
          </p>
        </div>
        <p className="rounded-full border border-ink/10 bg-surface px-3 py-1.5 text-sm font-medium tabular-nums text-ink/70">
          {hackathons.length} {hackathons.length === 1 ? "hackathon" : "hackathons"}
        </p>
      </header>

      <OrganizerPreview hackathons={hackathons} />
    </div>
  );
}
