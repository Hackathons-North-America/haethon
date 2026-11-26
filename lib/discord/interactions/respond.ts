import { REST } from "@discordjs/rest";
import {
  InteractionResponseType,
  MessageFlags,
  PermissionFlagsBits,
  Routes,
  type APIInteraction,
  type APIInteractionGuildMember,
  type APIInteractionResponse,
} from "discord-api-types/v10";

import { env } from "@/lib/env";

/* What an interaction handler returns: the immediate reply (Discord allows
   three seconds), and optionally work to run after it with next's after(). */
export type InteractionOutcome = {
  response: APIInteractionResponse;
  after?: () => Promise<void>;
};

/* Interaction webhooks are authorised by their token, not the bot's. */
const webhookRest = new REST({ version: "10" });

export function ephemeral(content: string): InteractionOutcome {
  return {
    response: {
      data: { allowed_mentions: { parse: [] }, content, flags: MessageFlags.Ephemeral },
      type: InteractionResponseType.ChannelMessageWithSource,
    },
  };
}

/* Replaces the message the interaction answered (or, for a button, the
   message the button is on). */
export async function editInteractionResponse(interaction: Pick<APIInteraction, "application_id" | "token">, body: unknown) {
  await webhookRest.patch(Routes.webhookMessage(interaction.application_id, interaction.token, "@original"), {
    auth: false,
    body,
  });
}

export async function ephemeralFollowUp(interaction: Pick<APIInteraction, "application_id" | "token">, content: string) {
  await webhookRest.post(Routes.webhook(interaction.application_id, interaction.token), {
    auth: false,
    body: { allowed_mentions: { parse: [] }, content: content.slice(0, 2000), flags: MessageFlags.Ephemeral },
  });
}

/* The team role, or a server administrator, may use the review buttons. */
export function isTeamMember(member: APIInteractionGuildMember | undefined, teamRoleId = env.DISCORD_TEAM_ROLE_ID) {
  if (!member) {
    return false;
  }

  if (teamRoleId && member.roles.includes(teamRoleId)) {
    return true;
  }

  try {
    return (BigInt(member.permissions) & PermissionFlagsBits.Administrator) !== BigInt(0);
  } catch {
    return false;
  }
}

export function interactionUser(interaction: APIInteraction) {
  const user = interaction.member?.user ?? interaction.user;

  return { id: user?.id ?? "unknown", username: user?.username ?? "unknown" };
}
