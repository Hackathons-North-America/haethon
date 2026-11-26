import { randomBytes } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Cover retention against the local database: which hackathons qualify, the
   compare-and-set, the thumbnail gate, the admin toggle and a feed
   re-import. Stubbed: UploadThing (fake ufs.sh URLs, deletes recorded), the
   image download, Discord and Next's cache tags. */
process.env.DISCORD_GUILD_ID = "900000000000000000";

const store = vi.hoisted(() => ({
  images: new Map<string, Uint8Array>(),
  uploads: 0,
  deleted: [] as string[],
  /* Runs inside the next delete call, to simulate an edit landing mid-cleanup. */
  duringDelete: null as null | (() => Promise<void>),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: <Fn extends (...args: never[]) => unknown>(fn: Fn) => fn,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@/lib/discord/sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/discord/sync")>()),
  ensureHackathonDiscordChannelOrThrow: vi.fn(async () => ({ status: "skipped" })),
  guildChannelListingForPreview: vi.fn(async () => null),
  retireHackathonDiscordChannel: vi.fn(async () => undefined),
  syncHackathonDiscordChannel: vi.fn(async () => ({ status: "skipped" })),
  syncHackathonDiscordChannelSafely: vi.fn(async () => ({ status: "skipped" })),
}));
vi.mock("@/lib/hackathons/image-ingest", () => {
  const fetchVerifiedImage = async (url?: string | null) => {
    const bytes = url ? store.images.get(url) : undefined;
    return bytes ? { bytes, contentType: "image/png" } : undefined;
  };

  return {
    fetchVerifiedImage,
    verifiedImageUrl: async (url?: string | null) => ((await fetchVerifiedImage(url)) ? url! : undefined),
    assertReachableImageUrl: async (url: string) => {
      const image = await fetchVerifiedImage(url);
      if (!image) throw new Error("Image URL must point at a publicly reachable image.");
      return image;
    },
  };
});
vi.mock("@/lib/hackathons/cover-thumbnail-store", () => ({
  uploadCoverThumbnailFiles: vi.fn(async (files: Array<{ name: string }>) =>
    files.map((file) => `https://testapp.ufs.sh/f/${++store.uploads}-${file.name}`)
  ),
  deleteCoverThumbnailFiles: vi.fn(async (urls: Array<string | null | undefined>) => {
    const hook = store.duringDelete;
    store.duringDelete = null;
    await hook?.();
    store.deleted.push(...urls.filter((url): url is string => Boolean(url)));
  }),
}));

const { db } = await import("@/lib/db");
const { hackathonDates, hackathons, users } = await import("@/lib/db/schema");
const { clearExpiredCovers, isCoverRetentionExpired, listExpiredCovers } = await import("@/lib/hackathons/cover-retention");
const { generateCoverThumbnails } = await import("@/lib/hackathons/cover-thumbnails");
const { backfillCoverThumbnails } = await import("@/lib/hackathons/cover-thumbnails-backfill");
const { getAdminHackathon, setHackathonHnaApproved } = await import("@/lib/hackathons/admin-service");
const { importAdminHackathons } = await import("@/lib/hackathons/review-service");
const { deleteCoverThumbnailFiles } = await import("@/lib/hackathons/cover-thumbnail-store");
const { adminHackathonImportSchema } = await import("@/lib/validations/hackathon");

const DAY = 86_400_000;
const ORGANIZER_IMAGE = "https://images.example.com/cover.png";

/* Made once: noise compresses badly, so it stands in for a heavy photo. */
const PHOTO = new Uint8Array(
  await sharp(randomBytes(1600 * 800 * 3), { raw: { width: 1600, height: 800, channels: 3 } }).png().toBuffer()
);

let serial = 0;

/* A hackathon row with a cover, ended `endedDaysAgo` days ago (no dates row
   when null). */
async function hackathon(input: {
  endedDaysAgo: number | null;
  approved?: boolean;
  imageUrl?: string | null;
  thumbs?: boolean;
}) {
  const n = ++serial;
  const [row] = await db
    .insert(hackathons)
    .values({
      name: `Retention Test ${n}`,
      slug: `retention-test-${n}`,
      websiteUrl: `https://retention-${n}.example.com`,
      status: "completed",
      hnaApproved: input.approved ?? false,
      imageUrl: input.imageUrl === undefined ? ORGANIZER_IMAGE : input.imageUrl,
      imageThumbSmallUrl: input.thumbs === false ? null : `https://testapp.ufs.sh/f/${n}-small`,
      imageThumbLargeUrl: input.thumbs === false ? null : `https://testapp.ufs.sh/f/${n}-large`,
      publishedAt: new Date(),
    })
    .returning({ id: hackathons.id });

  if (input.endedDaysAgo !== null) {
    const endsAt = new Date(Date.now() - input.endedDaysAgo * DAY);
    await db.insert(hackathonDates).values({ hackathonId: row.id, startsAt: new Date(endsAt.getTime() - DAY), endsAt });
  }

  return row.id;
}

async function cover(hackathonId: string) {
  const [row] = await db
    .select({
      name: hackathons.name,
      websiteUrl: hackathons.websiteUrl,
      imageUrl: hackathons.imageUrl,
      small: hackathons.imageThumbSmallUrl,
      large: hackathons.imageThumbLargeUrl,
    })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId));

  return row;
}

let reviewerUserId: string;

beforeEach(async () => {
  await db.execute(sql`TRUNCATE hackathon_external_ids, hackathon_submissions, hackathons, hackathon_series, organizations, users CASCADE`);
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: "user_admin", email: "admin@example.test", username: "admin", role: "admin" })
    .returning({ id: users.id });
  reviewerUserId = user.id;
  store.images = new Map([[ORGANIZER_IMAGE, PHOTO]]);
  store.uploads = 0;
  store.deleted = [];
  store.duringDelete = null;
  vi.mocked(deleteCoverThumbnailFiles).mockClear();
});

describe("who qualifies", () => {
  it("is a non-approved hackathon that ended over 30 days ago and still has an image", async () => {
    const expired = await hackathon({ endedDaysAgo: 31 });
    const organizerImageOnly = await hackathon({ endedDaysAgo: 45, thumbs: false });
    const thumbsOnly = await hackathon({ endedDaysAgo: 60, imageUrl: null });
    await hackathon({ endedDaysAgo: 31, approved: true });
    await hackathon({ endedDaysAgo: 29 });
    await hackathon({ endedDaysAgo: -10 });
    await hackathon({ endedDaysAgo: null });
    await hackathon({ endedDaysAgo: 90, imageUrl: null, thumbs: false });

    const rows = await listExpiredCovers();

    // Longest-ended first.
    expect(rows.map((row) => row.id)).toEqual([thumbsOnly, organizerImageOnly, expired]);
    expect(await isCoverRetentionExpired(expired)).toBe(true);
  });

  it("caps a run at its limit and counts the rest", async () => {
    for (let index = 0; index < 3; index += 1) {
      await hackathon({ endedDaysAgo: 40 + index });
    }

    const result = await clearExpiredCovers({ limit: 2 });

    expect(result).toMatchObject({ expired: 3, selected: 2, cleared: 2 });
    expect(await listExpiredCovers()).toHaveLength(1);
  });
});

describe("clearExpiredCovers", () => {
  it("deletes only our files, nulls the three columns and keeps everything else", async () => {
    const organizerCover = await hackathon({ endedDaysAgo: 31 });
    const ourCover = await hackathon({ endedDaysAgo: 31, imageUrl: "https://testapp.ufs.sh/f/admin-upload" });
    const keeper = await hackathon({ endedDaysAgo: 31, approved: true });
    const before = await cover(organizerCover);
    const ours = await cover(ourCover);
    const kept = await cover(keeper);

    const result = await clearExpiredCovers();

    expect(result).toMatchObject({ expired: 2, selected: 2, cleared: 2, changed: 0, failed: 0, deletedFiles: 5 });
    expect(store.deleted.sort()).toEqual(
      [before.small, before.large, ours.small, ours.large, "https://testapp.ufs.sh/f/admin-upload"].sort()
    );
    expect(store.deleted).not.toContain(ORGANIZER_IMAGE);
    expect(await cover(organizerCover)).toEqual({ ...before, imageUrl: null, small: null, large: null });
    expect(await cover(ourCover)).toMatchObject({ imageUrl: null, small: null, large: null });
    expect(await cover(keeper)).toEqual(kept);
    expect((await getAdminHackathon(organizerCover))?.endsAt).toBeInstanceOf(Date);

    // Nothing left to do: a second run is a no-op.
    expect(await clearExpiredCovers()).toMatchObject({ expired: 0, selected: 0, cleared: 0 });
  });

  it("leaves the row as it is when the delete fails", async () => {
    const hackathonId = await hackathon({ endedDaysAgo: 31 });
    const before = await cover(hackathonId);
    vi.mocked(deleteCoverThumbnailFiles).mockRejectedValueOnce(new Error("UploadThing is down"));

    const result = await clearExpiredCovers();

    expect(result).toMatchObject({ cleared: 0, failed: 1 });
    expect(await cover(hackathonId)).toEqual(before);
    // The next run retries it.
    expect(await listExpiredCovers()).toHaveLength(1);
  });

  it("never wipes an image an admin changed while the files were being deleted", async () => {
    const hackathonId = await hackathon({ endedDaysAgo: 31 });
    store.duringDelete = async () => {
      await db
        .update(hackathons)
        .set({ imageUrl: "https://images.example.com/new.png", imageThumbSmallUrl: null, imageThumbLargeUrl: null })
        .where(eq(hackathons.id, hackathonId));
    };

    const result = await clearExpiredCovers();

    expect(result).toMatchObject({ cleared: 0, changed: 1 });
    expect(await cover(hackathonId)).toMatchObject({ imageUrl: "https://images.example.com/new.png" });
  });

  it("matches null columns in the compare-and-set", async () => {
    const hackathonId = await hackathon({ endedDaysAgo: 31, imageUrl: null });

    expect(await clearExpiredCovers()).toMatchObject({ cleared: 1 });
    expect(await cover(hackathonId)).toMatchObject({ imageUrl: null, small: null, large: null });
  });

  it("changes nothing on a dry run", async () => {
    const hackathonId = await hackathon({ endedDaysAgo: 31 });
    const before = await cover(hackathonId);
    const seen: string[] = [];

    const result = await clearExpiredCovers({ dryRun: true, onRow: (row) => seen.push(row.id) });

    expect(result).toMatchObject({ expired: 1, selected: 1, cleared: 0 });
    expect(seen).toEqual([hackathonId]);
    expect(await cover(hackathonId)).toEqual(before);
    expect(deleteCoverThumbnailFiles).not.toHaveBeenCalled();
  });
});

describe("thumbnail generation", () => {
  it("is skipped for an expired non-approved hackathon, by the backfill too", async () => {
    const expired = await hackathon({ endedDaysAgo: 31, thumbs: false });

    expect(await generateCoverThumbnails({ hackathonId: expired, sourceUrl: ORGANIZER_IMAGE })).toEqual({
      status: "skipped",
      reason: "expired",
    });
    expect(await backfillCoverThumbnails({ dryRun: true })).toMatchObject({ pending: 0 });
    expect(store.uploads).toBe(0);
  });

  it("still runs for approved, recent and undated hackathons", async () => {
    const approved = await hackathon({ endedDaysAgo: 31, approved: true, thumbs: false });
    const recent = await hackathon({ endedDaysAgo: 29, thumbs: false });
    const undated = await hackathon({ endedDaysAgo: null, thumbs: false });

    expect(await backfillCoverThumbnails()).toMatchObject({ pending: 3, stored: 3 });
    for (const id of [approved, recent, undated]) {
      expect((await cover(id)).small).toBeTruthy();
    }
  });
});

describe("setHackathonHnaApproved", () => {
  async function flag(hackathonId: string) {
    const [row] = await db
      .select({ approved: hackathons.hnaApproved, at: hackathons.hnaApprovedAt })
      .from(hackathons)
      .where(eq(hackathons.id, hackathonId));
    return row;
  }

  it("saves the flag with its timestamp, keeps the first approval's time and clears both", async () => {
    const hackathonId = await hackathon({ endedDaysAgo: 5 });

    await setHackathonHnaApproved(hackathonId, true);
    const approved = await flag(hackathonId);
    expect(approved.approved).toBe(true);
    expect(approved.at).toBeInstanceOf(Date);
    expect((await getAdminHackathon(hackathonId))?.hnaApproved).toBe(true);

    await setHackathonHnaApproved(hackathonId, true);
    expect((await flag(hackathonId)).at).toEqual(approved.at);

    await setHackathonHnaApproved(hackathonId, false);
    expect(await flag(hackathonId)).toEqual({ approved: false, at: null });
  });

  it("protects an expired hackathon from the next cleanup and makes its held-back thumbnails", async () => {
    const hackathonId = await hackathon({ endedDaysAgo: 40, thumbs: false });

    await setHackathonHnaApproved(hackathonId, true);

    expect(await listExpiredCovers()).toEqual([]);
    expect((await cover(hackathonId)).small).toBeTruthy();
  });
});

describe("a feed re-import after cleanup", () => {
  const ROW = {
    name: "Retention Feed Hackathon",
    websiteUrl: "https://luma.com/retention",
    sourceUrl: "https://luma.com/retention",
    country: "Canada",
    city: "Toronto",
    startDate: new Date(Date.now() - 41 * DAY).toISOString().slice(0, 10),
    endDate: new Date(Date.now() - 40 * DAY).toISOString().slice(0, 10),
    format: "in_person",
    externalId: "luma:evt-retention",
    imageUrl: ORGANIZER_IMAGE,
  };

  async function importRow(row: Record<string, unknown>) {
    const parsed = adminHackathonImportSchema.parse({ hackathons: [row] });
    return (await importAdminHackathons({ payloads: parsed.hackathons, reviewerUserId })).results[0];
  }

  it("does not bring back a cleared image when the feed sends the same URL", async () => {
    const { hackathonId } = await importRow(ROW);
    // Past retention already, so the import made no thumbnails.
    expect(await cover(hackathonId!)).toMatchObject({ imageUrl: ORGANIZER_IMAGE, small: null });

    await clearExpiredCovers();
    expect((await cover(hackathonId!)).imageUrl).toBeNull();

    const again = await importRow(ROW);
    expect(again.hackathonId).toBe(hackathonId);
    expect(await cover(hackathonId!)).toMatchObject({ imageUrl: null, small: null, large: null });
    expect(store.uploads).toBe(0);
  });

  it("stores a changed feed image URL without thumbnails, for the next cleanup to clear", async () => {
    const changed = "https://images.example.com/changed.png";
    store.images.set(changed, PHOTO);
    const { hackathonId } = await importRow(ROW);
    await clearExpiredCovers();

    await importRow({ ...ROW, imageUrl: changed });

    expect(await cover(hackathonId!)).toMatchObject({ imageUrl: changed, small: null, large: null });
    expect(store.uploads).toBe(0);
    expect(await listExpiredCovers()).toHaveLength(1);
  });
});
