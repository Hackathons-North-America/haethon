import { redirect } from "next/navigation";
import { Building2, ClipboardCheck, ShieldQuestion } from "lucide-react";

import { SubmissionReviewQueue } from "@/components/admin/submission-review-queue";
import { StatCard, StatStrip } from "@/components/organizer/shell/stat-card";
import { getCurrentIdentity } from "@/lib/auth";
import { getApprovedOrganizationIdsForUser, listHackathonSubmissions } from "@/lib/hackathons/review-service";

export default async function OrganizerReviewPage() {
  const context = await getCurrentIdentity();

  if (!context) {
    redirect("/sign-in");
  }

  const organizationIds = await getApprovedOrganizationIdsForUser(context.userId);
  const submissions = await listHackathonSubmissions({ allowedOrganizationIds: organizationIds, limit: 100 });
  const pending = submissions.filter((submission) => submission.status === "pending");

  return (
    <div className="space-y-6 sm:space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Review queue</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink/55">
          Approve or reject hackathons submitted under the organizations you&apos;re a verified member of.
        </p>
      </header>

      {/* No "Reviewed" figure: the list above is capped at 100 rows, so a
          count derived from it would silently stop at the cap. */}
      <StatStrip label="Review queue counts">
        <StatCard icon={ClipboardCheck} label="Pending" value={pending.length} />
        <StatCard icon={Building2} label="Your orgs" value={organizationIds.length} />
      </StatStrip>

      {organizationIds.length ? (
        <section aria-labelledby="organizer-review-queue" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-base font-semibold text-ink sm:text-lg" id="organizer-review-queue">
              Pending submissions
            </h2>
            <p className="text-sm text-ink/55">One submission at a time</p>
          </div>
          <SubmissionReviewQueue
            emptyMessage="You're all caught up. New submissions for your organizations will appear here."
            endpointBase="/api/organizer/hackathon-submissions"
            submissions={pending}
          />
        </section>
      ) : (
        <section
          aria-labelledby="organizer-review-empty"
          className="rounded-2xl border border-dashed border-ink/15 bg-surface px-5 py-10 text-center sm:px-10"
        >
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-pine-soft text-pine">
            <ShieldQuestion aria-hidden="true" className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold tracking-tight text-ink" id="organizer-review-empty">
            No verified organizations yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink/55">
            This queue holds submissions made under organizations you&apos;re a verified member of. Once the HNA team
            verifies your membership, anything submitted for that organization lands here for you to review.
          </p>
        </section>
      )}
    </div>
  );
}
