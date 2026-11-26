import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv: { SCRAPER_IMPORT_SECRET?: string } = {};
const importAdminHackathons = vi.fn();
const findScraperImportReviewerId = vi.fn();
const revalidateHackathonCaches = vi.fn();
const after = vi.fn();
const enqueueAndDrainSafely = vi.fn();

vi.mock("@/lib/env", () => ({ env: testEnv }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/hackathons/review-service", () => ({ importAdminHackathons }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/hackathons/catalog", () => ({ revalidateHackathonCaches }));
vi.mock("@/lib/discord/review-queue", () => ({ enqueueAndDrainSafely }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after,
}));
vi.mock("@/lib/hackathons/scraper-import", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hackathons/scraper-import")>()),
  findScraperImportReviewerId,
}));

const { POST } = await import("@/app/api/cron/import-hackathons/route");
const { hasScraperSecret } = await import("@/lib/hackathons/scraper-import");

const row = {
  name: "MapleHacks 2027",
  websiteUrl: "https://maplehacks.ca",
  country: "Canada",
  city: "Toronto",
  startDate: "2027-01-16",
  endDate: "2027-01-17",
  format: "in_person",
  externalId: "luma:evt-1",
};

function request(body: unknown, authorization?: string) {
  return new Request("https://example.org/api/cron/import-hackathons", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("scraper secret", () => {
  it("accepts only the exact bearer secret", () => {
    expect(hasScraperSecret("Bearer s3cret", "s3cret")).toBe(true);
    expect(hasScraperSecret("Bearer s3cret!", "s3cret")).toBe(false);
    expect(hasScraperSecret("bearer s3cret", "s3cret")).toBe(false);
    expect(hasScraperSecret("s3cret", "s3cret")).toBe(false);
  });

  it("matches nothing when the header or the secret is missing", () => {
    expect(hasScraperSecret(null, "s3cret")).toBe(false);
    expect(hasScraperSecret("Bearer ", undefined)).toBe(false);
    expect(hasScraperSecret("Bearer undefined", undefined)).toBe(false);
  });
});

describe("POST /api/cron/import-hackathons", () => {
  beforeEach(() => {
    testEnv.SCRAPER_IMPORT_SECRET = "s3cret";
    importAdminHackathons.mockReset().mockResolvedValue({ importedCount: 1, results: [{ index: 0, status: "imported" }] });
    findScraperImportReviewerId.mockReset().mockResolvedValue("admin-user-id");
    revalidateHackathonCaches.mockReset();
    after.mockReset();
    enqueueAndDrainSafely.mockReset();
  });

  it("is switched off until the secret is configured", async () => {
    testEnv.SCRAPER_IMPORT_SECRET = undefined;

    const response = await POST(request({ hackathons: [row] }, "Bearer s3cret"));

    expect(response.status).toBe(503);
    expect(importAdminHackathons).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong secret without importing", async () => {
    expect((await POST(request({ hackathons: [row] }))).status).toBe(401);
    expect((await POST(request({ hackathons: [row] }, "Bearer wrong"))).status).toBe(401);
    expect(importAdminHackathons).not.toHaveBeenCalled();
  });

  it("rejects a payload the import schema does not accept", async () => {
    expect((await POST(request("not json", "Bearer s3cret"))).status).toBe(400);
    expect((await POST(request({ hackathons: [{ name: "No country" }] }, "Bearer s3cret"))).status).toBe(400);
    expect(importAdminHackathons).not.toHaveBeenCalled();
  });

  it("imports under the admin reviewer and returns the importer's result", async () => {
    const response = await POST(request({ hackathons: [row] }, "Bearer s3cret"));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { importedCount: 1, results: [{ index: 0, status: "imported" }] } });
    expect(importAdminHackathons).toHaveBeenCalledWith(
      expect.objectContaining({ reviewerUserId: "admin-user-id", ignoreDuplicates: false })
    );
    expect(importAdminHackathons.mock.calls[0][0].payloads[0].name).toBe("MapleHacks 2027");
  });

  it("defers image checks and Discord work past the response, as the admin import does", async () => {
    await POST(request({ hackathons: [row] }, "Bearer s3cret"));

    // Run inside the request, they took several seconds per batch and grew
    // with every auto-approved row's Discord channel.
    expect(importAdminHackathons.mock.calls[0][0].defer).toBe(after);
    expect(revalidateHackathonCaches).toHaveBeenCalledTimes(1);
  });

  it("does not refresh the catalog when the import fails", async () => {
    importAdminHackathons.mockRejectedValue(new Error("database down"));

    const response = await POST(request({ hackathons: [row] }, "Bearer s3cret"));

    expect(response.status).toBe(500);
    expect(revalidateHackathonCaches).not.toHaveBeenCalled();
  });

  it("never lets the caller bypass the duplicate check", async () => {
    await POST(request({ hackathons: [row], ignoreDuplicates: true }, "Bearer s3cret"));

    expect(importAdminHackathons).toHaveBeenCalledWith(expect.objectContaining({ ignoreDuplicates: false }));
  });

  it("refuses when there is no admin to record the import under", async () => {
    findScraperImportReviewerId.mockResolvedValue(null);

    const response = await POST(request({ hackathons: [row] }, "Bearer s3cret"));

    expect(response.status).toBe(503);
    expect(importAdminHackathons).not.toHaveBeenCalled();
  });

  it("posts possible duplicates and channel decisions to the Discord review channel after replying", async () => {
    importAdminHackathons.mockResolvedValue({
      results: [
        { duplicateScore: 0.7, index: 0, matchedHackathonId: "match-id", matchedName: "MapleHacks", status: "duplicate_flagged" },
        { discord: { eligible: true }, duplicateScore: 0, hackathonId: "new-id", index: 1, status: "imported" },
      ],
    });

    await POST(request({ hackathons: [row, { ...row, externalId: "luma:evt-2", name: "Other Hacks" }] }, "Bearer s3cret"));

    const task = after.mock.calls.map(([callback]) => callback).find((callback) => typeof callback === "function");
    expect(enqueueAndDrainSafely).not.toHaveBeenCalled();
    await task();
    expect(enqueueAndDrainSafely).toHaveBeenCalledWith([
      expect.objectContaining({ dedupeKey: "feed:luma:evt-1", hackathonId: "match-id", kind: "import_duplicate" }),
      expect.objectContaining({ dedupeKey: "new-id", hackathonId: "new-id", kind: "channel_decision" }),
    ]);
  });

  it("posts nothing when every row was imported or auto-approved", async () => {
    await POST(request({ hackathons: [row] }, "Bearer s3cret"));

    expect(after).not.toHaveBeenCalled();
  });
});
