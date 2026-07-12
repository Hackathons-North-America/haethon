import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { hackathons } from "@/lib/db/schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_LOGO_BYTES = 4 * 1024 * 1024;

/* Same-origin proxy for hackathon logos. Most logo hosts (e.g. the Devpost
   CDN) don't send CORS headers, which taints the canvas the card uses to
   sample the logo's dominant color. Serving the bytes from our own origin
   keeps the canvas readable, and the long cache header means each logo is
   fetched upstream at most once per client per day. */
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
    const upstream = await fetch(hackathon.imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HaethonBot/1.0)" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    const contentType = upstream.headers.get("content-type") ?? "";
    const contentLength = Number(upstream.headers.get("content-length") ?? 0);

    if (!upstream.ok || !contentType.startsWith("image/") || contentLength > MAX_LOGO_BYTES) {
      throw new Error("Upstream logo unavailable.");
    }

    return new NextResponse(upstream.body, {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Content-Type": contentType,
      },
    });
  } catch {
    /* Let the <img> still render by handing the browser the original URL;
       color sampling falls back to the name-hash accent in that case. */
    return NextResponse.redirect(hackathon.imageUrl, 302);
  }
}
