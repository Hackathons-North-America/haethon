/* The review channel's buttons and pop-ups. Clicks only from the team role
   (or a server admin) are acted on. Slow work runs after the reply: Discord
   is told the message will update (DeferredMessageUpdate), then the drain
   deletes the decided card and posts the next (the channel shows one at a
   time). A failed action redraws the card with its buttons. */
import { InteractionResponseType, type APIMessageComponentInteraction, type APIModalSubmitInteraction } from "discord-api-types/v10";

import { modalResponse, modalValues, issuesText } from "@/lib/discord/form-fields";
import {
  deleteInteractionResponse,
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
import {
  appBaseUrl,
  deferReviewItem,
  drainDiscordReviewQueueSafely,
  loadReviewItem,
  loadReviewViews,
  renderReviewCard,
} from "@/lib/discord/review-queue";

const NOT_TEAM = "Only the team role can review hackathons.";
const DEFAULT_REJECTION = "Not a hackathon we list.";

type Interaction = APIMessageComponentInteraction | APIModalSubmitInteraction;

function runAfterReply(interaction: Interaction, input: ReviewActionInput): InteractionOutcome {
  return {
    after: async () => {
      const result = await runReviewAction(input);

      // Still undecided (the action failed): put its buttons back. A decided
      // card is left for the drain to delete.
      if (result.view?.status === "pending") {
        await editInteractionResponse(interaction, await renderReviewCard(result.view));
      }

      if (!result.ok) {
        await ephemeralFollowUp(interaction, `❌ ${result.error}`);
      }

      // Deletes the decided card and posts the next (which may be what the
      // action queued: "Import as new" can add a channel decision).
      await drainDiscordReviewQueueSafely({ budgetMs: 15_000 });
    },
    response: { type: InteractionResponseType.DeferredMessageUpdate },
  };
}

/* A click on an item someone already handled: show its current state, without
   the buttons, until the drain deletes the card and posts the next. */
async function refreshed(itemId: string): Promise<InteractionOutcome> {
  const row = await loadReviewItem(itemId);
  const after = async () => {
    await drainDiscordReviewQueueSafely({ budgetMs: 15_000 });
  };

  if (!row) {
    return { after, response: { data: { components: [] }, type: InteractionResponseType.UpdateMessage } };
  }

  const [view] = await loadReviewViews([row]);

  return { after, response: { data: renderReviewMessage(view, appBaseUrl()), type: InteractionResponseType.UpdateMessage } };
}

/* "Skip for now": the card goes to the back of the line and the next one is
   posted in its place. */
function skipForNow(interaction: APIMessageComponentInteraction, itemId: string): InteractionOutcome {
  return {
    after: async () => {
      const deferred = await deferReviewItem(itemId, interaction.message.id);
      const row = deferred ?? (await loadReviewItem(itemId));

      // Deferred, or a card the queue no longer tracks (a leftover copy).
      // One mid-click or just decided is left to its action and the drain.
      if (deferred || row?.messageSnowflake !== interaction.message.id) {
        await deleteInteractionResponse(interaction).catch((error) => {
          console.error("Unable to delete a skipped Discord review card.", { error, itemId });
        });
      }

      await drainDiscordReviewQueueSafely({ budgetMs: 15_000 });
    },
    response: { type: InteractionResponseType.DeferredMessageUpdate },
  };
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

  if (action === "later") {
    return skipForNow(interaction, itemId);
  }

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
