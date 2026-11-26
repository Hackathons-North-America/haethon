// @vitest-environment node
import { randomBytes } from "node:crypto";

import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* The real resize (sharp) runs; the database, UploadThing and the image fetch
   are stubbed. */
const dbState = vi.hoisted(() => ({ updatedRows: [{ id: "h1" }] as Array<{ id: string }>, sets: [] as unknown[] }));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/hackathons/catalog", () => ({ revalidateHackathonCaches: vi.fn() }));
vi.mock("@/lib/hackathons/image-ingest", () => ({ fetchImageForThumbnails: vi.fn() }));
vi.mock("@/lib/hackathons/cover-thumbnail-store", () => ({
  deleteCoverThumbnailFiles: vi.fn(async () => undefined),
  uploadCoverThumbnailFiles: vi.fn(async () => ["https://app.ufs.sh/f/small", "https://app.ufs.sh/f/large"]),
}));
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: (values: unknown) => {
        dbState.sets.push(values);
        return { where: () => ({ returning: async () => dbState.updatedRows }) };
      },
    }),
  },
}));

const { generateCoverThumbnails, renderCoverThumbnails, replaceCoverThumbnails } = await import(
  "@/lib/hackathons/cover-thumbnails"
);
const { deleteCoverThumbnailFiles, uploadCoverThumbnailFiles } = await import("@/lib/hackathons/cover-thumbnail-store");
const { fetchImageForThumbnails } = await import("@/lib/hackathons/image-ingest");
const { revalidateHackathonCaches } = await import("@/lib/hackathons/catalog");

/* Random noise compresses badly, so these stand in for a heavy photo. */
async function noiseImage(width: number, height: number, format: "png" | "jpeg" = "png") {
  const pixels = randomBytes(width * height * 3);

  const image = sharp(pixels, { raw: { width, height, channels: 3 } });

  return new Uint8Array(await (format === "png" ? image.png() : image.jpeg({ quality: 95 })).toBuffer());
}

async function animatedGif() {
  const frame = (background: string) =>
    sharp({ create: { width: 200, height: 100, channels: 3, background } }).raw().toBuffer();

  return new Uint8Array(
    await sharp(Buffer.concat([await frame("#c33"), await frame("#33c")]), { raw: { width: 200, height: 200, channels: 3, pageHeight: 100 } })
      .gif()
      .toBuffer()
  );
}

describe("renderCoverThumbnails", () => {
  it("makes a 640x320 and a 1280x640 WebP from a large original", async () => {
    const original = await noiseImage(1600, 900);
    const result = await renderCoverThumbnails(original);

    expect(result.status).toBe("rendered");
    if (result.status !== "rendered") return;

    const [small, large] = await Promise.all([sharp(result.small).metadata(), sharp(result.large).metadata()]);
    expect([small.format, small.width, small.height]).toEqual(["webp", 640, 320]);
    expect([large.format, large.width, large.height]).toEqual(["webp", 1280, 640]);
    expect(result.large.byteLength).toBeLessThan(original.byteLength);
  });

  it("crops a portrait original to 2:1 rather than letterboxing it", async () => {
    const result = await renderCoverThumbnails(await noiseImage(900, 1600, "jpeg"));

    expect(result.status).toBe("rendered");
    if (result.status !== "rendered") return;

    const small = await sharp(result.small).metadata();
    expect([small.width, small.height]).toEqual([640, 320]);
  });

  it("keeps an animated original, which a thumbnail would freeze", async () => {
    expect(await renderCoverThumbnails(await animatedGif())).toEqual({ status: "skipped", reason: "animated" });
  });

  it("keeps an original that is already no bigger than the large thumbnail", async () => {
    const tiny = new Uint8Array(
      await sharp({ create: { width: 64, height: 32, channels: 3, background: "#123456" } }).png().toBuffer()
    );

    expect(await renderCoverThumbnails(tiny)).toEqual({ status: "skipped", reason: "not-smaller" });
  });

  it("throws on bytes it cannot decode", async () => {
    await expect(renderCoverThumbnails(new Uint8Array([0, 0, 1, 0, 1, 2, 3]))).rejects.toThrow();
  });
});

describe("generateCoverThumbnails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.updatedRows = [{ id: "h1" }];
    dbState.sets = [];
  });

  it("uploads both sizes and stores their URLs", async () => {
    const bytes = await noiseImage(1600, 800);
    const result = await generateCoverThumbnails({
      hackathonId: "h1",
      sourceUrl: "https://cdn.example.com/cover.png",
      image: { bytes, contentType: "image/png" },
    });

    expect(result).toEqual({ status: "stored", small: "https://app.ufs.sh/f/small", large: "https://app.ufs.sh/f/large" });
    expect(fetchImageForThumbnails).not.toHaveBeenCalled();
    expect(vi.mocked(uploadCoverThumbnailFiles).mock.calls[0][0].map((file) => file.name)).toEqual([
      "cover-h1-640x320.webp",
      "cover-h1-1280x640.webp",
    ]);
    expect(dbState.sets).toEqual([
      { imageThumbSmallUrl: "https://app.ufs.sh/f/small", imageThumbLargeUrl: "https://app.ufs.sh/f/large" },
    ]);
    expect(revalidateHackathonCaches).toHaveBeenCalledOnce();
  });

  it("fetches the original itself when the caller has no bytes", async () => {
    vi.mocked(fetchImageForThumbnails).mockResolvedValueOnce({ bytes: await noiseImage(1600, 800), contentType: "image/png" });

    const result = await generateCoverThumbnails({ hackathonId: "h1", sourceUrl: "https://cdn.example.com/cover.png" });

    expect(fetchImageForThumbnails).toHaveBeenCalledWith("https://cdn.example.com/cover.png");
    expect(result.status).toBe("stored");
  });

  it("skips an unreachable original without touching storage", async () => {
    vi.mocked(fetchImageForThumbnails).mockResolvedValueOnce(undefined);

    expect(await generateCoverThumbnails({ hackathonId: "h1", sourceUrl: "https://cdn.example.com/dead.png" })).toEqual({
      status: "skipped",
      reason: "unreachable",
    });
    expect(uploadCoverThumbnailFiles).not.toHaveBeenCalled();
    expect(dbState.sets).toEqual([]);
  });

  it("throws away its uploads when the image changed in the meantime", async () => {
    dbState.updatedRows = [];

    const result = await generateCoverThumbnails({
      hackathonId: "h1",
      sourceUrl: "https://cdn.example.com/cover.png",
      image: { bytes: await noiseImage(1600, 800), contentType: "image/png" },
    });

    expect(result).toEqual({ status: "stale" });
    expect(deleteCoverThumbnailFiles).toHaveBeenCalledWith(["https://app.ufs.sh/f/small", "https://app.ufs.sh/f/large"]);
    expect(revalidateHackathonCaches).not.toHaveBeenCalled();
  });

  it("reports an upload failure instead of throwing, leaving the original in use", async () => {
    vi.mocked(uploadCoverThumbnailFiles).mockRejectedValueOnce(new Error("UploadThing is down"));

    const result = await generateCoverThumbnails({
      hackathonId: "h1",
      sourceUrl: "https://cdn.example.com/cover.png",
      image: { bytes: await noiseImage(1600, 800), contentType: "image/png" },
    });

    expect(result.status).toBe("failed");
    expect(dbState.sets).toEqual([]);
  });

  it("reports undecodable bytes instead of throwing", async () => {
    const result = await generateCoverThumbnails({
      hackathonId: "h1",
      sourceUrl: "https://cdn.example.com/favicon.ico",
      image: { bytes: new Uint8Array([0, 0, 1, 0, 1, 2, 3]), contentType: "image/x-icon" },
    });

    expect(result.status).toBe("failed");
    expect(uploadCoverThumbnailFiles).not.toHaveBeenCalled();
  });

  it("does not revalidate when the caller batches that itself", async () => {
    await generateCoverThumbnails({
      hackathonId: "h1",
      sourceUrl: "https://cdn.example.com/cover.png",
      image: { bytes: await noiseImage(1600, 800), contentType: "image/png" },
      revalidate: false,
    });

    expect(revalidateHackathonCaches).not.toHaveBeenCalled();
  });
});

describe("replaceCoverThumbnails", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the old image's thumbnails even when the image was removed", async () => {
    await replaceCoverThumbnails({ hackathonId: "h1", previous: ["https://app.ufs.sh/f/old-s", "https://app.ufs.sh/f/old-l"], sourceUrl: null });

    expect(deleteCoverThumbnailFiles).toHaveBeenCalledWith(["https://app.ufs.sh/f/old-s", "https://app.ufs.sh/f/old-l"]);
    expect(uploadCoverThumbnailFiles).not.toHaveBeenCalled();
  });

  it("swallows a failed delete", async () => {
    vi.mocked(deleteCoverThumbnailFiles).mockRejectedValueOnce(new Error("nope"));

    await expect(
      replaceCoverThumbnails({ hackathonId: "h1", previous: ["https://app.ufs.sh/f/old-s"], sourceUrl: null })
    ).resolves.toBeUndefined();
  });
});
