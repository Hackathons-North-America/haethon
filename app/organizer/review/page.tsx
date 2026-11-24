import { redirect } from "next/navigation";
import { Building2, ClipboardCheck } from "lucide-react";

import { SubmissionReviewQueue } from "@/components/admin/submission-review-queue";
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
    <div className="space-y-6">
      <section className="border border-ink/15 bg-paper p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">Organizer console</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-medium tracking-tight text-ink">Organization review queue</h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-ink/55">
              Review submissions connected to your verified organizations.
            </p>
          </div>
          <div className="border border-ink/15 bg-paper px-4 py-3 text-sm font-semibold text-ink">
            {organizationIds.length} verified orgs
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="border border-ink/15 bg-paper p-5">
          <Building2 aria-hidden="true" className="size-5 text-pine" />
          <p className="mt-3 text-sm font-semibold text-ink/55">Verified organizations</p>
          <p className="mt-1 text-3xl font-semibold text-ink">{organizationIds.length}</p>
        </div>
        <div className="border border-ink/15 bg-paper p-5">
          <ClipboardCheck aria-hidden="true" className="size-5 text-pine" />
          <p className="mt-3 text-sm font-semibold text-ink/55">Pending submissions</p>
          <p className="mt-1 text-3xl font-semibold text-ink">{pending.length}</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-medium tracking-tight text-ink">Review queue</h2>
        <SubmissionReviewQueue
          emptyMessage="No pending submissions are connected to your verified organizations."
          endpointBase="/api/organizer/hackathon-submissions"
          submissions={pending}
        />
      </section>
    </div>
  );
}
