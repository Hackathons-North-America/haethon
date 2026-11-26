import { describe, expect, it } from "vitest";

import { COVER_IMAGE_SIZES, coverImageAttributes, uploadThingFileKey } from "@/lib/hackathons/cover-image";

const SMALL = "https://abc123.ufs.sh/f/small-key";
const LARGE = "https://abc123.ufs.sh/f/large-key";
const ORIGINAL = "https://images.lumacdn.com/event-covers/cover.png";

describe("coverImageAttributes", () => {
  it("returns nothing for a card without an image", () => {
    expect(coverImageAttributes({ id: "h1", image: null, imageThumbSmall: SMALL, imageThumbLarge: LARGE })).toBeNull();
    expect(coverImageAttributes({ id: "h1" })).toBeNull();
  });

  it("offers both thumbnails as a srcset, with the small one as src", () => {
    expect(coverImageAttributes({ id: "h1", image: ORIGINAL, imageThumbSmall: SMALL, imageThumbLarge: LARGE })).toEqual({
      src: SMALL,
      srcSet: `${SMALL} 640w, ${LARGE} 1280w`,
      sizes: COVER_IMAGE_SIZES,
    });
  });

  it("falls back to the original without thumbnails", () => {
    expect(coverImageAttributes({ id: "h1", image: ORIGINAL })).toEqual({ src: ORIGINAL });
    expect(coverImageAttributes({ id: "h1", image: ORIGINAL, imageThumbSmall: null, imageThumbLarge: null })).toEqual({
      src: ORIGINAL,
    });
  });

  it("falls back to the original when only one thumbnail is present", () => {
    expect(coverImageAttributes({ id: "h1", image: ORIGINAL, imageThumbSmall: SMALL, imageThumbLarge: null })).toEqual({
      src: ORIGINAL,
    });
    expect(coverImageAttributes({ id: "h1", image: ORIGINAL, imageThumbSmall: null, imageThumbLarge: LARGE })).toEqual({
      src: ORIGINAL,
    });
  });

  it("uses the original when asked to (a thumbnail failed to load)", () => {
    expect(
      coverImageAttributes({ id: "h1", image: ORIGINAL, imageThumbSmall: SMALL, imageThumbLarge: LARGE }, true)
    ).toEqual({ src: ORIGINAL });
  });

  it("never puts a URL that would break srcset parsing into it", () => {
    for (const bad of ["https://abc.ufs.sh/f/a,b", "https://abc.ufs.sh/f/a b", "http://abc.ufs.sh/f/a"]) {
      expect(coverImageAttributes({ id: "h1", image: ORIGINAL, imageThumbSmall: bad, imageThumbLarge: LARGE })).toEqual({
        src: ORIGINAL,
      });
    }
  });
});

describe("uploadThingFileKey", () => {
  it("reads the key from UploadThing file URLs", () => {
    expect(uploadThingFileKey("https://abc123.ufs.sh/f/2e0fdb64_cover.webp")).toBe("2e0fdb64_cover.webp");
    expect(uploadThingFileKey("https://utfs.io/f/2e0fdb64_cover.webp")).toBe("2e0fdb64_cover.webp");
  });

  it("ignores anything that is not one of our UploadThing files", () => {
    for (const url of [
      null,
      undefined,
      "",
      "not a url",
      ORIGINAL,
      "http://abc123.ufs.sh/f/key",
      "https://abc123.ufs.sh/a/key",
      "https://abc123.ufs.sh/f/key/extra",
      "https://ufs.sh.evil.example/f/key",
      "https://evil.example/f/key",
    ]) {
      expect(uploadThingFileKey(url)).toBeNull();
    }
  });
});
