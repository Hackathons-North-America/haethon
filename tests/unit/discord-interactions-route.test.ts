import { generateKeyPairSync, sign } from "node:crypto";

import { ComponentType, InteractionResponseType, InteractionType, MessageFlags } from "discord-api-types/v10";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const testEnv = {
  DISCORD_GUILD_ID: "guild-1",
  DISCORD_PUBLIC_KEY: Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url").toString("hex") as string | undefined,
  DISCORD_TEAM_ROLE_ID: "team-role",
  NEXT_PUBLIC_APP_URL: "https://haethon.test",
};
const after = vi.fn();

vi.mock("@/lib/env", () => ({ env: testEnv }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
// Nothing these requests do may reach the database.
vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("database used"); } }) }));
vi.mock("@/lib/hackathons/review-service", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after }));

const { POST } = await import("@/app/api/discord/interactions/route");

function signedRequest(payload: unknown, options?: { badSignature?: boolean }) {
  const body = JSON.stringify(payload);
  const timestamp = "1700000000";
  const signature = sign(null, Buffer.from(timestamp + (options?.badSignature ? `${body} ` : body)), privateKey).toString("hex");

  return new Request("https://haethon.test/api/discord/interactions", {
    body,
    headers: { "x-signature-ed25519": signature, "x-signature-timestamp": timestamp },
    method: "POST",
  });
}

const member = (roles: string[] = []) => ({ permissions: "0", roles, user: { id: "u1", username: "maple.org" } });

describe("POST /api/discord/interactions", () => {
  beforeEach(() => {
    testEnv.DISCORD_PUBLIC_KEY = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url").toString("hex");
    after.mockReset();
  });

  it("answers Discord's ping", async () => {
    const response = await POST(signedRequest({ type: InteractionType.Ping }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: InteractionResponseType.Pong });
  });

  it("refuses a bad signature, as Discord requires of the endpoint", async () => {
    expect((await POST(signedRequest({ type: InteractionType.Ping }, { badSignature: true }))).status).toBe(401);
  });

  it("is off until the public key is configured", async () => {
    testEnv.DISCORD_PUBLIC_KEY = undefined;

    expect((await POST(signedRequest({ type: InteractionType.Ping }))).status).toBe(503);
  });

  it("only works in the Haethon server", async () => {
    const response = await POST(
      signedRequest({ data: { name: "add-hackathon" }, guild_id: "other", member: member(), type: InteractionType.ApplicationCommand })
    );

    expect(await response.json()).toMatchObject({ data: { flags: MessageFlags.Ephemeral }, type: InteractionResponseType.ChannelMessageWithSource });
  });

  it("opens the community pop-up for /add-hackathon hacker", async () => {
    const response = await POST(
      signedRequest({
        data: { name: "add-hackathon", options: [{ name: "hacker", type: 1 }] },
        guild_id: "guild-1",
        member: member(),
        type: InteractionType.ApplicationCommand,
      })
    );
    const body = await response.json();

    expect(body.type).toBe(InteractionResponseType.Modal);
    expect(body.data.custom_id).toBe("ah:m:c");
    expect(body.data.components.map((row: { components: Array<{ custom_id: string }> }) => row.components[0].custom_id)).toEqual([
      "name",
      "websiteUrl",
    ]);
  });

  it("opens the first organizer pop-up with the user's Discord name filled in", async () => {
    const response = await POST(
      signedRequest({
        data: { name: "add-hackathon", options: [{ name: "organizer", type: 1 }] },
        guild_id: "guild-1",
        member: member(),
        type: InteractionType.ApplicationCommand,
      })
    );
    const body = await response.json();
    const inputs = body.data.components.map((row: { components: Array<{ custom_id: string; value?: string; type: number }> }) => row.components[0]);

    expect(body.data.custom_id).toBe("ah:m:basics:new");
    expect(inputs).toHaveLength(5);
    expect(inputs.every((input: { type: number }) => input.type === ComponentType.TextInput)).toBe(true);
    expect(inputs.find((input: { custom_id: string }) => input.custom_id === "discordTag").value).toBe("maple.org");
  });

  it("turns away review clicks from outside the team role", async () => {
    const response = await POST(
      signedRequest({
        data: { component_type: ComponentType.Button, custom_id: "rv:approve:3f0c8a52-6a0e-4c4d-9a4f-0b9f6c1d2e3f" },
        guild_id: "guild-1",
        member: member(["someone-else"]),
        type: InteractionType.MessageComponent,
      })
    );

    expect(await response.json()).toMatchObject({ data: { content: "Only the team role can review hackathons." } });
    expect(after).not.toHaveBeenCalled();
  });

  it("asks the team for a reason before rejecting", async () => {
    const response = await POST(
      signedRequest({
        data: { component_type: ComponentType.Button, custom_id: "rv:reject:3f0c8a52-6a0e-4c4d-9a4f-0b9f6c1d2e3f" },
        guild_id: "guild-1",
        member: member(["team-role"]),
        type: InteractionType.MessageComponent,
      })
    );
    const body = await response.json();

    expect(body.type).toBe(InteractionResponseType.Modal);
    expect(body.data.custom_id).toBe("rvr:3f0c8a52-6a0e-4c4d-9a4f-0b9f6c1d2e3f");
    expect(body.data.components[0].components[0].value).toBe("Not a hackathon we list.");
  });
});
