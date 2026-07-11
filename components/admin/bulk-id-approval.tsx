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
    <section className="rounded-xl border border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rust">Bulk ID approval</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy dark:text-wheat">HNA IDs</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-navy/55 dark:text-wheat/55">
            Paste submission or published hackathon IDs, then approve, merge, or reject the next matching pending record.
          </p>
        </div>
        <div className="rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-4 py-3 text-sm font-semibold text-navy dark:text-wheat">
          {pendingMatches.length} ready
        </div>
      </div>

      <form className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]" onSubmit={onSubmit}>
        <textarea
          aria-label="HNA IDs"
          className="min-h-28 w-full rounded-xl border border-navy/15 dark:border-white/15 bg-ivory dark:bg-white/5 p-4 font-mono text-xs leading-5 text-navy dark:text-wheat outline-none focus:border-cabernet focus:ring-2 focus:ring-cabernet/15"
          onChange={(event) => setIdsText(event.target.value)}
          placeholder="Paste IDs separated by spaces, commas, or new lines"
          spellCheck={false}
          value={idsText}
        />
        <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-cabernet hover:bg-[#5c151c] px-4 text-sm font-semibold text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white" type="submit">
          <Search aria-hidden="true" className="size-4" />
          Load IDs
        </button>
      </form>

      {activeIds.length ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-navy/55 dark:text-wheat/55">
            <span className="inline-flex items-center gap-2 font-semibold text-navy dark:text-wheat">
              <ClipboardCheck aria-hidden="true" className="size-4 text-cabernet dark:text-[#e4a3ab]" />
              {matches.length} matched
            </span>
            {missingIds.length ? <span>{missingIds.length} not found in the loaded admin queue</span> : null}
            {alreadyReviewed.length ? <span>{alreadyReviewed.length} already reviewed</span> : null}
          </div>

          {missingIds.length ? (
            <details className="rounded-xl border border-[#B54708]/25 bg-[#FFFAEB] p-4">
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
