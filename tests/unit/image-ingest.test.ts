import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/remote-image", () => ({
  fetchSafeRemoteImage: vi.fn(async () => ({ bytes: new Uint8Array([1]), contentType: "image/png" })),
}));

const { fetchSafeRemoteImage } = await import("@/lib/security/remote-image");
const { assertReachableImageUrl, fetchImageForThumbnails, fetchVerifiedImage } = await import(
  "@/lib/hackathons/image-ingest"
);

const MB = 1024 * 1024;

describe("image download limits", () => {
  beforeEach(() => vi.mocked(fetchSafeRemoteImage).mockClear());

  it("keeps the 4MB limit for images that are stored or shown", async () => {
    await fetchVerifiedImage("https://cdn.example.com/cover.png");
    await assertReachableImageUrl("https://cdn.example.com/cover.png");

    expect(vi.mocked(fetchSafeRemoteImage).mock.calls.map(([, maxBytes]) => maxBytes)).toEqual([4 * MB, 4 * MB]);
  });

  it("lets the thumbnail job read originals up to 15MB, so large covers still get shrunk", async () => {
    await fetchImageForThumbnails("https://cdn.example.com/huge-cover.png");

    expect(fetchSafeRemoteImage).toHaveBeenCalledWith("https://cdn.example.com/huge-cover.png", 15 * MB);
  });

  it("treats a failed download as no image", async () => {
    vi.mocked(fetchSafeRemoteImage).mockRejectedValueOnce(new Error("too large"));

    expect(await fetchImageForThumbnails("https://cdn.example.com/enormous.png")).toBeUndefined();
  });
});
