import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { resetFakeGuild } from "./fake-discord";
import { ensureBenchCatalog, jsonRequest, measure, newEventPayload, removeBenchRows, report, RUNS } from "./harness";

const { db } = await import("@/lib/db");
const { POST: importRoute } = await import("@/app/api/admin/hackathon-imports/route");
const { POST: discordChannelRoute } = await import("@/app/api/admin/hackathons/[id]/discord-channel/route");

type ImportBody = { data: { results: Array<{ hackathonId?: string; status: string; discord?: { eligible: boolean } }> } };

async function postImport(rows: unknown[]) {
  const response = await importRoute(jsonRequest("/api/admin/hackathon-imports", "POST", rows));
  expect(response.status).toBe(201);

  return (await response.json()) as ImportBody;
}

async function trackedChannels() {
  const result = await db.execute(sql`select channel_snowflake, name from discord_channels`);

  return (result.rows as Array<{ channel_snowflake: string; name: string }>).map((row) => ({
    channelSnowflake: row.channel_snowflake,
    name: row.name,
  }));
}

beforeAll(async () => {
  await removeBenchRows();
  await ensureBenchCatalog();
  resetFakeGuild(await trackedChannels());
});

describe("admin JSON import", () => {
  it("Import: one new card (the importer's Yes button)", async () => {
    await postImport([newEventPayload(0)]);
    const samples = [];

    for (let run = 0; run < RUNS; run += 1) {
      const row = newEventPayload(run + 1);
      let body: ImportBody | undefined;
      samples.push(
        await measure(async () => {
          body = await postImport([row]);
        })
      );
      expect(body?.data.results[0].status).toBe("imported");
      expect(body?.data.results[0].discord?.eligible).toBe(true);
    }

    report("import: 1 new card, 1 request", samples);
  });

  it("Import: 20 auto-approved cards, one request per card (how the old importer sent them)", async () => {
    const samples = [];

    for (let run = 0; run < Math.max(3, Math.ceil(RUNS / 4)); run += 1) {
      const rows = Array.from({ length: 20 }, (_, index) => newEventPayload(20 + run * 20 + index, { autoApprove: true }));
      samples.push(
        await measure(async () => {
          for (const row of rows) {
            await postImport([row]);
          }
        })
      );
    }

    report("import: 20 auto-approved cards, 20 requests", samples);
  });

  it("Import: 20 auto-approved cards in one request", async () => {
    const samples = [];

    for (let run = 0; run < Math.max(3, Math.ceil(RUNS / 4)); run += 1) {
      const rows = Array.from({ length: 20 }, (_, index) => newEventPayload(120 + run * 20 + index, { autoApprove: true }));
      samples.push(
        await measure(async () => {
          await postImport(rows);
        })
      );
    }

    report("import: 20 auto-approved cards, 1 request", samples);
  });

  it("Import: 20 cards the scraper sent before, unchanged, in one request", async () => {
    const rows = Array.from({ length: 20 }, (_, index) => newEventPayload(240 + index));
    await postImport(rows);
    const samples = [];

    for (let run = 0; run < Math.max(3, Math.ceil(RUNS / 4)); run += 1) {
      let body: ImportBody | undefined;
      samples.push(
        await measure(async () => {
          body = await postImport(rows);
        })
      );
      expect(body?.data.results.every((result) => result.status === "updated")).toBe(true);
    }

    report("import: 20 unchanged re-imports, 1 request", samples);
  });
});

describe("Create New Channel", () => {
  it("Approve channel for a freshly imported card", async () => {
    const samples = [];

    for (let run = 0; run < RUNS; run += 1) {
      const body = await postImport([newEventPayload(270 + run)]);
      const hackathonId = body.data.results[0].hackathonId!;
      samples.push(
        await measure(async () => {
          const response = await discordChannelRoute(
            jsonRequest(`/api/admin/hackathons/${hackathonId}/discord-channel`, "POST", { action: "approve" }),
            { params: Promise.resolve({ id: hackathonId }) }
          );
          expect(response.status).toBeLessThan(300);
        })
      );

      const channel = await db.execute(sql`select 1 from discord_channels where hackathon_id = ${hackathonId}`);
      expect(channel.rows).toHaveLength(1);
    }

    report("create channel: approve click", samples);
  });
});
