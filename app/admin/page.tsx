import { redirect } from "next/navigation";
import { ClipboardCheck, GitMerge, ShieldCheck, Trophy, XCircle } from "lucide-react";

import { SubmissionReviewCard } from "@/components/admin/submission-review-card";
import { requireAdminUser } from "@/lib/auth";
import { listHackathonSubmissions } from "@/lib/hackathons/review-service";
import { dateToInputValue } from "@/lib/hackathons/utils";

export default async function AdminPage() {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    redirect(gate.reason === "unauthenticated" ? "/sign-in" : "/");
  }

  const submissions = await listHackathonSubmissions({ limit: 200 });
  const pending = submissions.filter((submission) => submission.status === "pending");
  const duplicateCandidates = submissions.filter((submission) => Number(submission.duplicateScore ?? 0) >= 0.55);
  const recentlyApproved = submissions.filter((submission) => submission.status === "approved" || submission.status === "merged").slice(0, 6);
  const recentlyRejected = submissions.filter((submission) => submission.status === "rejected").slice(0, 6);

  return (
    <main className="min-h-screen bg-[#EFEDEA] px-5 py-8 text-black sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="rounded-lg border border-black/10 bg-white p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#660000]">Admin console</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold text-black">Hackathon review queue</h1>
              <p className="mt-2 max-w-3xl text-base leading-7 text-[#706F6B]">
                Review community tips and organizer submissions, approve new listings, merge duplicates, and reject low-quality submissions.
              </p>
            </div>
            <div className="rounded-lg border border-black/10 bg-[#F7F7F4] px-4 py-3 text-sm font-semibold text-black">
              {pending.length} pending
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Pending", value: pending.length, icon: ClipboardCheck },
            { label: "Duplicate candidates", value: duplicateCandidates.length, icon: GitMerge },
            { label: "Approved or merged", value: recentlyApproved.length, icon: ShieldCheck },
            { label: "Rejected", value: recentlyRejected.length, icon: XCircle },
          ].map(({ label, value, icon: Icon }) => (
            <div className="rounded-lg border border-black/10 bg-white p-5" key={label}>
              <Icon aria-hidden="true" className="size-5 text-[#660000]" />
              <p className="mt-3 text-sm font-semibold text-[#706F6B]">{label}</p>
              <p className="mt-1 text-3xl font-semibold text-black">{value}</p>
            </div>
          ))}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold text-black">Review queue</h2>
            <p className="text-sm text-[#706F6B]">Organizer and community submissions</p>
          </div>
          {pending.length ? (
            <div className="space-y-4">
              {pending.map((submission) => (
                <SubmissionReviewCard endpointBase="/api/admin/hackathon-submissions" key={submission.id} submission={submission} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-black/10 bg-white p-5 text-sm text-[#706F6B]">No pending submissions.</div>
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-lg border border-black/10 bg-white p-5">
            <h2 className="text-xl font-semibold text-black">Duplicate candidates</h2>
            <div className="mt-4 space-y-3">
              {duplicateCandidates.slice(0, 8).map((submission) => (
                <div className="rounded-lg border border-black/10 bg-[#F7F7F4] p-4" key={submission.id}>
                  <p className="font-semibold text-black">{submission.normalizedName}</p>
                  <p className="mt-1 text-sm text-[#706F6B]">
                    Score {submission.duplicateScore ?? "0.00"} · Matched ID {submission.matchedHackathonId ?? "none"}
                  </p>
                </div>
              ))}
              {!duplicateCandidates.length ? <p className="text-sm text-[#706F6B]">No likely duplicates yet.</p> : null}
            </div>
          </div>

          <div className="rounded-lg border border-black/10 bg-white p-5">
            <h2 className="text-xl font-semibold text-black">Recent decisions</h2>
            <div className="mt-4 space-y-3">
              {[...recentlyApproved, ...recentlyRejected].slice(0, 8).map((submission) => (
                <div className="rounded-lg border border-black/10 bg-[#F7F7F4] p-4" key={submission.id}>
                  <p className="font-semibold text-black">{submission.normalizedName}</p>
                  <p className="mt-1 text-sm capitalize text-[#706F6B]">
                    {submission.status} · {dateToInputValue(submission.reviewedAt ?? submission.createdAt)}
                  </p>
                </div>
              ))}
              {!recentlyApproved.length && !recentlyRejected.length ? (
                <p className="text-sm text-[#706F6B]">Reviewed submissions will appear here.</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-black/10 bg-white p-5">
          <div className="flex items-center gap-2">
            <Trophy aria-hidden="true" className="size-5 text-[#660000]" />
            <h2 className="text-xl font-semibold text-black">Verified results management</h2>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#706F6B]">
            Verified wins are backed by `hackathon_results`. The next admin increment can add a dedicated result entry form here once event detail pages exist.
          </p>
        </section>
      </div>
    </main>
  );
}
