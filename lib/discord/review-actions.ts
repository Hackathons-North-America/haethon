/* What the review channel's buttons do. Each action claims its item first so
   two reviewers clicking at once cannot both act, then calls the same
   service the website's review pages call. */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonSubmissions, hackathons } from "@/lib/db/schema";
import { startDiscordChannelJobs } from "@/lib/discord/channel-job-worker";
import {
  denyHackathonDiscordChannel,
  requestHackathonDiscordChannel,
} from "@/lib/discord/channel-jobs";
import { issuesText } from "@/lib/discord/form-fields";
import { approvalCandidate, channelDecisionItem } from "@/lib/discord/review-items";
import type { ReviewAction, ReviewItemKind, ReviewItemView } from "@/lib/discord/review-messages";
import {
  claimReviewItem,
  enqueueReviewItems,
  finishReviewItem,
  loadReviewItemView,
  releaseReviewItem,
} from "@/lib/discord/review-queue";
import {
  importAdminHackathons,
  listHackathonSubmissions,
  mergeImportedDuplicate,
  reviewHackathonSubmission,
} from "@/lib/hackathons/review-service";
import { isImportCardPayload } from "@/lib/hackathons/import-cards";
import { decideImportCard, ImportCardError } from "@/lib/hackathons/import-queue";
import { findScraperImportReviewerId } from "@/lib/hackathons/scraper-import";
import { adminHackathonImportPayloadSchema } from "@/lib/validations/hackathon";

const ACTIONS_BY_KIND: Record<ReviewItemKind, ReviewAction[]> = {
  channel_decision: ["channel", "nochannel"],
  import_duplicate: ["new", "dupmerge", "skip"],
  // "new" is "import as new anyway", offered on an import card that may be a
  // duplicate, where replacing the match is not offered.
  submission: ["approve", "reject", "merge", "replace", "new"],
};

export function actionFitsKind(action: ReviewAction, kind: ReviewItemKind) {
  return ACTIONS_BY_KIND[kind].includes(action);
}

/* An error the reviewer is shown as is. Anything else is reported generically. */
export class ReviewActionError extends Error {}

export type ReviewActionInput = {
  action: ReviewAction;
  itemId: string;
  /* Discord username of whoever clicked. */
  actor: string;
  rejectionReason?: string;
  /* Fields typed into the fill-in pop-up when approving. */
  fill?: Record<string, string>;
};

export type ReviewActionResult = { ok: true; view: ReviewItemView | null } | { ok: false; error: string; view: ReviewItemView | null };

/* The submission row plus the organization name the review card shows. */
export async function loadSubmissionForApproval(submissionId: string) {
  const [submission] = await listHackathonSubmissions({ limit: 1, submissionIds: [submissionId] });

  return submission ?? null;
}

/* A card from the website's import review queue: the same decision, through
   the same code, as its Yes, No, Merge and "Import as new" on /admin/import. */
async function runImportCardAction(input: ReviewActionInput, submissionId: string, reviewerUserId: string) {
  if (input.action === "replace") {
    throw new ReviewActionError("Import cards cannot replace their match. Merge into it, or import as new.");
  }

  if (input.action === "reject" && (input.rejectionReason?.trim().length ?? 0) < 3) {
    throw new ReviewActionError("A rejection reason needs at least 3 characters.");
  }

  try {
    const decision = await decideImportCard({
      action: input.action === "new" ? "approve_new" : (input.action as "approve" | "merge" | "reject"),
      rejectionReason: input.rejectionReason,
      reviewerUserId,
      submissionId,
    });

    if (decision.status === "rejected") {
      return { hackathonId: null, outcome: `Rejected: ${input.rejectionReason?.trim()}` };
    }

    const { result } = decision;

    if (result.status === "duplicate_flagged") {
      // The card stays, now naming its match; the redrawn message offers merge.
      throw new ReviewActionError(
        `This looks like ${result.matchedName ?? "an existing hackathon"} (match ${result.duplicateScore.toFixed(2)}). ` +
          "Merge into the match, or import it as new."
      );
    }

    // Published here, so nobody was asked about its channel: that is posted next.
    if (result.status === "imported" && result.hackathonId && result.discord?.eligible) {
      const [card] = await db.select({ payload: hackathonSubmissions.payload }).from(hackathonSubmissions).where(eq(hackathonSubmissions.id, submissionId));
      await enqueueReviewItems([channelDecisionItem(result.hackathonId, card?.payload ?? { name: result.name }, result.discord)]);
    }

    return {
      hackathonId: result.hackathonId ?? null,
      outcome:
        result.status === "auto_merged"
          ? `Merged into ${result.matchedName ?? "the match"}`
          : result.status === "updated"
            ? "Already imported; updated it"
            : input.action === "new"
              ? "Imported as new"
              : "Approved",
    };
  } catch (error) {
    if (error instanceof ImportCardError) {
      const fields = error.details && typeof error.details === "object" ? (error.details as { fieldErrors?: Record<string, string[]> }).fieldErrors : undefined;
      const detail = Object.entries(fields ?? {})
        .map(([field, messages]) => `${field}: ${messages.join(", ")}`)
        .join("\n");

      throw new ReviewActionError(
        error.code === "invalid" ? `${error.message} Fix it on /admin/import.${detail ? `\n${detail}` : ""}` : error.message
      );
    }

    throw error;
  }
}

async function runSubmissionAction(input: ReviewActionInput, submissionId: string | null, reviewerUserId: string) {
  const submission = submissionId ? await loadSubmissionForApproval(submissionId) : null;

  if (!submission) {
    throw new ReviewActionError("This submission no longer exists.");
  }

  if (isImportCardPayload(submission.payload) && submission.payload.needsFix !== true) {
    return runImportCardAction(input, submission.id, reviewerUserId);
  }

  if (input.action === "new") {
    throw new ReviewActionError("That button does not apply to this item.");
  }

  if (input.action === "reject") {
    const rejectionReason = input.rejectionReason?.trim() ?? "";

    if (rejectionReason.length < 3) {
      throw new ReviewActionError("A rejection reason needs at least 3 characters.");
    }

    await reviewHackathonSubmission({ action: { action: "reject", rejectionReason }, reviewerUserId, submissionId: submission.id });

    return { hackathonId: null, outcome: `Rejected: ${rejectionReason}` };
  }

  if (submission.payload.needsFix === true && !input.fill) {
    throw new ReviewActionError("Broken imports need their details confirmed. Click the button again to fill them in.");
  }

  const candidate = approvalCandidate(submission, input.fill);

  if (!candidate.success) {
    throw new ReviewActionError(`This submission is missing details:\n${issuesText(candidate.error)}`);
  }

  const normalizedPayload = candidate.data;
  const targetHackathonId = submission.matchedHackathonId;

  if ((input.action === "merge" || input.action === "replace") && !targetHackathonId) {
    throw new ReviewActionError("This submission has no matching hackathon to merge into or replace.");
  }

  const result = await reviewHackathonSubmission({
    action:
      input.action === "merge"
        ? { action: "merge", normalizedPayload, targetHackathonId: targetHackathonId! }
        : input.action === "replace"
          ? { action: "delete_existing", normalizedPayload, targetHackathonId: targetHackathonId! }
          : { action: "approve_new", normalizedPayload },
    reviewerUserId,
    submissionId: submission.id,
  });
  const matchName = submission.matchedHackathonName ?? "the existing hackathon";

  return {
    hackathonId: result.approvedHackathonId,
    outcome:
      input.action === "merge" ? `Merged into ${matchName}` : input.action === "replace" ? `Approved, replacing ${matchName}` : "Approved",
  };
}

async function runChannelAction(action: ReviewAction, hackathonId: string | null, reviewerUserId: string) {
  if (!hackathonId) {
    throw new ReviewActionError("This hackathon was deleted.");
  }

  if (action === "nochannel") {
    // "Not HNA approved". Stored, as on the website: no sync makes a channel
    // for it later, and it leaves the queue on /admin/import.
    if ((await denyHackathonDiscordChannel(hackathonId)).status === "not_found") {
      throw new ReviewActionError("This hackathon was deleted.");
    }

    return { outcome: "Not HNA approved · no channel" };
  }

  const request = await requestHackathonDiscordChannel(hackathonId, reviewerUserId);

  if (request.status === "not_found") {
    throw new ReviewActionError("This hackathon was deleted.");
  }

  if (request.status === "skipped") {
    return { outcome: `No channel: ${request.reason}` };
  }

  await startDiscordChannelJobs();
  return { outcome: "HNA approved · channel on its way" };
}

async function runDuplicateAction(
  action: ReviewAction,
  item: { hackathonId: string | null; payload: Record<string, unknown> | null },
  reviewerUserId: string
) {
  if (action === "skip") {
    return { outcome: "Skipped" };
  }

  const parsed = adminHackathonImportPayloadSchema.safeParse(item.payload ?? {});

  if (!parsed.success) {
    throw new ReviewActionError(`The saved import row is no longer valid:\n${issuesText(parsed.error)}`);
  }

  if (action === "dupmerge") {
    if (!item.hackathonId) {
      throw new ReviewActionError("The matching hackathon was deleted. Import it as new or skip it.");
    }

    const [target] = await db.select({ name: hackathons.name }).from(hackathons).where(eq(hackathons.id, item.hackathonId)).limit(1);

    await mergeImportedDuplicate(item.hackathonId, parsed.data);

    return { hackathonId: item.hackathonId, outcome: `Merged into ${target?.name ?? "the match"}` };
  }

  // "Import as new anyway", as on the admin import page.
  const imported = await importAdminHackathons({ ignoreDuplicates: true, payloads: [parsed.data], reviewerUserId });
  const [result] = imported.results;

  if (!result?.hackathonId) {
    throw new ReviewActionError("The import did not create a hackathon.");
  }

  // Auto-approval publishes without asking; the channel still needs a yes.
  if (result.status === "imported" && result.discord?.eligible) {
    await enqueueReviewItems([channelDecisionItem(result.hackathonId, parsed.data, result.discord)]);
  }

  return {
    hackathonId: result.hackathonId,
    outcome: result.status === "imported" ? "Imported as new" : "Already imported; updated it",
  };
}

/**
 * Runs one button's action for the Discord user `actor`. Never throws: a
 * failure puts the item back (buttons still work) and comes back as `error`.
 */
export async function runReviewAction(input: ReviewActionInput): Promise<ReviewActionResult> {
  const claimed = await claimReviewItem(input.itemId);

  if (!claimed) {
    return { error: "Someone already handled this one.", ok: false, view: await loadReviewItemView(input.itemId) };
  }

  try {
    const kind = claimed.kind as ReviewItemKind;

    if (!actionFitsKind(input.action, kind)) {
      throw new ReviewActionError("That button does not apply to this item.");
    }

    const reviewerUserId = await findScraperImportReviewerId();

    if (!reviewerUserId) {
      throw new ReviewActionError("No Haethon admin account exists to record the review under.");
    }

    const done: { outcome: string; hackathonId?: string | null } =
      kind === "submission"
        ? await runSubmissionAction(input, claimed.submissionId, reviewerUserId)
        : kind === "channel_decision"
          ? await runChannelAction(input.action, claimed.hackathonId, reviewerUserId)
          : await runDuplicateAction(input.action, claimed, reviewerUserId);

    if (kind === "submission" && claimed.submissionId) {
      await db
        .update(hackathonSubmissions)
        .set({ reviewerNotes: `Reviewed in Discord by @${input.actor}`, updatedAt: new Date() })
        .where(eq(hackathonSubmissions.id, claimed.submissionId));
    }

    await finishReviewItem(input.itemId, {
      hackathonId: done.hackathonId,
      outcome: done.outcome,
      resolvedBy: `@${input.actor}`,
    });

    return { ok: true, view: await loadReviewItemView(input.itemId) };
  } catch (error) {
    await releaseReviewItem(input.itemId);

    const message =
      error instanceof ReviewActionError || (error instanceof Error && /already|cannot|not found/i.test(error.message))
        ? error.message
        : "Something went wrong. Check the website before trying again.";

    if (!(error instanceof ReviewActionError)) {
      console.error("Discord review action failed.", { action: input.action, error, itemId: input.itemId });
    }

    return { error: message, ok: false, view: await loadReviewItemView(input.itemId) };
  }
}
