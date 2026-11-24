"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { SubmissionReviewCard, type SubmissionReviewItem } from "@/components/admin/submission-review-card";
import { reportBackgroundFailure } from "@/lib/client/background-actions";

/* Shows one submission at a time. Approving or rejecting moves straight on to
   the next submission while the review saves in the background. Cards that
   have been worked on stay mounted (hidden) until their save lands, so a
   refused review comes back with every edit intact: it is queued to show
   next, and its toast can jump straight to it. */
export function SubmissionReviewQueue({
  allowDeleteExisting = false,
  emptyMessage,
  endpointBase,
  submissions,
}: {
  allowDeleteExisting?: boolean;
  emptyMessage: string;
  endpointBase: string;
  submissions: SubmissionReviewItem[];
}) {
  const router = useRouter();
  const [reviewedIds, setReviewedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(() => new Set());
  /* Refused reviews, oldest first; they're shown before untouched submissions. */
  const [failedIds, setFailedIds] = useState<string[]>([]);
  /* Submissions the admin has opened, kept mounted so their edits survive. */
  const [touchedIds, setTouchedIds] = useState<string[]>([]);
  /* The submission on screen. Sticky, so a failure never yanks away the card
     the admin is in the middle of. */
  const [activeId, setActiveId] = useState<string | null>(null);
  /* Reviews in flight, counted outside render so the refresh check is exact. */
  const inFlightRef = useRef(0);

  const byId = new Map(submissions.map((submission) => [submission.id, submission]));
  const open = submissions.filter((submission) => !reviewedIds.has(submission.id) && !savingIds.has(submission.id));

  function pickNext(excluding: string | null) {
    const candidates = [
      ...failedIds,
      ...touchedIds,
      ...open.map((submission) => submission.id),
    ].filter((id) => id !== excluding && byId.has(id) && !reviewedIds.has(id) && !savingIds.has(id));

    return candidates[0] ?? null;
  }

  const activeIsValid = activeId !== null && open.some((submission) => submission.id === activeId);
  const currentId = activeIsValid ? activeId : pickNext(null);
  const mountedIds = [...new Set([...touchedIds, ...(currentId ? [currentId] : [])])].filter(
    (id) => byId.has(id) && !reviewedIds.has(id)
  );

  /* Reviews finish after an await, so their callbacks read the latest render
     through this ref rather than the render they were submitted from. */
  const latestRef = useRef({ currentId, byId });
  useEffect(() => {
    latestRef.current = { currentId, byId };
  });

  function touch(id: string) {
    setTouchedIds((current) => (current.includes(id) ? current : [...current, id]));
  }

  function onSubmitted(submissionId: string) {
    inFlightRef.current += 1;
    touch(submissionId);
    setSavingIds((current) => new Set(current).add(submissionId));
    setFailedIds((current) => current.filter((id) => id !== submissionId));
    setActiveId(pickNext(submissionId));
  }

  function settle(submissionId: string) {
    inFlightRef.current -= 1;
    setSavingIds((current) => {
      const next = new Set(current);
      next.delete(submissionId);
      return next;
    });

    // Refresh server counts once nothing is saving, so a refresh never races
    // a review that is still in flight.
    if (inFlightRef.current === 0) {
      router.refresh();
    }
  }

  function onReviewed(submissionId: string) {
    setReviewedIds((current) => new Set(current).add(submissionId));
    setTouchedIds((current) => current.filter((id) => id !== submissionId));
    settle(submissionId);
  }

  function onFailed(submissionId: string, failure: { verb: string; error: unknown }) {
    setFailedIds((current) => [...current.filter((id) => id !== submissionId), submissionId]);
    settle(submissionId);

    const { currentId: shownId, byId: latestById } = latestRef.current;

    // If the queue had run dry, show the refused one straight away; otherwise
    // it waits until the admin finishes the submission in front of them.
    if (!shownId) {
      setActiveId(submissionId);
    }

    const name = latestById.get(submissionId)?.normalizedName ?? "this submission";

    reportBackgroundFailure(failure.error, {
      message: `Couldn't ${failure.verb} ${name}.`,
      undoneNote: "It's back in the queue with your edits.",
      action: {
        label: "Review now",
        onClick: () => {
          // Keep the card being worked on mounted so its edits survive.
          const displaced = latestRef.current.currentId;

          if (displaced) {
            touch(displaced);
          }

          setActiveId(submissionId);
        },
      },
    });
  }

  if (!currentId) {
    return (
      <div className="border border-ink/15 bg-paper p-5 text-sm text-ink/55">
        {emptyMessage}
        {savingIds.size ? (
          <span className="ml-1 text-ink/45">
            ({savingIds.size} {savingIds.size === 1 ? "review is" : "reviews are"} still saving.)
          </span>
        ) : null}
        {mountedIds.map((id) => (
          <SubmissionReviewCard
            allowDeleteExisting={allowDeleteExisting}
            endpointBase={endpointBase}
            hidden
            key={id}
            onFailed={onFailed}
            onReviewed={onReviewed}
            onSubmitted={onSubmitted}
            submission={byId.get(id)!}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 border border-ink/15 bg-paper px-4 py-3 text-sm">
        <span className="font-semibold text-ink">{open.length} pending</span>
        <span className="text-ink/55">
          {savingIds.size ? `${savingIds.size} saving in the background · ` : ""}Showing next submission
        </span>
      </div>
      {mountedIds.map((id) => (
        <SubmissionReviewCard
          allowDeleteExisting={allowDeleteExisting}
          endpointBase={endpointBase}
          hidden={id !== currentId}
          key={id}
          onFailed={onFailed}
          onReviewed={onReviewed}
          onSubmitted={onSubmitted}
          submission={byId.get(id)!}
        />
      ))}
    </div>
  );
}
