import {
  InteractionResponseType,
  InteractionType,
  type APIInteraction,
} from "discord-api-types/v10";

import { COMMAND_NAME } from "@/lib/discord/add-hackathon-form";
import {
  handleAddHackathonCommand,
  handleAddHackathonComponent,
  handleAddHackathonModal,
} from "@/lib/discord/interactions/add-hackathon";
import { ephemeral, type InteractionOutcome } from "@/lib/discord/interactions/respond";
import { handleReviewButton, handleReviewModal } from "@/lib/discord/interactions/review";
import { env } from "@/lib/env";

/**
 * Routes one verified interaction. Custom ids are namespaced: `rv…` for the
 * review channel, `ah…` for /add-hackathon.
 */
export async function handleInteraction(interaction: APIInteraction): Promise<InteractionOutcome> {
  if (interaction.type === InteractionType.Ping) {
    return { response: { type: InteractionResponseType.Pong } };
  }

  if (!env.DISCORD_GUILD_ID || interaction.guild_id !== env.DISCORD_GUILD_ID) {
    return ephemeral("This only works in the Haethon Discord server.");
  }

  if (interaction.type === InteractionType.ApplicationCommand) {
    return interaction.data.name === COMMAND_NAME ? handleAddHackathonCommand(interaction) : ephemeral("Unknown command.");
  }

  if (interaction.type === InteractionType.MessageComponent) {
    const id = interaction.data.custom_id;

    if (id.startsWith("rv:")) {
      return handleReviewButton(interaction);
    }

    if (id.startsWith("ah:")) {
      return handleAddHackathonComponent(interaction);
    }
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    const id = interaction.data.custom_id;

    if (id.startsWith("rvr:") || id.startsWith("rvf:")) {
      return handleReviewModal(interaction);
    }

    if (id.startsWith("ah:")) {
      return handleAddHackathonModal(interaction);
    }
  }

  return ephemeral("That's out of date. Try again.");
}
