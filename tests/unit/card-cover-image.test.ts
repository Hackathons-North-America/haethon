import { act, createElement as h } from "react";
import { preload } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HackathonCard, type HackathonCardData } from "@/components/hackathon-card";
import { COVER_IMAGE_SIZES, coverImageAttributes } from "@/lib/hackathons/cover-image";

vi.mock("next/navigation", () => ({
  usePathname: () => "/hackathons",
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const SMALL = "https://abc123.ufs.sh/f/small-key";
const LARGE = "https://abc123.ufs.sh/f/large-key";
const ORIGINAL = "https://images.lumacdn.com/event-covers/cover.png";

const CARD: HackathonCardData = {
  date: "Jul 17 - 18, 2026",
  id: "h1",
  image: ORIGINAL,
  imageThumbSmall: SMALL,
  imageThumbLarge: LARGE,
  location: "Toronto",
  name: "Cover Test Hackathon",
};

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function coverOf(container: ParentNode) {
  return container.querySelector<HTMLImageElement>("img[alt='Cover Test Hackathon cover']");
}

describe("HackathonCard cover", () => {
  it("renders the thumbnails as a lazy srcset", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(h(HackathonCard, { hackathon: CARD }));
    const image = coverOf(container)!;

    expect(image.getAttribute("src")).toBe(SMALL);
    expect(image.getAttribute("srcset")).toBe(`${SMALL} 640w, ${LARGE} 1280w`);
    expect(image.getAttribute("sizes")).toBe(COVER_IMAGE_SIZES);
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("decoding")).toBe("async");
    expect(image.className).toContain("object-cover");
  });

  it("renders the original, without a srcset, for a cover that has no thumbnails", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      h(HackathonCard, { hackathon: { ...CARD, imageThumbSmall: null, imageThumbLarge: null } })
    );
    const image = coverOf(container)!;

    expect(image.getAttribute("src")).toBe(ORIGINAL);
    expect(image.hasAttribute("srcset")).toBe(false);
    expect(image.hasAttribute("sizes")).toBe(false);
  });

  it("switches to the original when a thumbnail fails to load", () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(h(HackathonCard, { hackathon: CARD })));

    act(() => {
      coverOf(container)!.dispatchEvent(new Event("error"));
    });
    const image = coverOf(container)!;

    expect(image.getAttribute("src")).toBe(ORIGINAL);
    expect(image.hasAttribute("srcset")).toBe(false);
  });
});

describe("catalog page cover preload", () => {
  function PreloadFor({ card }: { card: HackathonCardData }) {
    const cover = coverImageAttributes(card)!;
    preload(cover.src, { as: "image", imageSrcSet: cover.srcSet, imageSizes: cover.sizes });
    return null;
  }

  it("describes the same srcset the card renders", () => {
    const html = renderToStaticMarkup(h("html", null, h("head"), h("body", null, h(PreloadFor, { card: CARD }))));

    expect(html).toContain('rel="preload"');
    expect(html).toContain(`imageSrcSet="${SMALL} 640w, ${LARGE} 1280w"`);
    expect(html).toContain(`imageSizes="${COVER_IMAGE_SIZES}"`);
  });
});
