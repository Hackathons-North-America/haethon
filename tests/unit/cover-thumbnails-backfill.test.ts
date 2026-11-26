import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rows, generateCoverThumbnails } = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; name: string; imageUrl: string }>,
  generateCoverThumbnails: vi.fn(),
}));

/* The pending-rows query, as a chain that resolves to `rows`. */
vi.mock("@/lib/db", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: (count: number) => Promise.resolve(rows.slice(0, count)),
    then: (resolve: (value: typeof rows) => unknown) => Promise.resolve(rows).then(resolve),
  };

  return { db: { select: () => chain } };
});
vi.mock("@/lib/hackathons/cover-thumbnails", () => ({ generateCoverThumbnails }));

const { backfillCoverThumbnails } = await import("@/lib/hackathons/cover-thumbnails-backfill");

describe("backfillCoverThumbnails deadline", () => {
  beforeEach(() => {
    rows.splice(0, rows.length, ...["a", "b", "c", "d"].map((id) => ({ id, name: id, imageUrl: `https://x/${id}.png` })));
    generateCoverThumbnails.mockReset();
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => vi.useRealTimers());

  it("runs everything when no deadline is given", async () => {
    generateCoverThumbnails.mockResolvedValue({ status: "stored", small: "s", large: "l" });

    expect(await backfillCoverThumbnails({ concurrency: 1 })).toMatchObject({ pending: 4, stored: 4, deferred: 0 });
  });

  it("starts no new cover after the deadline and counts the rest as deferred", async () => {
    // Each cover takes 10 s of (fake) clock time.
    generateCoverThumbnails.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 10_000);
      return { status: "stored", small: "s", large: "l" };
    });

    const result = await backfillCoverThumbnails({ concurrency: 1, deadline: 15_000 });

    // Started at 0 s and 10 s; at 20 s the deadline had passed.
    expect(generateCoverThumbnails.mock.calls.map(([input]) => input.hackathonId)).toEqual(["a", "b"]);
    expect(result).toMatchObject({ pending: 4, stored: 2, deferred: 2 });
  });

  it("counts each outcome", async () => {
    generateCoverThumbnails
      .mockResolvedValueOnce({ status: "stored", small: "s", large: "l" })
      .mockResolvedValueOnce({ status: "skipped", reason: "not-smaller" })
      .mockResolvedValueOnce({ status: "failed", error: new Error("upload") })
      .mockResolvedValueOnce({ status: "stale" });

    expect(await backfillCoverThumbnails({ concurrency: 2 })).toEqual({
      pending: 4,
      stored: 1,
      skipped: 1,
      stale: 1,
      failed: 1,
      deferred: 0,
    });
  });
});
