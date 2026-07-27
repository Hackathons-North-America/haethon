import Link from "next/link";

import { SubmissionReviewQueue } from "@/components/admin/submission-review-queue";
import { listHackathonSubmissions } from "@/lib/hackathons/review-service";

// This page is only for hackathons people submitted through the public form.
// Two kinds of admin-imported records are kept out because they belong to other
// surfaces: broken scraped imports have their own queue on /admin/broken
// (importReason / needsFix), and successful admin imports are handled entirely on
// /admin/import (origin: "admin_import").
function isFormSubmission(payload: Record<string, unknown>) {
  return !payload.importReason && !payload.needsFix && payload.origin !== "admin_import";
}

const statusStyles: Record<string, string> = {
  pending: "bg-ink/10 text-ink/70",
  approved: "bg-pine/10 text-pine",
  merged: "bg-pine/10 text-pine",
  rejected: "bg-pine/10 text-pine",
  withdrawn: "bg-ink/10 text-ink/55",
};

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default async function AdminSubmissionsPage() {
  const submissions = await listHackathonSubmissions({ limit: 200 });
  const formSubmissions = submissions.filter((submission) => isFormSubmission(submission.payload));
  const pending = formSubmissions.filter((submission) => submission.status === "pending");
  const approvedCount = formSubmissions.filter(
    (submission) => submission.status === "approved" || submission.status === "merged"
  ).length;
  const rejectedCount = formSubmissions.filter((submission) => submission.status === "rejected").length;

  return (
    <div className="space-y-6">
      <section className="border border-ink/15 bg-paper p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">Submission requests</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-medium tracking-tight text-ink">Hackathon requests</h1>
            <p className="mt-2 max-w-3xl text-base leading-7 text-ink/55">
              Hackathons submitted through the public form. Community submitters only give us a name and link. Fill in the
              date, province, location, and the rest, then approve to publish or deny with a reason.
            </p>
          </div>
          <div className="border border-ink/15 bg-paper px-4 py-3 text-sm font-semibold text-ink">
            {pending.length} pending
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="border border-ink/15 bg-paper p-5">
          <p className="text-sm font-semibold text-ink/55">Pending</p>
          <p className="mt-1 text-3xl font-semibold text-ink">{pending.length}</p>
        </div>
        <div className="border border-ink/15 bg-paper p-5">
          <p className="text-sm font-semibold text-ink/55">Approved</p>
          <p className="mt-1 text-3xl font-semibold text-ink">{approvedCount}</p>
        </div>
        <div className="border border-ink/15 bg-paper p-5">
          <p className="text-sm font-semibold text-ink/55">Denied</p>
          <p className="mt-1 text-3xl font-semibold text-ink">{rejectedCount}</p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-medium tracking-tight text-ink">Review queue</h2>
          <p className="text-sm text-ink/55">One request at a time</p>
        </div>
        <SubmissionReviewQueue
          allowDeleteExisting
          emptyMessage="No pending requests. New form submissions will appear here for review."
          endpointBase="/api/admin/hackathon-submissions"
          submissions={pending}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-medium tracking-tight text-ink">All requests</h2>
        <div className="overflow-x-auto border border-ink/15 bg-paper">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/15 text-xs font-semibold uppercase tracking-[0.14em] text-ink/55">
                <th className="px-4 py-3">Hackathon</th>
                <th className="px-4 py-3">Submitter</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {formSubmissions.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-ink/55" colSpan={5}>
                    No requests yet.
                  </td>
                </tr>
              ) : (
                formSubmissions.map((submission) => (
                  <tr className="border-b border-ink/10 last:border-b-0" key={submission.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{submission.normalizedName}</p>
                      <Link
                        className="text-xs text-pine hover:underline"
                        href={submission.websiteUrl}
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        {submission.websiteUrl}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink/70">{submission.submitterEmail ?? "Unknown"}</td>
                    <td className="px-4 py-3 capitalize text-ink/70">{submission.submitterType}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2.5 py-1 text-xs font-semibold capitalize ${
                          statusStyles[submission.status] ?? statusStyles.withdrawn
                        }`}
                      >
                        {submission.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink/55">{formatDate(submission.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
