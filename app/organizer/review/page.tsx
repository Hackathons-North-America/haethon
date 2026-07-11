import { redirect } from "next/navigation";
import { Building2, ClipboardCheck } from "lucide-react";

import { SubmissionReviewQueue } from "@/components/admin/submission-review-queue";
import { getCurrentUserContext } from "@/lib/auth";
import { getApprovedOrganizationIdsForUser, listHackathonSubmissions } from "@/lib/hackathons/review-service";

export default async function OrganizerReviewPage() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/sign-in");
  }

  const organizationIds = await getApprovedOrganizationIdsForUser(context.user.id);
  const submissions = await listHackathonSubmissions({ allowedOrganizationIds: organizationIds, limit: 100 });
  const pending = submissions.filter((submission) => submission.status === "pending");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-black/10 bg-white p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#660000]">Organizer console</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold text-black">Organization review queue</h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-[#706F6B]">
              Review submissions connected to your verified organizations.
            </p>
          </div>
          <div className="rounded-lg border border-black/10 bg-[#F7F7F4] px-4 py-3 text-sm font-semibold text-black">
            {organizationIds.length} verified orgs
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-black/10 bg-white p-5">
          <Building2 aria-hidden="true" className="size-5 text-[#660000]" />
          <p className="mt-3 text-sm font-semibold text-[#706F6B]">Verified organizations</p>
          <p className="mt-1 text-3xl font-semibold text-black">{organizationIds.length}</p>
        </div>
        <div className="rounded-lg border border-black/10 bg-white p-5">
          <ClipboardCheck aria-hidden="true" className="size-5 text-[#660000]" />
          <p className="mt-3 text-sm font-semibold text-[#706F6B]">Pending submissions</p>
          <p className="mt-1 text-3xl font-semibold text-black">{pending.length}</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-black">Review queue</h2>
        <SubmissionReviewQueue
          emptyMessage="No pending submissions are connected to your verified organizations."
          endpointBase="/api/organizer/hackathon-submissions"
          submissions={pending}
        />
      </section>
    </div>
  );
}
