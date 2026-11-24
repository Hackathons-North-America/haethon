import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv: { SCRAPER_IMPORT_SECRET?: string } = {};
const importAdminHackathons = vi.fn();
const findScraperImportReviewerId = vi.fn();

vi.mock("@/lib/env", () => ({ env: testEnv }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/hackathons/review-service", () => ({ importAdminHackathons }));
vi.mock("@/lib/db", () => ({ db: {} }));
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
});
