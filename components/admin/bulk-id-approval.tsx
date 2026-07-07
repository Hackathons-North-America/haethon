"use client";

import { FormEvent, useMemo, useState } from "react";
import { ClipboardCheck, Search } from "lucide-react";

import { SubmissionReviewQueue } from "@/components/admin/submission-review-queue";

type SubmissionReviewItem = {
  id: string;
  submitterEmail: string | null;
  submitterType: "organizer" | "community";
  organizationName: string | null;
  matchedHackathonId: string | null;
  approvedHackathonId?: string | null;
  status: "pending" | "approved" | "rejected" | "merged" | "withdrawn";
  payload: Record<string, unknown>;
  normalizedName: string;
  websiteUrl: string;
  sourceUrl: string;
  duplicateScore: string | null;
  createdAt: Date | string;
};

function parseIds(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );
}

export function BulkIdApproval({ submissions }: { submissions: SubmissionReviewItem[] }) {
  const [idsText, setIdsText] = useState("");
  const [activeIds, setActiveIds] = useState<string[]>([]);

  const { matches, missingIds } = useMemo(() => {
    const byId = new Map<string, SubmissionReviewItem>();

    for (const submission of submissions) {
      byId.set(submission.id, submission);

      if (submission.approvedHackathonId) {
        byId.set(submission.approvedHackathonId, submission);
      }

      if (submission.matchedHackathonId) {
        byId.set(submission.matchedHackathonId, submission);
      }

      const externalId = submission.payload.externalId;

      if (typeof externalId === "string" && externalId.trim()) {
        byId.set(externalId.trim(), submission);
      }
    }

    const matchedSubmissions: SubmissionReviewItem[] = [];
    const missing: string[] = [];

    for (const id of activeIds) {
      const submission = byId.get(id);

      if (submission) {
        matchedSubmissions.push(submission);
      } else {
        missing.push(id);
      }
    }

    return { matches: matchedSubmissions, missingIds: missing };
  }, [activeIds, submissions]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveIds(parseIds(idsText));
  }

  const pendingMatches = matches.filter((submission) => submission.status === "pending");
  const alreadyReviewed = matches.filter((submission) => submission.status !== "pending");

  return (
    <section className="rounded-lg border border-black/10 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#660000]">Bulk ID approval</p>
          <h2 className="mt-2 text-2xl font-semibold text-black">HNA IDs</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#706F6B]">
            Paste submission or published hackathon IDs, then approve, merge, or reject the next matching pending record.
          </p>
        </div>
        <div className="rounded-lg border border-black/10 bg-[#F7F7F4] px-4 py-3 text-sm font-semibold text-black">
          {pendingMatches.length} ready
        </div>
      </div>

      <form className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]" onSubmit={onSubmit}>
        <textarea
          aria-label="HNA IDs"
          className="min-h-28 w-full rounded-lg border border-black/15 bg-[#F7F7F4] p-4 font-mono text-xs leading-5 text-black outline-none focus:border-[#660000] focus:ring-2 focus:ring-[#660000]/15"
          onChange={(event) => setIdsText(event.target.value)}
          placeholder="Paste IDs separated by spaces, commas, or new lines"
          spellCheck={false}
          value={idsText}
        />
        <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-black px-4 text-sm font-semibold text-white" type="submit">
          <Search aria-hidden="true" className="size-4" />
          Load IDs
        </button>
      </form>

      {activeIds.length ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-[#706F6B]">
            <span className="inline-flex items-center gap-2 font-semibold text-black">
              <ClipboardCheck aria-hidden="true" className="size-4 text-[#660000]" />
              {matches.length} matched
            </span>
            {missingIds.length ? <span>{missingIds.length} not found in the loaded admin queue</span> : null}
            {alreadyReviewed.length ? <span>{alreadyReviewed.length} already reviewed</span> : null}
          </div>

          {missingIds.length ? (
            <details className="rounded-lg border border-[#B54708]/25 bg-[#FFFAEB] p-4">
              <summary className="cursor-pointer text-sm font-semibold text-[#B54708]">Missing IDs</summary>
              <p className="mt-2 break-all font-mono text-xs text-[#704600]">{missingIds.join(", ")}</p>
            </details>
          ) : null}

          <SubmissionReviewQueue
            emptyMessage="No pending submissions matched those IDs."
            endpointBase="/api/admin/hackathon-submissions"
            submissions={pendingMatches}
          />
        </div>
      ) : null}
    </section>
  );
}
