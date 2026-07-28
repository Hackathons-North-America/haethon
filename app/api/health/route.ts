import { NextResponse } from "next/server";

/* This endpoint does not inspect runtime dependencies, so rendering it in a
   function on every uptime probe only adds cost without measuring more. */
export const dynamic = "force-static";
export const revalidate = 3600;

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "hackathons-north-america",
    },
    {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
