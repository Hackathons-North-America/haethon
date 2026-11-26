import { UTApi, UTFile } from "uploadthing/server";

import { env } from "@/lib/env";
import { uploadThingFileKey } from "@/lib/hackathons/cover-image";

/* Where cover thumbnails live: the app's UploadThing bucket, the same one the
   admin photo upload uses (app/api/uploadthing/core.ts). Kept in its own
   module so tests and benchmarks can swap it out without a network. */

let api: UTApi | null = null;

function utapi() {
  if (!env.UPLOADTHING_TOKEN) {
    throw new Error("UPLOADTHING_TOKEN is not set; cover thumbnails cannot be stored.");
  }

  api ??= new UTApi({ token: env.UPLOADTHING_TOKEN });

  return api;
}

export type CoverThumbnailFile = { name: string; bytes: Uint8Array };

/** Uploads every file or none: on a partial failure the ones that did upload
    are deleted again before the error is rethrown. Returns their URLs in
    order. */
export async function uploadCoverThumbnailFiles(files: CoverThumbnailFile[]) {
  const results = await utapi().uploadFiles(
    files.map((file) => new UTFile([new Uint8Array(file.bytes)], file.name, { type: "image/webp" }))
  );
  const failure = results.find((result) => result.error);

  if (failure) {
    const uploadedKeys = results.flatMap((result) => (result.data ? [result.data.key] : []));

    if (uploadedKeys.length) {
      await utapi()
        .deleteFiles(uploadedKeys)
        .catch(() => undefined);
    }

    throw new Error(`UploadThing upload failed: ${failure.error!.message}`);
  }

  return results.map((result) => result.data!.ufsUrl);
}

/** Deletes the given thumbnail URLs from UploadThing. URLs that are not
    UploadThing files (or are empty) are ignored. */
export async function deleteCoverThumbnailFiles(urls: Array<string | null | undefined>) {
  const keys = [...new Set(urls.flatMap((url) => uploadThingFileKey(url) ?? []))];

  if (!keys.length) {
    return;
  }

  const result = await utapi().deleteFiles(keys);

  if (!result.success) {
    throw new Error("UploadThing did not delete the old cover thumbnails.");
  }
}
