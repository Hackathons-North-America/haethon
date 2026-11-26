/* /add-hackathon: hacker mode (one pop-up) and organizer mode (three pop-ups
   and a final step, see add-hackathon-form.ts). Submissions are recorded
   under the Discord bot account and wait in the review queue, which also
   posts them to the team's review channel. */
import { and, eq } from "drizzle-orm";
import {
  InteractionResponseType,
  MessageFlags,
  type APIApplicationCommandInteraction,
  type APIMessageComponentInteraction,
  type APIModalSubmitInteraction,
} from "discord-api-types/v10";

import { db } from "@/lib/db";
import { discordFormDrafts } from "@/lib/db/schema";
import {
  asDraft,
  COMMUNITY_FIELDS,
  COMMUNITY_MODAL_ID,
  communitySubmissionInput,
  defaultDiscordTag,
  emptyDraft,
  isOrganizerStep,
  organizerModalId,
  organizerProgressMessage,
  organizerStep,
  organizerSubmissionInput,
  validateOrganizerStep,
  type OrganizerDraft,
} from "@/lib/discord/add-hackathon-form";
import { discordBotSubmitter } from "@/lib/discord/bot-user";
import { issuesText, modalResponse, modalValues } from "@/lib/discord/form-fields";
import {
  editInteractionResponse,
  ephemeral,
  interactionUser,
  type InteractionOutcome,
} from "@/lib/discord/interactions/respond";
import { drainDiscordReviewQueueSafely, enqueueSubmissionReviews } from "@/lib/discord/review-queue";
import { createHackathonSubmission } from "@/lib/hackathons/review-service";
import type { HackathonSubmissionInput } from "@/lib/hackathons/utils";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const EXPIRED = "This form expired or was already submitted. Run `/add-hackathon organizer` to start again.";

function updateMessage(data: object): InteractionOutcome {
  return { response: { data, type: InteractionResponseType.UpdateMessage } };
}

async function loadDraft(draftId: string, discordUserId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) {
    return null;
  }

  const [row] = await db
    .select()
    .from(discordFormDrafts)
    .where(and(eq(discordFormDrafts.id, draftId), eq(discordFormDrafts.discordUserId, discordUserId)))
    .limit(1);

  return row ? { data: asDraft(row.data), id: row.id } : null;
}

async function saveDraft(draftId: string | null, discordUserId: string, draft: OrganizerDraft) {
  if (!draftId) {
    const [created] = await db
      .insert(discordFormDrafts)
      .values({ data: draft, discordUserId })
      .returning({ id: discordFormDrafts.id });

    return created.id;
  }

  await db.update(discordFormDrafts).set({ data: draft, updatedAt: new Date() }).where(eq(discordFormDrafts.id, draftId));

  return draftId;
}

/* Same limit as the web form: ten submissions an hour, per Discord account. */
async function checkRateLimit(discordUserId: string) {
  const limit = await consumeRateLimit({ key: `discord-submission:${discordUserId}`, limit: 10, windowMs: 60 * 60 * 1000 });

  return limit.allowed ? null : `Too many submissions. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`;
}

async function submit(input: HackathonSubmissionInput, user: { id: string; username: string }) {
  const bot = await discordBotSubmitter();
  const { submission } = await createHackathonSubmission(input, bot, bot.role, {
    discordSubmitter: { id: user.id, username: user.username },
    submittedVia: "discord",
  });

  await enqueueSubmissionReviews([submission.id]);
  await drainDiscordReviewQueueSafely({ budgetMs: 20_000 });
}

function thanks(name: string) {
  return {
    components: [],
    content: `✅ Thanks! **${name.replace(/[*_`~|]/g, "")}** was sent to the Haethon team. It shows up on the site once someone reviews it.`,
    embeds: [],
  };
}

const FAILED = {
  components: [],
  content: "Something went wrong saving your submission. Please try again, or use the form at haethon.com/submit.",
  embeds: [],
};

export function handleAddHackathonCommand(interaction: APIApplicationCommandInteraction): InteractionOutcome {
  const data = interaction.data as { options?: Array<{ name: string }> };
  const mode = data.options?.[0]?.name;

  if (mode === "hacker") {
    return { response: modalResponse({ customId: COMMUNITY_MODAL_ID, fields: COMMUNITY_FIELDS, title: "Share a hackathon" }) };
  }

  if (mode === "organizer") {
    const step = organizerStep("basics");

    return {
      response: modalResponse({
        customId: organizerModalId("basics", null),
        fields: step.fields,
        title: step.title,
        values: { discordTag: defaultDiscordTag(interactionUser(interaction).username) },
      }),
    };
  }

  return ephemeral("Pick a mode: `/add-hackathon hacker` to share one you found, or `/add-hackathon organizer` for your own.");
}

export async function handleAddHackathonModal(interaction: APIModalSubmitInteraction): Promise<InteractionOutcome> {
  const user = interactionUser(interaction);
  const typed = modalValues(interaction.data.components as never);
  const customId = interaction.data.custom_id;

  if (customId === COMMUNITY_MODAL_ID) {
    const parsed = communitySubmissionInput(typed);

    if (!parsed.success) {
      return ephemeral(`That didn't go through:\n${issuesText(parsed.error)}\nRun \`/add-hackathon hacker\` to try again.`);
    }

    const limited = await checkRateLimit(user.id);

    if (limited) {
      return ephemeral(limited);
    }

    return {
      after: async () => {
        try {
          await submit(parsed.data, user);
          await editInteractionResponse(interaction, thanks(parsed.data.name));
        } catch (error) {
          console.error("Discord community submission failed.", { error });
          await editInteractionResponse(interaction, FAILED);
        }
      },
      response: { data: { flags: MessageFlags.Ephemeral }, type: InteractionResponseType.DeferredChannelMessageWithSource },
    };
  }

  const [, , step, draftRef] = customId.split(":");

  if (!step || !isOrganizerStep(step) || !draftRef) {
    return ephemeral("That form is out of date. Run `/add-hackathon` again.");
  }

  const existing = draftRef === "new" ? null : await loadDraft(draftRef, user.id);

  if (draftRef !== "new" && !existing) {
    return updateMessage({ components: [], content: EXPIRED, embeds: [] });
  }

  const draft = existing?.data ?? emptyDraft();
  draft.steps[step] = typed;
  const error = validateOrganizerStep(step, typed);
  draft.done = error ? draft.done.filter((key) => key !== step) : [...new Set([...draft.done, step])];
  const draftId = await saveDraft(existing?.id ?? null, user.id, draft);
  const message = organizerProgressMessage(draftId, draft, error);

  // The first pop-up came from the slash command, so there is no message to update yet.
  return draftRef === "new"
    ? { response: { data: { ...message, flags: MessageFlags.Ephemeral }, type: InteractionResponseType.ChannelMessageWithSource } }
    : updateMessage(message);
}

export async function handleAddHackathonComponent(interaction: APIMessageComponentInteraction): Promise<InteractionOutcome> {
  const user = interactionUser(interaction);
  const [, verb, a, b] = interaction.data.custom_id.split(":");
  const draftId = verb === "open" ? b : a;
  const draft = draftId ? await loadDraft(draftId, user.id) : null;

  if (!draft) {
    return updateMessage({ components: [], content: EXPIRED, embeds: [] });
  }

  if (verb === "open" && isOrganizerStep(a)) {
    const step = organizerStep(a);

    return { response: modalResponse({ customId: organizerModalId(a, draft.id), fields: step.fields, title: step.title, values: draft.data.steps[a] }) };
  }

  if (verb === "flags") {
    const values = "values" in interaction.data ? interaction.data.values : [];
    draft.data.flags = values;
    await saveDraft(draft.id, user.id, draft.data);

    return updateMessage(organizerProgressMessage(draft.id, draft.data));
  }

  if (verb === "cancel") {
    await db.delete(discordFormDrafts).where(eq(discordFormDrafts.id, draft.id));

    return updateMessage({ components: [], content: "Cancelled. Nothing was submitted.", embeds: [] });
  }

  if (verb === "submit") {
    const parsed = organizerSubmissionInput(draft.data);

    if (!parsed.success) {
      return updateMessage(organizerProgressMessage(draft.id, draft.data, issuesText(parsed.error)));
    }

    const limited = await checkRateLimit(user.id);

    if (limited) {
      return updateMessage(organizerProgressMessage(draft.id, draft.data, limited));
    }

    // Deleted first, so a double click on Submit finds no draft instead of submitting twice.
    const [removed] = await db.delete(discordFormDrafts).where(eq(discordFormDrafts.id, draft.id)).returning({ id: discordFormDrafts.id });

    if (!removed) {
      return updateMessage({ components: [], content: EXPIRED, embeds: [] });
    }

    return {
      after: async () => {
        try {
          await submit(parsed.data, user);
          await editInteractionResponse(interaction, thanks(parsed.data.name));
        } catch (error) {
          console.error("Discord organizer submission failed.", { error });
          // Put the answers back so the organizer can try again.
          const restoredId = await saveDraft(null, user.id, draft.data).catch(() => null);
          await editInteractionResponse(
            interaction,
            restoredId
              ? organizerProgressMessage(restoredId, draft.data, "Something went wrong saving your submission. Please submit again.")
              : FAILED
          );
        }
      },
      response: { type: InteractionResponseType.DeferredMessageUpdate },
    };
  }

  return ephemeral("That button is out of date. Run `/add-hackathon` again.");
}
