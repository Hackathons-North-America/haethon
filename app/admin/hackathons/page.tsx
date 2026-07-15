import { PublishedHackathonManager } from "@/components/admin/published-hackathon-manager";
import { listPublishedHackathons } from "@/lib/hackathons/admin-service";

export default async function AdminHackathonsPage() {
  const rows = await listPublishedHackathons();
  const items = rows.map((row) => ({
    ...row,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    applicationOpensAt: row.applicationOpensAt?.toISOString() ?? null,
    applicationClosesAt: row.applicationClosesAt?.toISOString() ?? null,
    acceptanceAt: row.acceptanceAt?.toISOString() ?? null,
  }));

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rust">Live listings</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl font-semibold tracking-[-0.02em] text-navy dark:text-wheat">Hackathons</h1>
            <p className="mt-2 max-w-3xl text-base leading-7 text-navy/55 dark:text-wheat/55">
              Every hackathon currently displayed on the public hackathons page. Edit the details or delete a listing from the
              database.
            </p>
          </div>
          <div className="rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-4 py-3 text-sm font-semibold text-navy dark:text-wheat">
            {items.length} listed
          </div>
        </div>
      </section>

      <PublishedHackathonManager hackathons={items} />
    </div>
  );
}
