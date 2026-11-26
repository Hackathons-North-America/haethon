/* Which file a hackathon card's cover is drawn from. Client-safe and pure:
   the card, the catalog page's preload hint and the tests all go through
   coverImageAttributes(), so the URL the page preloads is always the one the
   card then requests.

   Covers are the organizers' original files, often several hundred KB to a
   few MB each. When a hackathon has resized copies (made in the background by
   lib/hackathons/cover-thumbnails.ts) the card offers the browser those two
   WebP widths instead and lets it pick by the slot's size and the screen's
   pixel density. Without them it falls back to the original. */

import { hackathonLogoSrc } from "@/lib/hackathons/logo-hosts";

/* 2:1, the cover's aspect ratio. Both are made for every cover. */
export const COVER_THUMBNAIL_SIZES = {
  small: { width: 640, height: 320 },
  large: { width: 1280, height: 640 },
} as const;

/* The cover's rendered width in each catalog layout (components/
   hackathon-search.tsx): one column on phones, two from 640px and three from
   90rem. Overestimates slightly (it ignores the sidebar and gutters), which
   only ever errs toward the sharper file. */
export const COVER_IMAGE_SIZES = "(min-width: 90rem) 33vw, (min-width: 640px) 50vw, 100vw";

export type CoverImageCard = {
  id: string;
  image?: string | null;
  imageThumbSmall?: string | null;
  imageThumbLarge?: string | null;
};

export type CoverImageAttributes = {
  src: string;
  srcSet?: string;
  sizes?: string;
};

/* A srcset candidate is "<url> <width>w", separated by commas, so a URL with
   whitespace or a comma in it would be split into nonsense. UploadThing URLs
   never contain either; anything else is not trusted into the srcset. */
function isSrcSetSafe(url: string) {
  return /^https:\/\/[^\s,]+$/.test(url);
}

/**
 * The <img> attributes for a card's cover, or null when it has no image.
 * `useOriginal` forces the organizer's file, which the card uses when a
 * thumbnail fails to load (for example one deleted moments ago by an edit).
 */
export function coverImageAttributes(card: CoverImageCard, useOriginal = false): CoverImageAttributes | null {
  if (!card.image) {
    return null;
  }

  const { imageThumbSmall: small, imageThumbLarge: large } = card;

  if (!useOriginal && small && large && isSrcSetSafe(small) && isSrcSetSafe(large)) {
    return {
      src: small,
      srcSet: `${small} ${COVER_THUMBNAIL_SIZES.small.width}w, ${large} ${COVER_THUMBNAIL_SIZES.large.width}w`,
      sizes: COVER_IMAGE_SIZES,
    };
  }

  return { src: hackathonLogoSrc(card.id, card.image) };
}

/**
 * The UploadThing file key of a URL we uploaded (https://<app>.ufs.sh/f/<key>,
 * or the older utfs.io/f/<key>), or null for any other URL. Deletes go only
 * through keys from here, so an organizer's own image URL can never be
 * mistaken for one of our files.
 */
export function uploadThingFileKey(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();

  if (parsed.protocol !== "https:" || !(host.endsWith(".ufs.sh") || host === "utfs.io")) {
    return null;
  }

  const match = parsed.pathname.match(/^\/f\/([^/]+)$/);

  return match ? decodeURIComponent(match[1]) : null;
}
