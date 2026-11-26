import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/remote-image", () => ({
  fetchSafeRemoteImage: vi.fn(async () => ({ bytes: new Uint8Array([1]), contentType: "image/png" })),
}));

const { fetchSafeRemoteImage } = await import("@/lib/security/remote-image");
const { assertReachableImageUrl, fetchVerifiedImage, verifiedImageUrl } = await import("@/lib/hackathons/image-ingest");

const MB = 1024 * 1024;

describe("image download limits", () => {
  beforeEach(() => vi.mocked(fetchSafeRemoteImage).mockClear());

  it("lets imports and the thumbnail job read covers up to 15MB, so large covers are kept and shrunk", async () => {
    await fetchVerifiedImage("https://cdn.example.com/huge-cover.png");
    await verifiedImageUrl("https://cdn.example.com/huge-cover.png");

    expect(vi.mocked(fetchSafeRemoteImage).mock.calls).toEqual([
      ["https://cdn.example.com/huge-cover.png", 15 * MB],
      ["https://cdn.example.com/huge-cover.png", 15 * MB],
    ]);
  });

  it("keeps the 4MB limit for admin and organizer edits", async () => {
    await assertReachableImageUrl("https://cdn.example.com/cover.png");

    expect(fetchSafeRemoteImage).toHaveBeenCalledWith("https://cdn.example.com/cover.png", 4 * MB);
  });

  it("drops an image it can't fetch instead of failing the import", async () => {
    vi.mocked(fetchSafeRemoteImage).mockRejectedValueOnce(new Error("too large"));

    expect(await fetchVerifiedImage("https://cdn.example.com/enormous.png")).toBeUndefined();
    expect(await verifiedImageUrl(null)).toBeUndefined();
  });

  it("tells an editor about the 4MB limit", async () => {
    vi.mocked(fetchSafeRemoteImage).mockRejectedValueOnce(new Error("too large"));

    await expect(assertReachableImageUrl("https://cdn.example.com/huge-cover.png")).rejects.toThrow("under 4MB");
  });
});
