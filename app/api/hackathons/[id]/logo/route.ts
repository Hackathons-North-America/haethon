import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { hackathons } from "@/lib/db/schema";
import { fetchSafeRemoteImage } from "@/lib/security/remote-image";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_LOGO_BYTES = 4 * 1024 * 1024;
export const runtime = "nodejs";

/* Same-origin fallback proxy for hackathon logos. Logos on allowlisted hosts
   (lib/hackathons/logo-hosts.ts) skip this route entirely and are served to
   the image optimizer directly; only legacy rows on unknown hosts still load
   through here, with the SSRF-guarded fetch happening per cache miss. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const [hackathon] = await db
    .select({ imageUrl: hackathons.imageUrl })
    .from(hackathons)
    .where(eq(hackathons.id, id))
    .limit(1);

  if (!hackathon?.imageUrl) {
    return NextResponse.json({ error: "Logo not found." }, { status: 404 });
  }

  try {
    const image = await fetchSafeRemoteImage(hackathon.imageUrl, MAX_LOGO_BYTES);

    return new NextResponse(image.bytes, {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        "Content-Length": String(image.bytes.byteLength),
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Type": image.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Logo unavailable." }, { status: 502 });
  }
}
