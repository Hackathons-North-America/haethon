import { after, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { InteractionResponseType, MessageFlags, type APIInteraction } from "discord-api-types/v10";

import { handleInteraction } from "@/lib/discord/interactions/handle";
import { isValidDiscordSignature } from "@/lib/discord/interactions/verify";
import { env } from "@/lib/env";

/* Covers the work run after the reply: a review action, a submission, and
   the review-queue drain that follows them. */
export const maxDuration = 60;

/**
 * Discord's Interactions Endpoint URL: slash commands (/add-hackathon),
 * button clicks and pop-up submissions all arrive here as signed HTTP
 * requests, so the bot needs no always-on connection. Discord waits three
 * seconds for the reply; anything slower is deferred with after().
 */
export async function POST(request: Request) {
  if (!env.DISCORD_PUBLIC_KEY) {
    return NextResponse.json({ error: "DISCORD_PUBLIC_KEY is not configured." }, { status: 503 });
  }

  const body = await request.text();

  if (
    !isValidDiscordSignature({
      body,
      publicKeyHex: env.DISCORD_PUBLIC_KEY,
      signatureHex: request.headers.get("x-signature-ed25519"),
      timestamp: request.headers.get("x-signature-timestamp"),
    })
  ) {
    return NextResponse.json({ error: "Invalid request signature." }, { status: 401 });
  }

  let interaction: APIInteraction;

  try {
    interaction = JSON.parse(body) as APIInteraction;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const outcome = await handleInteraction(interaction);

    if (outcome.after) {
      const task = outcome.after;

      after(async () => {
        try {
          await task();
        } catch (error) {
          Sentry.captureException(error);
          console.error("Discord interaction follow-up failed.", { error });
        }
      });
    }

    return NextResponse.json(outcome.response);
  } catch (error) {
    Sentry.captureException(error);
    console.error("Discord interaction failed.", { error });

    return NextResponse.json({
      data: { content: "Something went wrong. Please try again.", flags: MessageFlags.Ephemeral },
      type: InteractionResponseType.ChannelMessageWithSource,
    });
  }
}
