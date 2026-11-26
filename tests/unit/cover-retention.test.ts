// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/* The cleanup's orchestration with the database and UploadThing stubbed:
   what gets deleted, in which order, and what a failure leaves behind. Which
   rows qualify, and the compare-and-set itself, run against a real database
   in tests/integration/cover-retention.test.ts. */
type Row = {
  id: string;
  name: string;
  endsAt: Date;
  imageUrl: string | null;
  imageThumbSmallUrl: string | null;
  imageThumbLargeUrl: string | null;
};

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  /* How many upcoming compare-and-sets find their row changed. */
  changedNext: 0,
  updates: [] as unknown[],
  events: [] as string[],
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/hackathons/catalog", () => ({ revalidateHackathonCaches: vi.fn() }));
vi.mock("@/lib/hackathons/cover-thumbnail-store", () => ({
  deleteCoverThumbnailFiles: vi.fn(async (urls: string[]) => {
    state.events.push(`delete:${urls.join(",")}`);
  }),
  uploadCoverThumbnailFiles: vi.fn(),
}));
vi.mock("@/lib/db", () => {
  /* A query builder whose every step returns itself; awaiting it yields `result`. */
  const chain = (result: () => unknown) => {
    const builder: Record<string, unknown> = {};
    for (const step of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
      builder[step] = () => builder;
    }
    builder.then = (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
      Promise.resolve().then(result).then(resolve, reject);
    return builder;
  };

  return {
    db: {
      select: (selection: Record<string, unknown>) =>
        "count" in selection ? chain(() => [{ count: state.rows.length }]) : chain(() => state.rows),
      update: () => ({
        set: (values: unknown) => ({
          where: () => ({
            returning: async () => {
              state.updates.push(values);
              state.events.push("update");
              if (state.changedNext > 0) {
                state.changedNext -= 1;
                return [];
              }
              return [{ id: "row" }];
            },
          }),
        }),
      }),
    },
  };
});

const { clearExpiredCovers, uploadThingFilesOf } = await import("@/lib/hackathons/cover-retention");
const { deleteCoverThumbnailFiles } = await import("@/lib/hackathons/cover-thumbnail-store");
const { revalidateHackathonCaches } = await import("@/lib/hackathons/catalog");
const Sentry = await import("@sentry/nextjs");

function row(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    name: `Hackathon ${id}`,
    endsAt: new Date("2026-09-01T00:00:00.000Z"),
    imageUrl: `https://organizer.example.com/${id}.png`,
    imageThumbSmallUrl: `https://app.ufs.sh/f/${id}-small`,
    imageThumbLargeUrl: `https://app.ufs.sh/f/${id}-large`,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
  state.changedNext = 0;
  state.updates = [];
  state.events = [];
});

async function clearRows(rows: Row[], options: Parameters<typeof clearExpiredCovers>[0] = {}) {
  state.rows = rows;
  return clearExpiredCovers(options);
}

describe("uploadThingFilesOf", () => {
  it("picks both thumbnails and only an UploadThing original, deduplicated", () => {
    expect(uploadThingFilesOf(row("a"))).toEqual(["https://app.ufs.sh/f/a-small", "https://app.ufs.sh/f/a-large"]);
    expect(uploadThingFilesOf(row("b", { imageUrl: "https://utfs.io/f/b-original" }))).toEqual([
      "https://app.ufs.sh/f/b-small",
      "https://app.ufs.sh/f/b-large",
      "https://utfs.io/f/b-original",
    ]);
    expect(
      uploadThingFilesOf(
        row("c", { imageUrl: "https://app.ufs.sh/f/same", imageThumbSmallUrl: "https://app.ufs.sh/f/same", imageThumbLargeUrl: null })
      )
    ).toEqual(["https://app.ufs.sh/f/same"]);
    expect(uploadThingFilesOf(row("d", { imageThumbSmallUrl: null, imageThumbLargeUrl: null }))).toEqual([]);
  });

  it("never treats a lookalike host as ours", () => {
    expect(
      uploadThingFilesOf(
        row("e", {
          imageUrl: "https://ufs.sh.evil.example/f/x",
          imageThumbSmallUrl: "http://app.ufs.sh/f/plain-http",
          imageThumbLargeUrl: "https://app.ufs.sh/not-a-file/x",
        })
      )
    ).toEqual([]);
  });
});

describe("clearExpiredCovers", () => {
  it("deletes the UploadThing files first, then nulls all three columns", async () => {
    const result = await clearRows([row("a", { imageUrl: "https://app.ufs.sh/f/a-original" })]);

    expect(state.events).toEqual([
      "delete:https://app.ufs.sh/f/a-small,https://app.ufs.sh/f/a-large,https://app.ufs.sh/f/a-original",
      "update",
    ]);
    expect(state.updates).toEqual([{ imageUrl: null, imageThumbSmallUrl: null, imageThumbLargeUrl: null }]);
    expect(result).toMatchObject({ expired: 1, selected: 1, cleared: 1, changed: 0, failed: 0, deletedFiles: 3 });
  });

  it("only deletes UploadThing keys: an organizer's image is cleared from the row but never deleted", async () => {
    await clearRows([row("a")]);

    expect(deleteCoverThumbnailFiles).toHaveBeenCalledOnce();
    expect(vi.mocked(deleteCoverThumbnailFiles).mock.calls[0][0]).toEqual([
      "https://app.ufs.sh/f/a-small",
      "https://app.ufs.sh/f/a-large",
    ]);
    expect(state.updates).toHaveLength(1);
  });

  it("clears a row with only an organizer image without calling UploadThing", async () => {
    const result = await clearRows([row("a", { imageThumbSmallUrl: null, imageThumbLargeUrl: null })]);

    expect(deleteCoverThumbnailFiles).not.toHaveBeenCalled();
    expect(result).toMatchObject({ cleared: 1, deletedFiles: 0 });
  });

  it("leaves the row as it is when the delete fails, reports it and carries on", async () => {
    vi.mocked(deleteCoverThumbnailFiles).mockRejectedValueOnce(new Error("UploadThing is down"));

    const result = await clearRows([row("a"), row("b")]);

    expect(result).toMatchObject({ selected: 2, cleared: 1, failed: 1 });
    expect(state.updates).toHaveLength(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "UploadThing is down" }),
      expect.objectContaining({ tags: { feature: "cover-retention" }, extra: expect.objectContaining({ hackathonId: "a" }) })
    );
  });

  it("counts a row an edit changed meanwhile as changed, not cleared", async () => {
    state.changedNext = 1;
    const result = await clearRows([row("a")]);

    expect(result).toMatchObject({ cleared: 0, changed: 1, failed: 0 });
    expect(revalidateHackathonCaches).not.toHaveBeenCalled();
  });

  it("revalidates the catalog once when anything was cleared", async () => {
    const result = await clearRows([row("a"), row("b"), row("c")]);

    expect(result.cleared).toBe(3);
    expect(revalidateHackathonCaches).toHaveBeenCalledOnce();
  });

  it("does not revalidate when nothing was cleared, or when the caller does it", async () => {
    await clearExpiredCovers();
    expect(revalidateHackathonCaches).not.toHaveBeenCalled();

    await clearRows([row("a")], { revalidate: false });
    expect(revalidateHackathonCaches).not.toHaveBeenCalled();
  });

  it("changes nothing on a dry run and lists what it would clear", async () => {
    state.rows = [row("a"), row("b")];
    const seen: Array<[string, unknown]> = [];
    const result = await clearExpiredCovers({ dryRun: true, onRow: (target, outcome) => seen.push([target.id, outcome]) });

    expect(seen).toEqual([
      ["a", null],
      ["b", null],
    ]);
    expect(result).toMatchObject({ expired: 2, selected: 2, cleared: 0 });
    expect(deleteCoverThumbnailFiles).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
  });

  it("stops starting rows once the deadline has passed", async () => {
    state.rows = [row("a"), row("b")];
    const result = await clearExpiredCovers({ deadline: Date.now() - 1 });

    expect(result).toMatchObject({ selected: 2, cleared: 0, deferred: 2 });
    expect(deleteCoverThumbnailFiles).not.toHaveBeenCalled();
  });
});
