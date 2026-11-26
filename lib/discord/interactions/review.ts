/* The review channel's buttons and pop-ups. Clicks only from the team role
   (or a server admin) are acted on. Slow work runs after the reply: Discord
   is told the message will update (DeferredMessageUpdate), then the message
   is edited to show the outcome. */
import { InteractionResponseType, type APIMessageComponentInteraction, type APIModalSubmitInteraction } from "discord-api-types/v10";

import { modalResponse, modalValues, issuesText } from "@/lib/discord/form-fields";
import {
  editInteractionResponse,
  ephemeral,
  ephemeralFollowUp,
  interactionUser,
  isTeamMember,
  type InteractionOutcome,
} from "@/lib/discord/interactions/respond";
import { loadSubmissionForApproval, runReviewAction, type ReviewActionInput } from "@/lib/discord/review-actions";
import { APPROVAL_FILL_FIELDS, approvalCandidate, approvalFillValues } from "@/lib/discord/review-items";
import { parseReviewCustomId, renderReviewMessage, REVIEW_ACTIONS, type ReviewAction } from "@/lib/discord/review-messages";
import { appBaseUrl, drainDiscordReviewQueueSafely, loadReviewItem, loadReviewViews } from "@/lib/discord/review-queue";

const NOT_TEAM = "Only the team role can review hackathons.";
const DEFAULT_REJECTION = "Not a hackathon we list.";

type Interaction = APIMessageComponentInteraction | APIModalSubmitInteraction;

function runAfterReply(interaction: Interaction, input: ReviewActionInput): InteractionOutcome {
  return {
    after: async () => {
      const result = await runReviewAction(input);

      if (result.view) {
        await editInteractionResponse(interaction, renderReviewMessage(result.view, appBaseUrl()));
      }

      if (!result.ok) {
        await ephemeralFollowUp(interaction, `❌ ${result.error}`);
      }

      // Posts what the action queued ("Import as new" can add a channel
      // decision) and tidies messages a failed or raced click left behind.
      await drainDiscordReviewQueueSafely({ budgetMs: 15_000 });
    },
    response: { type: InteractionResponseType.DeferredMessageUpdate },
  };
}

/* A click on an item someone already handled: show its current state, without the buttons. */
async function refreshed(itemId: string): Promise<InteractionOutcome> {
  const row = await loadReviewItem(itemId);

  if (!row) {
    return { response: { data: { components: [] }, type: InteractionResponseType.UpdateMessage } };
  }

  const [view] = await loadReviewViews([row]);

  return { response: { data: renderReviewMessage(view, appBaseUrl()), type: InteractionResponseType.UpdateMessage } };
}

export async function handleReviewButton(interaction: APIMessageComponentInteraction): Promise<InteractionOutcome> {
  if (!isTeamMember(interaction.member)) {
    return ephemeral(NOT_TEAM);
  }

  const parsed = parseReviewCustomId(interaction.data.custom_id);

  if (!parsed) {
    return ephemeral("That button is out of date.");
  }

  const { action, itemId } = parsed;
  const actor = interactionUser(interaction).username;

  if (action === "reject") {
    return {
      response: modalResponse({
        customId: `rvr:${itemId}`,
        fields: [{ id: "reason", label: "Reason (saved with the submission)", maxLength: 1000, minLength: 3, paragraph: true, required: true }],
        title: "Reject this submission",
        values: { reason: DEFAULT_REJECTION },
      }),
    };
  }

  if (action === "approve" || action === "merge" || action === "replace") {
    const item = await loadReviewItem(itemId);

    if (!item || item.status !== "pending") {
      return refreshed(itemId);
    }

    const submission = item.submissionId ? await loadSubmissionForApproval(item.submissionId) : null;

    /* Missing dates or country (a community tip): ask for them first. A
       broken import always asks, since its dates may be stand-ins. */
    if (submission && (submission.payload.needsFix === true || !approvalCandidate(submission).success)) {
      return {
        response: modalResponse({
          customId: `rvf:${action}:${itemId}`,
          fields: APPROVAL_FILL_FIELDS,
          title: "Fill in before approving",
          values: approvalFillValues(submission),
        }),
      };
    }
  }

  return runAfterReply(interaction, { action, actor, itemId });
}

export async function handleReviewModal(interaction: APIModalSubmitInteraction): Promise<InteractionOutcome> {
  if (!isTeamMember(interaction.member)) {
    return ephemeral(NOT_TEAM);
  }

  const [prefix, first, second] = interaction.data.custom_id.split(":");
  const typed = modalValues(interaction.data.components as never);
  const actor = interactionUser(interaction).username;

  if (prefix === "rvr" && first) {
    return runAfterReply(interaction, { action: "reject", actor, itemId: first, rejectionReason: typed.reason ?? "" });
  }

  if (prefix === "rvf" && second && (REVIEW_ACTIONS as readonly string[]).includes(first)) {
    const item = await loadReviewItem(second);
    const submission = item?.submissionId ? await loadSubmissionForApproval(item.submissionId) : null;
    const candidate = submission ? approvalCandidate(submission, typed) : null;

    if (candidate && !candidate.success) {
      return ephemeral(`Not approved yet. Fix these and click the button again:\n${issuesText(candidate.error)}`);
    }

    return runAfterReply(interaction, { action: first as ReviewAction, actor, fill: typed, itemId: second });
  }

  return ephemeral("That form is out of date.");
}
