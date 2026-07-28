import { HackathonFixWorkspace } from "@/components/admin/hackathon-fix-json-importer";
import { listHackathonSubmissions } from "@/lib/hackathons/review-service";

function needsFix(payload: Record<string, unknown>) {
  return Boolean(payload.importReason || payload.needsFix);
}

export default async function AdminBrokenPage() {
  const submissions = await listHackathonSubmissions({ limit: 200 });
  const fixQueue = submissions.filter((submission) => submission.status === "pending" && needsFix(submission.payload));

  return (
    <div className="space-y-6">
      <section className="border border-ink/15 bg-paper p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">Broken imports</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-medium tracking-tight text-ink">Fix broken JSON</h1>
            <p className="mt-2 max-w-3xl text-base leading-7 text-ink/55">
              Upload broken scraped records, edit the generated fields, compare them against the final card preview, then
              approve, reject, or merge each one.
            </p>
          </div>
          <div className="border border-ink/15 bg-paper px-4 py-3 text-sm font-semibold text-ink">
            {fixQueue.length} pending
          </div>
        </div>
      </section>

      <HackathonFixWorkspace pendingSubmissions={fixQueue} />
    </div>
  );
}
