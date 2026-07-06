import { HackathonFixJsonImporter } from "@/components/admin/hackathon-fix-json-importer";
import { SubmissionReviewQueue } from "@/components/admin/submission-review-queue";
import { listHackathonSubmissions } from "@/lib/hackathons/review-service";

function needsFix(payload: Record<string, unknown>) {
  return Boolean(payload.importReason || payload.needsFix);
}

export default async function AdminBrokenPage() {
  const submissions = await listHackathonSubmissions({ limit: 200 });
  const fixQueue = submissions.filter((submission) => submission.status === "pending" && needsFix(submission.payload));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-black/10 bg-white p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#660000]">Broken imports</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold text-black">Fix broken JSON</h1>
            <p className="mt-2 max-w-3xl text-base leading-7 text-[#706F6B]">
              Upload broken scraped records, edit the generated fields, compare them against the final card preview, then approve or reject each one.
            </p>
          </div>
          <div className="rounded-lg border border-black/10 bg-[#F7F7F4] px-4 py-3 text-sm font-semibold text-black">
            {fixQueue.length} pending
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-black/10 bg-white p-6">
        <HackathonFixJsonImporter />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold text-black">Fix queue</h2>
          <p className="text-sm text-[#706F6B]">One broken item at a time</p>
        </div>
        <SubmissionReviewQueue
          emptyMessage="No imported JSON records need fixes."
          endpointBase="/api/admin/hackathon-submissions"
          submissions={fixQueue}
        />
      </section>
    </div>
  );
}
