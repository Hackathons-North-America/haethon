import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* External side effects of an import are stubbed: Discord, Next's cache tags
   (no request context here) and image fetching (no network in tests). */
vi.mock("@/lib/discord/sync", () => ({
  previewHackathonDiscordChannel: vi.fn(async () => ({ eligible: false })),
  retireHackathonDiscordChannel: vi.fn(async () => undefined),
  syncHackathonDiscordChannelSafely: vi.fn(async () => ({ status: "skipped" })),
}));
vi.mock("@/lib/hackathons/catalog", () => ({ revalidateHackathonCaches: vi.fn() }));
vi.mock("@/lib/hackathons/image-ingest", () => ({
  assertReachableImageUrl: vi.fn(async () => undefined),
  verifiedImageUrl: vi.fn(async (url?: string | null) => url ?? undefined),
}));

const { db } = await import("@/lib/db");
const { hackathonDates, hackathonExternalIds, hackathonLocations, hackathons, hackathonSubmissions, users } = await import(
  "@/lib/db/schema"
);
const { importAdminHackathons } = await import("@/lib/hackathons/review-service");
const { backfillExternalIds } = await import("@/lib/hackathons/external-ids-backfill");
const { adminHackathonImportSchema } = await import("@/lib/validations/hackathon");

let reviewerUserId: string;

async function importRows(rows: Record<string, unknown>[]) {
  const parsed = adminHackathonImportSchema.parse({ hackathons: rows });
  return importAdminHackathons({ payloads: parsed.hackathons, reviewerUserId });
}

async function hackathonState(hackathonId: string) {
  const [row] = await db
    .select({
      name: hackathons.name,
      venue: hackathons.venue,
      source: hackathons.source,
      travelReimbursement: hackathons.travelReimbursement,
      startsAt: hackathonDates.startsAt,
      endsAt: hackathonDates.endsAt,
      city: hackathonLocations.city,
    })
    .from(hackathons)
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .where(eq(hackathons.id, hackathonId));

  return row;
}

async function linkedIds(hackathonId: string) {
  const rows = await db
    .select({ externalId: hackathonExternalIds.externalId })
    .from(hackathonExternalIds)
    .where(eq(hackathonExternalIds.hackathonId, hackathonId));

  return rows.map((row) => row.externalId).sort();
}

const BASE = {
  name: "Embodied Metal Hackathon",
  websiteUrl: "https://luma.com/embodied",
  sourceUrl: "https://luma.com/embodied",
  source: "luma",
  city: "San Francisco",
  region: "CA",
  country: "United States",
  venue: "Shack15",
  startDate: "2026-07-17",
  endDate: "2026-07-18",
  format: "in_person",
  externalId: "luma:evt-embodied",
  externalIds: ["luma:evt-embodied", "cerebralvalley:cv-embodied"],
};

beforeEach(async () => {
  await db.execute(sql`TRUNCATE hackathon_external_ids, hackathon_submissions, hackathons, hackathon_series, organizations, users CASCADE`);
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: "user_admin", email: "admin@example.test", username: "admin", role: "admin" })
    .returning({ id: users.id });
  reviewerUserId = user.id;
});

describe("feed-id imports", () => {
  it("links every feed id of a new import", async () => {
    const result = await importRows([BASE]);

    expect(result.results[0].status).toBe("imported");
    const hackathonId = result.results[0].hackathonId!;
    expect(await linkedIds(hackathonId)).toEqual(["cerebralvalley:cv-embodied", "luma:evt-embodied"]);
    expect((await hackathonState(hackathonId)).source).toBe("luma");
  });

  it("applies what the feed changed and keeps an admin's edit", async () => {
    const hackathonId = (await importRows([BASE])).results[0].hackathonId!;
    // An admin renames the event by hand.
    await db.update(hackathons).set({ name: "Embodied Metal (SF)" }).where(eq(hackathons.id, hackathonId));

    // The next export: Cerebral Valley's record won dedupe this time, the
    // venue moved and the dates were corrected to the local day.
    const result = await importRows([
      { ...BASE, externalId: "cerebralvalley:cv-embodied", venue: "Frontier Tower", startDate: "2026-07-16", endDate: "2026-07-17" },
    ]);

    expect(result.results[0]).toMatchObject({ status: "updated", hackathonId });
    expect(result.results[0].updatedFields).toEqual(["startDate", "endDate", "venue"]);
    const state = await hackathonState(hackathonId);
    expect(state.name).toBe("Embodied Metal (SF)");
    expect(state.venue).toBe("Frontier Tower");
    expect(state.startsAt?.toISOString().slice(0, 10)).toBe("2026-07-16");
    expect(state.endsAt?.toISOString().slice(0, 10)).toBe("2026-07-17");

    const audit = await db
      .select({ notes: hackathonSubmissions.reviewerNotes })
      .from(hackathonSubmissions)
      .where(eq(hackathonSubmissions.status, "merged"));
    expect(audit[0].notes).toContain("startDate, endDate, venue");
  });

  it("does not turn a flag off when the feed stops reporting it", async () => {
    const hackathonId = (await importRows([{ ...BASE, travelReimbursement: true }])).results[0].hackathonId!;

    const result = await importRows([BASE]);

    expect(result.results[0]).toMatchObject({ status: "updated", updatedFields: [] });
    expect((await hackathonState(hackathonId)).travelReimbursement).toBe(true);
  });

  it("records nothing for an unchanged re-import", async () => {
    await importRows([BASE]);
    const before = await db.select({ id: hackathonSubmissions.id }).from(hackathonSubmissions);

    const result = await importRows([BASE]);

    expect(result.results[0]).toMatchObject({ status: "updated", updatedFields: [] });
    expect(result.results[0].submissionId).toBeUndefined();
    expect(await db.select({ id: hackathonSubmissions.id }).from(hackathonSubmissions)).toHaveLength(before.length);
  });

  it("keeps consecutive editions of a series apart", async () => {
    const day1 = {
      ...BASE,
      name: "Hack Night",
      websiteUrl: "https://luma.com/night-1",
      sourceUrl: "https://luma.com/night-1",
      startDate: "2026-12-01",
      endDate: "2026-12-01",
      externalId: "luma:night-1",
      externalIds: undefined,
    };
    const day2 = {
      ...day1,
      websiteUrl: "https://luma.com/night-2",
      sourceUrl: "https://luma.com/night-2",
      startDate: "2026-12-02",
      endDate: "2026-12-02",
      externalId: "luma:night-2",
    };

    const result = await importRows([day1, day2]);

    expect(result.results.map((row) => row.status)).toEqual(["imported", "imported"]);
  });

  it("stores the Hack Club source", async () => {
    const result = await importRows([
      { ...BASE, source: "hackclub", websiteUrl: "https://counterspell.hackclub.com", externalId: "hackclub:7", externalIds: undefined },
    ]);

    expect((await hackathonState(result.results[0].hackathonId!)).source).toBe("hackclub");
  });
});

describe("backfill of earlier imports", () => {
  it("links old imports so a corrected date is applied on the next import", async () => {
    // An import made before hackathon_external_ids existed: the UTC-shifted
    // date the old scraper exported, and no link rows.
    const hackathonId = (await importRows([{ ...BASE, startDate: "2026-07-18", endDate: "2026-07-19" }])).results[0]
      .hackathonId!;
    await db.delete(hackathonExternalIds);

    expect(await backfillExternalIds({ dryRun: true })).toMatchObject({ linked: 2, hackathons: 1 });
    expect(await linkedIds(hackathonId)).toEqual([]);

    expect(await backfillExternalIds()).toMatchObject({ linked: 2, hackathons: 1, alreadyLinked: 0 });
    expect(await linkedIds(hackathonId)).toEqual(["cerebralvalley:cv-embodied", "luma:evt-embodied"]);
    // Re-running is harmless.
    expect(await backfillExternalIds()).toMatchObject({ linked: 0, alreadyLinked: 2 });

    const result = await importRows([BASE]);

    expect(result.results[0]).toMatchObject({ status: "updated", hackathonId });
    expect(result.results[0].updatedFields).toEqual(["startDate", "endDate"]);
    expect((await hackathonState(hackathonId)).startsAt?.toISOString().slice(0, 10)).toBe("2026-07-17");
  });

  it("skips submissions whose hackathon was deleted", async () => {
    const hackathonId = (await importRows([BASE])).results[0].hackathonId!;
    await db.delete(hackathonExternalIds);
    await db.delete(hackathons).where(eq(hackathons.id, hackathonId));

    expect(await backfillExternalIds()).toMatchObject({ linked: 0 });
  });
});
