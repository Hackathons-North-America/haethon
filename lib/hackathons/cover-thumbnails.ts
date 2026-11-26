/* Resized copies of hackathon covers, so the catalog sends a visitor a few
   tens of KB per card instead of the organizer's original file.

   Whenever a cover is set or changed (admin and organizer edits, approvals,
   imports, feed updates) the write clears the hackathon's thumbnail columns
   and hands generateCoverThumbnails() to afterResponse(): the response does
   not wait for the resize or the uploads. Everything here is best-effort.
   Until thumbnails exist, or if making them fails, the card shows the
   original, exactly as before (lib/hackathons/cover-image.ts). */

import * as Sentry from "@sentry/nextjs";
import { and, eq, isNull } from "drizzle-orm";
import sharp from "sharp";

import { db } from "@/lib/db";
import { hackathons } from "@/lib/db/schema";
import { revalidateHackathonCaches } from "@/lib/hackathons/catalog";
import { COVER_THUMBNAIL_SIZES } from "@/lib/hackathons/cover-image";
import { deleteCoverThumbnailFiles, uploadCoverThumbnailFiles } from "@/lib/hackathons/cover-thumbnail-store";
import { fetchImageForThumbnails, type VerifiedImage } from "@/lib/hackathons/image-ingest";

/* Matches next/image's default. Covers are photos and posters seen at card
   size, where 75 is indistinguishable from the original. */
const WEBP_QUALITY = 75;

export type RenderedCoverThumbnails =
  | { status: "rendered"; small: Buffer; large: Buffer }
  | { status: "skipped"; reason: "animated" | "not-smaller" };

/**
 * Cuts the two 2:1 WebP thumbnails from an image's bytes. `fit: cover` with
 * the centre position is the same crop the card's `object-cover` applies to
 * the original, so the card looks the same either way.
 *
 * Skips (rather than fails) two cases where the original is the better file:
 * animated images, which would freeze on their first frame, and originals
 * already no bigger than the large thumbnail. Throws on bytes sharp cannot
 * decode (ICO, for one).
 */
export async function renderCoverThumbnails(bytes: Uint8Array): Promise<RenderedCoverThumbnails> {
  const metadata = await sharp(bytes).metadata();

  if ((metadata.pages ?? 1) > 1) {
    return { status: "skipped", reason: "animated" };
  }

  const render = ({ width, height }: { width: number; height: number }) =>
    sharp(bytes)
      // Bakes in the EXIF orientation, which the browser would otherwise
      // apply to the original and WebP output would lose.
      .rotate()
      .resize(width, height, { fit: "cover", position: "centre" })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

  const [small, large] = await Promise.all([render(COVER_THUMBNAIL_SIZES.small), render(COVER_THUMBNAIL_SIZES.large)]);

  if (large.byteLength >= bytes.byteLength) {
    return { status: "skipped", reason: "not-smaller" };
  }

  return { status: "rendered", small, large };
}

export type CoverThumbnailResult =
  | { status: "stored"; small: string; large: string }
  | { status: "skipped"; reason: "animated" | "not-smaller" | "unreachable" }
  /* The hackathon's image changed (or it was deleted, or it already has
     thumbnails) while these were being made; they were thrown away. */
  | { status: "stale" }
  | { status: "failed"; error: unknown };

function reportFailure(error: unknown, extra: Record<string, unknown>) {
  console.warn("Cover thumbnail work failed; the original image stays in use.", extra, error);
  Sentry.captureException(error, { extra, tags: { feature: "cover-thumbnails" } });
}

/**
 * Makes, uploads and stores the thumbnails of `sourceUrl` for one hackathon.
 * `image` is the already-downloaded original when the caller has it (the
 * write that vetted the URL); otherwise it is fetched through the same SSRF
 * guarded, size-capped fetch used at ingest.
 *
 * The row is only written while its imageUrl is still `sourceUrl` and it has
 * no thumbnails yet, so a slow run never overwrites a newer image's
 * thumbnails or attaches thumbnails to the wrong image. Never throws.
 */
export async function generateCoverThumbnails(input: {
  hackathonId: string;
  sourceUrl: string;
  image?: VerifiedImage;
  /* Off when the caller revalidates once for a whole batch. */
  revalidate?: boolean;
}): Promise<CoverThumbnailResult> {
  let uploaded: string[] = [];

  try {
    const image = input.image ?? (await fetchImageForThumbnails(input.sourceUrl));

    if (!image) {
      return { status: "skipped", reason: "unreachable" };
    }

    const rendered = await renderCoverThumbnails(image.bytes);

    if (rendered.status === "skipped") {
      return rendered;
    }

    const { small: smallSize, large: largeSize } = COVER_THUMBNAIL_SIZES;
    uploaded = await uploadCoverThumbnailFiles([
      { name: `cover-${input.hackathonId}-${smallSize.width}x${smallSize.height}.webp`, bytes: rendered.small },
      { name: `cover-${input.hackathonId}-${largeSize.width}x${largeSize.height}.webp`, bytes: rendered.large },
    ]);
    const [small, large] = uploaded;

    const [row] = await db
      .update(hackathons)
      .set({ imageThumbSmallUrl: small, imageThumbLargeUrl: large })
      .where(
        and(
          eq(hackathons.id, input.hackathonId),
          eq(hackathons.imageUrl, input.sourceUrl),
          isNull(hackathons.imageThumbSmallUrl)
        )
      )
      .returning({ id: hackathons.id });

    if (!row) {
      await deleteCoverThumbnailsSafely(uploaded);
      return { status: "stale" };
    }

    if (input.revalidate !== false) {
      revalidateHackathonCaches();
    }

    return { status: "stored", small, large };
  } catch (error) {
    if (uploaded.length) {
      await deleteCoverThumbnailsSafely(uploaded);
    }

    reportFailure(error, { hackathonId: input.hackathonId, sourceUrl: input.sourceUrl });

    return { status: "failed", error };
  }
}

/** Deletes thumbnails that no longer belong to any image. Never throws: a
    file left behind costs storage, not correctness. */
export async function deleteCoverThumbnailsSafely(urls: Array<string | null | undefined>) {
  if (!urls.some(Boolean)) {
    return;
  }

  try {
    await deleteCoverThumbnailFiles(urls);
  } catch (error) {
    reportFailure(error, { urls });
  }
}

/**
 * After a hackathon's image changed: deletes the previous image's thumbnails
 * and makes the new image's, if it has one. The caller has already cleared
 * the thumbnail columns in the same write that changed imageUrl.
 */
export async function replaceCoverThumbnails(input: {
  hackathonId: string;
  previous: Array<string | null | undefined>;
  sourceUrl: string | null;
  image?: VerifiedImage;
}) {
  await Promise.all([
    deleteCoverThumbnailsSafely(input.previous),
    input.sourceUrl
      ? generateCoverThumbnails({ hackathonId: input.hackathonId, sourceUrl: input.sourceUrl, image: input.image })
      : undefined,
  ]);
}

/* The columns to write alongside a changed imageUrl. */
export const CLEARED_COVER_THUMBNAILS = { imageThumbSmallUrl: null, imageThumbLargeUrl: null } as const;
