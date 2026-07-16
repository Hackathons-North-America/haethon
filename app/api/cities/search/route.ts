import { NextResponse } from "next/server";

import { searchCities } from "@/lib/hackathons/city-lookup";

/* City autocomplete backed by the local GeoNames table — no external
   geocoding service, so there is no per-request cost to protect against. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";

  if (query.trim().length < 2 || query.length > 120) {
    return NextResponse.json({ data: [] });
  }

  const data = await searchCities(query);

  return NextResponse.json(
    { data },
    // The cities dataset changes once a year at most; let Vercel's CDN absorb
    // repeat keystrokes across users.
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
  );
}
