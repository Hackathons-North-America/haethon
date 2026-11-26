import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* The import review queue against a real database: what an upload or the
   scraper's run saves for a person, and what each decision does with it.
   External side effects are stubbed as in feed-import.test.ts. */
process.env.DISCORD_GUILD_ID = "900000000000000000";

vi.mock("@/lib/discord/sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/discord/sync")>()),
  ensureHackathonDiscordChannelOrThrow: vi.fn(async () => ({ status: "skipped" })),
  guildChannelListingForPreview: vi.fn(async () => null),
  reportHackathonSyncFailure: vi.fn(),
  retireHackathonDiscordChannel: vi.fn(async () => undefined),
  syncHackathonDiscordChannel: vi.fn(async () => ({ status: "skipped" })),
  syncHackathonDiscordChannelSafely: vi.fn(async () => ({ status: "skipped" })),
}));
vi.mock("@/lib/hackathons/catalog", () => ({ revalidateHackathonCaches: vi.fn() }));
vi.mock("@/lib/hackathons/image-ingest", () => ({
  assertReachableImageUrl: vi.fn(async () => undefined),
  fetchVerifiedImage: vi.fn(async (url?: string | null) =>
    url ? { bytes: new Uint8Array([1]), contentType: "image/png" } : undefined
  ),
  verifiedImageUrl: vi.fn(async (url?: string | null) => url ?? undefined),
}));
// Cover thumbnails have their own suite (cover-thumbnails.test.ts).
vi.mock("@/lib/hackathons/cover-thumbnails", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hackathons/cover-thumbnails")>()),
  generateCoverThumbnails: vi.fn(async () => ({ status: "skipped", reason: "unreachable" })),
  replaceCoverThumbnails: vi.fn(async () => undefined),
}));

const { ensureHackathonDiscordChannelOrThrow } = await import("@/lib/discord/sync");
const { db } = await import("@/lib/db");
const { hackathonDates, hackathonExternalIds, hackathons, hackathonSubmissions, users } = await import("@/lib/db/schema");
const { importAdminHackathonFixItems, importAdminHackathons, listHackathonSubmissions } = await import(
  "@/lib/hackathons/review-service"
);
const { decideImportCard, ImportCardError, listImportCards, saveFailedImportCard, updateImportCard } = await import(
  "@/lib/hackathons/import-queue"
);
const { adminHackathonImportSchema } = await import("@/lib/validations/hackathon");

let reviewerUserId: string;

/* An upload or the scraper's run: rows that need a person are queued. */
async function upload(rows: Record<string, unknown>[], via: "scraper" | "upload" = "scraper") {
  const parsed = adminHackathonImportSchema.parse({ hackathons: rows });

  return importAdminHackathons({ payloads: parsed.hackathons, reviewerUserId, review: "queue", via });
}

/* An admin deciding now, as before the queue existed: every row is published. */
async function publish(rows: Record<string, unknown>[]) {
  const parsed = adminHackathonImportSchema.parse({ hackathons: rows });

  return importAdminHackathons({ payloads: parsed.hackathons, reviewerUserId });
}

function decide(submissionId: string, action: "approve" | "approve_new" | "merge" | "reject") {
  return decideImportCard({ action, reviewerUserId, submissionId });
}

async function submission(id: string) {
  const [row] = await db.select().from(hackathonSubmissions).where(eq(hackathonSubmissions.id, id));

  return row;
}

async function count(table: typeof hackathons | typeof hackathonSubmissions) {
  return (await db.select({ id: table.id }).from(table)).length;
}

const BASE = {
  name: "Embodied Metal Hackathon",
  websiteUrl: "https://devpost.com/embodied",
  sourceUrl: "https://devpost.com/embodied",
  source: "devpost",
  city: "San Francisco",
  region: "CA",
  country: "United States",
  venue: "Shack15",
  startDate: "2026-07-17",
  endDate: "2026-07-18",
  format: "in_person",
  externalId: "devpost:embodied",
  externalIds: ["devpost:embodied"],
};

/* The same event under another name and feed: a likely match, below auto-merge. */
const LOOKALIKE = {
  ...BASE,
  name: "Embodied Metal Robotics Hackathon",
  websiteUrl: "https://embodied.example.com",
  sourceUrl: "https://embodied.example.com",
  source: "mlh",
  externalId: "mlh:embodied",
  externalIds: ["mlh:embodied"],
  autoApprove: true,
};

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE hackathon_external_ids, hackathon_submissions, hackathons, hackathon_series, organizations, discord_guilds, users CASCADE`
  );
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: "user_admin", email: "admin@example.test", username: "admin", role: "admin" })
    .returning({ id: users.id });
  reviewerUserId = user.id;
  vi.mocked(ensureHackathonDiscordChannelOrThrow).mockClear();
});

describe("auto-merging a near-certain match", () => {
  it("merges when neither side has application dates", async () => {
    // The scraper's daily run failed on exactly this: the same event listed by
    // a second feed, with nothing to add to the dates.
    const hackathonId = (await publish([{ ...BASE, autoApprove: true }])).results[0].hackathonId!;

    const result = await upload([
      { ...BASE, source: "cerebral_valley", externalId: "cerebralvalley:embodied", externalIds: ["cerebralvalley:embodied"], autoApprove: true },
    ]);

    expect(result.results[0]).toMatchObject({ hackathonId, status: "auto_merged" });
    expect(await count(hackathons)).toBe(1);
  });

  it("fills an application deadline the hackathon lacks", async () => {
    const hackathonId = (await publish([{ ...BASE, autoApprove: true }])).results[0].hackathonId!;

    await upload([
      {
        ...BASE,
        externalId: "cerebralvalley:embodied",
        externalIds: ["cerebralvalley:embodied"],
        applicationClosesAt: "2026-07-01",
        autoApprove: true,
      },
    ]);

    const [dates] = await db.select().from(hackathonDates).where(eq(hackathonDates.hackathonId, hackathonId));
    expect(dates.applicationClosesAt?.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(dates.applicationOpensAt).toBeNull();
  });
});

describe("queueing rows that need a person", () => {
  it("saves a row without autoApprove as a card and publishes nothing", async () => {
    const result = await upload([BASE]);

    expect(result).toMatchObject({ importedCount: 0, queuedCount: 1 });
    expect(result.results[0]).toMatchObject({ status: "queued" });
    expect(await count(hackathons)).toBe(0);

    const cards = await listImportCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: result.results[0].submissionId, duplicate: null, error: null, via: "scraper" });
    expect(cards[0].payload).toMatchObject({ name: BASE.name, externalId: "devpost:embodied", source: "devpost" });
    // The queue's own keys stay out of the event an admin sees and edits.
    expect(cards[0].payload).not.toHaveProperty("importKeys");
    expect(cards[0].payload).not.toHaveProperty("origin");
  });

  it("still publishes an auto-approved row at once", async () => {
    const result = await upload([{ ...BASE, autoApprove: true }]);

    expect(result.results[0]).toMatchObject({ status: "imported" });
    expect(await listImportCards()).toHaveLength(0);
  });

  it("saves a possible duplicate as a card that names its match", async () => {
    const existingId = (await publish([BASE])).results[0].hackathonId!;

    const result = await upload([LOOKALIKE]);

    expect(result.results[0]).toMatchObject({ matchedHackathonId: existingId, status: "duplicate_flagged" });
    expect(result.results[0].submissionId).toBeTruthy();
    expect(await count(hackathons)).toBe(1);
    expect((await listImportCards())[0].duplicate).toMatchObject({ hackathonId: existingId, name: BASE.name });
  });

  it("keeps one card when the event is sent again, with the feed's newer details", async () => {
    const first = await upload([BASE]);

    const second = await upload([{ ...BASE, venue: "Frontier Tower" }]);

    expect(second.results[0]).toMatchObject({ status: "queued", submissionId: first.results[0].submissionId });
    const cards = await listImportCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].payload.venue).toBe("Frontier Tower");
  });

  it("queues a key repeated within one request once", async () => {
    const result = await upload([BASE, { ...BASE, venue: "Frontier Tower" }]);

    expect(result.results.map((row) => row.status)).toEqual(["queued", "queued"]);
    expect(result.results[1].submissionId).toBe(result.results[0].submissionId);
    expect(await listImportCards()).toHaveLength(1);
  });

  it("tells rows without feed ids apart by name and start day", async () => {
    const bare = { ...BASE, externalId: undefined, externalIds: undefined };

    await upload([bare], "upload");
    await upload([bare, { ...bare, name: "Another Hackathon Entirely" }], "upload");

    expect((await listImportCards()).map((card) => card.payload.name)).toEqual([BASE.name, "Another Hackathon Entirely"]);
  });

  it("updates a published hackathon whether or not the row is auto-approved", async () => {
    const hackathonId = (await publish([BASE])).results[0].hackathonId!;

    const result = await upload([{ ...BASE, venue: "Frontier Tower" }]);

    expect(result.results[0]).toMatchObject({ hackathonId, status: "updated", updatedFields: ["venue"] });
    expect(await listImportCards()).toHaveLength(0);
  });
});

describe("deciding a card", () => {
  it("publishes on approve and resolves the same row", async () => {
    const cardId = (await upload([BASE])).results[0].submissionId!;

    const decision = await decide(cardId, "approve");

    expect(decision).toMatchObject({ status: "decided", result: { status: "imported", submissionId: cardId } });
    const hackathonId = decision.status === "decided" ? decision.result.hackathonId! : "";
    expect(await submission(cardId)).toMatchObject({
      approvedHackathonId: hackathonId,
      reviewClaimedAt: null,
      reviewedByUserId: reviewerUserId,
      status: "approved",
    });
    // One row per card: the decision did not record a second submission.
    expect(await count(hackathonSubmissions)).toBe(1);
    expect(await listImportCards()).toHaveLength(0);
    // The feed id is linked, so the scraper's next run updates this hackathon.
    const links = await db.select().from(hackathonExternalIds).where(eq(hackathonExternalIds.hackathonId, hackathonId));
    expect(links.map((link) => link.externalId)).toEqual(["devpost:embodied"]);
    expect((await upload([{ ...BASE, venue: "Frontier Tower" }])).results[0]).toMatchObject({ hackathonId, status: "updated" });
  });

  it("offers the channel decision for a Canadian or US event it approves", async () => {
    const cardId = (await upload([BASE])).results[0].submissionId!;

    const decision = await decide(cardId, "approve");

    expect(decision.status === "decided" && decision.result.discord).toMatchObject({ action: "create", eligible: true });
  });

  it("remembers a no when the scraper sends the event again", async () => {
    const cardId = (await upload([BASE])).results[0].submissionId!;

    expect(await decide(cardId, "reject")).toEqual({ status: "rejected" });
    expect(await submission(cardId)).toMatchObject({ reviewedByUserId: reviewerUserId, status: "rejected" });

    const again = await upload([{ ...BASE, venue: "Frontier Tower" }]);

    expect(again).toMatchObject({ dismissedCount: 1, queuedCount: 0 });
    expect(again.results[0]).toMatchObject({ status: "dismissed", submissionId: cardId });
    expect(await listImportCards()).toHaveLength(0);
    expect(await count(hackathons)).toBe(0);
  });

  it("merges a possible duplicate into its match and links the feed id", async () => {
    const existingId = (await publish([BASE])).results[0].hackathonId!;
    const cardId = (await upload([LOOKALIKE])).results[0].submissionId!;

    const decision = await decide(cardId, "merge");

    expect(decision).toMatchObject({ status: "decided", result: { hackathonId: existingId, status: "auto_merged" } });
    expect(await count(hackathons)).toBe(1);
    expect(await submission(cardId)).toMatchObject({ approvedHackathonId: existingId, matchedHackathonId: existingId, status: "merged" });
    const links = await db.select().from(hackathonExternalIds).where(eq(hackathonExternalIds.hackathonId, existingId));
    expect(links.map((link) => link.externalId).sort()).toEqual(["devpost:embodied", "mlh:embodied"]);
  });

  it("publishes a possible duplicate as its own hackathon when told to", async () => {
    await publish([BASE]);
    const cardId = (await upload([LOOKALIKE])).results[0].submissionId!;

    const decision = await decide(cardId, "approve_new");

    expect(decision).toMatchObject({ status: "decided", result: { status: "imported" } });
    expect(await count(hackathons)).toBe(2);
    expect(await submission(cardId)).toMatchObject({ status: "approved" });
  });

  it("leaves the card waiting, naming the match, when approval finds a duplicate", async () => {
    // Queued while the catalog was empty; the event was published before the
    // admin got to the card.
    const cardId = (await upload([{ ...LOOKALIKE, autoApprove: false }])).results[0].submissionId!;
    const existingId = (await publish([BASE])).results[0].hackathonId!;

    const decision = await decide(cardId, "approve");

    expect(decision).toMatchObject({ status: "decided", result: { matchedHackathonId: existingId, status: "duplicate_flagged" } });
    expect(await submission(cardId)).toMatchObject({ matchedHackathonId: existingId, reviewClaimedAt: null, status: "pending" });
    expect((await listImportCards())[0].duplicate).toMatchObject({ hackathonId: existingId });
  });

  it("refuses a second decision on the same card", async () => {
    const cardId = (await upload([BASE])).results[0].submissionId!;
    await decide(cardId, "approve");

    await expect(decide(cardId, "reject")).rejects.toMatchObject({ code: "conflict" });
    await expect(decide("00000000-0000-4000-8000-000000000000", "approve")).rejects.toBeInstanceOf(ImportCardError);
    expect(await count(hackathons)).toBe(1);
  });

  it("does not treat a form submission as a card", async () => {
    const [form] = await db
      .insert(hackathonSubmissions)
      .values({
        submittedByUserId: reviewerUserId,
        submitterType: "community",
        payload: { name: "Form Hack", submitterType: "community" },
        normalizedName: "Form Hack",
        websiteUrl: "https://form.example.com",
        sourceUrl: "https://form.example.com",
      })
      .returning({ id: hackathonSubmissions.id });

    await expect(decide(form.id, "approve")).rejects.toMatchObject({ code: "not_found" });
    expect(await listImportCards()).toHaveLength(0);
  });
});

describe("editing and failed cards", () => {
  it("saves an edit, clears the earlier match and keeps it when the feed sends the event again", async () => {
    await publish([BASE]);
    const cardId = (await upload([LOOKALIKE])).results[0].submissionId!;
    const [card] = await listImportCards();

    const saved = await updateImportCard({ event: { ...card.payload, name: "A Different Event Altogether" }, submissionId: cardId });

    expect(saved).toMatchObject({ duplicate: null, id: cardId });
    expect(saved.payload.name).toBe("A Different Event Altogether");

    await upload([LOOKALIKE]);

    const [after] = await listImportCards();
    expect(after.payload.name).toBe("A Different Event Altogether");
    expect(await submission(cardId)).toMatchObject({ normalizedName: "A Different Event Altogether" });
  });

  it("keeps a row that could not be imported, then imports it once fixed", async () => {
    const broken = { ...BASE, country: undefined, endDate: "2026-07-18" };

    const saved = await saveFailedImportCard({ error: "country: Required", event: broken, reviewerUserId });

    expect(saved.status).toBe("queued");
    const [card] = await listImportCards();
    expect(card).toMatchObject({ error: "country: Required", via: "upload" });

    // Still broken: approving says so and leaves the card where it is.
    await expect(decide(card.id, "approve")).rejects.toMatchObject({ code: "invalid" });
    expect(await submission(card.id)).toMatchObject({ reviewClaimedAt: null, status: "pending" });

    const fixed = await updateImportCard({ event: { ...card.payload, country: "United States" }, submissionId: card.id });
    expect(fixed.error).toBeNull();

    expect(await decide(card.id, "approve")).toMatchObject({ status: "decided", result: { status: "imported" } });
    expect(await count(hackathons)).toBe(1);
  });

  it("does not add a twin for a failed row that is already waiting", async () => {
    const cardId = (await upload([BASE])).results[0].submissionId!;

    const saved = await saveFailedImportCard({ error: "Import failed.", event: BASE, reviewerUserId });

    expect(saved).toEqual({ status: "queued", submissionId: cardId });
    expect((await listImportCards())[0].error).toBe("Import failed.");
  });
});

describe("records the scraper could not publish", () => {
  const record = (name: string, url: string) => ({
    source: "luma",
    reason: "missing country",
    sourceUrl: url,
    raw: { event: { api_id: `evt-${name}`, name, start_at: "2027-01-15T02:30:00.000Z", end_at: "2027-01-15T14:30:00.000Z" } },
  });

  it("queues each record once however often it is sent", async () => {
    const first = await importAdminHackathonFixItems({
      items: [record("Chennai Build Day", "https://luma.com/chennai")],
      reviewerUserId,
      skipKnown: true,
    });
    const second = await importAdminHackathonFixItems({
      items: [record("Chennai Build Day", "https://luma.com/chennai"), record("Pune Build Day", "https://luma.com/pune")],
      reviewerUserId,
      skipKnown: true,
    });

    expect(first).toMatchObject({ knownCount: 0, queuedCount: 1 });
    expect(second).toMatchObject({ knownCount: 1, queuedCount: 1 });
    expect(second.results.map((row) => row.status)).toEqual(["known", "queued"]);
    expect(await listHackathonSubmissions({ kind: "fix", status: "pending" })).toHaveLength(2);
  });

  it("does not bring back a record an admin already rejected", async () => {
    const first = await importAdminHackathonFixItems({
      items: [record("Chennai Build Day", "https://luma.com/chennai")],
      reviewerUserId,
      skipKnown: true,
    });
    await db
      .update(hackathonSubmissions)
      .set({ status: "rejected" })
      .where(eq(hackathonSubmissions.id, first.results[0].submissionId!));

    const second = await importAdminHackathonFixItems({
      items: [record("Chennai Build Day", "https://luma.com/chennai")],
      reviewerUserId,
      skipKnown: true,
    });

    expect(second).toMatchObject({ knownCount: 1, queuedCount: 0 });
  });

  it("always queues an admin's own upload", async () => {
    const items = [record("Chennai Build Day", "https://luma.com/chennai")];

    await importAdminHackathonFixItems({ items, reviewerUserId });
    const second = await importAdminHackathonFixItems({ items, reviewerUserId });

    expect(second).toMatchObject({ knownCount: 0, queuedCount: 1 });
  });
});

describe("listing submissions by kind", () => {
  it("keeps form submissions, broken imports and import records apart", async () => {
    await upload([BASE]);
    await publish([{ ...BASE, name: "Published Hack", externalId: "devpost:published", externalIds: ["devpost:published"] }]);
    await importAdminHackathonFixItems({
      items: [{ source: "luma", reason: "missing country", sourceUrl: "https://luma.com/x", raw: { event: { name: "Broken Hack" } } }],
      reviewerUserId,
    });
    await db.insert(hackathonSubmissions).values({
      submittedByUserId: reviewerUserId,
      submitterType: "community",
      payload: { name: "Form Hack", submitterType: "community" },
      normalizedName: "Form Hack",
      websiteUrl: "https://form.example.com",
      sourceUrl: "https://form.example.com",
    });

    const names = async (kind: "form" | "fix" | "import") =>
      (await listHackathonSubmissions({ kind })).map((row) => row.normalizedName).sort();

    expect(await names("form")).toEqual(["Form Hack"]);
    expect(await names("fix")).toEqual(["Broken Hack"]);
    expect(await names("import")).toEqual([BASE.name, "Published Hack"]);
    expect(await listHackathonSubmissions({ kind: "import", status: "pending" })).toHaveLength(1);
  });
});
