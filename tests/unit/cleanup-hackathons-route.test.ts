import { beforeEach, describe, expect, it, vi } from "vitest";

const { testEnv, backfillCoverThumbnails, deleteExpiredHackathonDiscordChannels, revalidateHackathonCaches, captureException } =
  vi.hoisted(() => ({
    testEnv: { CRON_SECRET: "cron-secret", UPLOADTHING_TOKEN: "ut-token" as string | undefined },
    backfillCoverThumbnails: vi.fn(),
    deleteExpiredHackathonDiscordChannels: vi.fn(),
    revalidateHackathonCaches: vi.fn(),
    captureException: vi.fn(),
  }));

vi.mock("@/lib/env", () => ({ env: testEnv }));
vi.mock("@sentry/nextjs", () => ({ captureException }));
vi.mock("@/lib/discord/sync", () => ({ deleteExpiredHackathonDiscordChannels }));
vi.mock("@/lib/security/rate-limit", () => ({ cleanupExpiredRateLimits: vi.fn(async () => 2) }));
vi.mock("@/lib/hackathons/catalog", () => ({ revalidateHackathonCaches }));
vi.mock("@/lib/hackathons/cover-thumbnails-backfill", () => ({ backfillCoverThumbnails }));

const { GET } = await import("@/app/api/cron/cleanup-hackathons/route");

function cronRequest(secret = "cron-secret") {
  return new Request("https://example.com/api/cron/cleanup-hackathons", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

const backfillTotals = { pending: 4, stored: 2, skipped: 1, stale: 0, failed: 0, deferred: 1 };

describe("GET /api/cron/cleanup-hackathons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testEnv.UPLOADTHING_TOKEN = "ut-token";
    deleteExpiredHackathonDiscordChannels.mockResolvedValue({ deleted: [], failed: [] });
    backfillCoverThumbnails.mockResolvedValue(backfillTotals);
  });

  it("refuses a request without the cron secret", async () => {
    const response = await GET(cronRequest("wrong"));

    expect(response.status).toBe(401);
    expect(backfillCoverThumbnails).not.toHaveBeenCalled();
  });

  it("catches up on missing cover thumbnails within the time budget, then refreshes the catalog", async () => {
    const before = Date.now();
    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    const { deadline } = backfillCoverThumbnails.mock.calls[0][0];
    expect(deadline).toBeGreaterThanOrEqual(before + 40_000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 40_000);
    expect(body.data.coverThumbnails).toEqual({ status: "ran", ...backfillTotals });
    expect(body.data.expiredRateLimitBuckets).toBe(2);
    expect(revalidateHackathonCaches).toHaveBeenCalledOnce();
  });

  it("skips the catch-up when UploadThing isn't configured", async () => {
    testEnv.UPLOADTHING_TOKEN = undefined;

    const body = await (await GET(cronRequest())).json();

    expect(backfillCoverThumbnails).not.toHaveBeenCalled();
    expect(body.data.coverThumbnails).toEqual({ status: "not-configured" });
  });

  it("reports a failed catch-up without failing the Discord cleanup", async () => {
    backfillCoverThumbnails.mockRejectedValueOnce(new Error("database unreachable"));

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    expect((await response.json()).data.coverThumbnails).toEqual({ status: "error" });
    expect(captureException).toHaveBeenCalledOnce();
    expect(revalidateHackathonCaches).toHaveBeenCalledOnce();
  });
});
