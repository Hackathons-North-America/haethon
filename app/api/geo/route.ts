import { NextResponse } from "next/server";

/* Coarse, prompt-free user location from Vercel's free IP-geo headers.
   City-level accuracy — exactly enough for a "within N km" filter, and the
   two-letter country code doubles as the join key for the hackathon catalog's
   "push local hackathons to the top" boost. Locally (and on any non-Vercel
   host) the headers are absent and the client falls back to the browser
   geolocation API (which has no country of its own — the boost just no-ops). */
export async function GET(request: Request) {
  const latitude = Number(request.headers.get("x-vercel-ip-latitude"));
  const longitude = Number(request.headers.get("x-vercel-ip-longitude"));
  const rawCity = request.headers.get("x-vercel-ip-city");
  const countryCode = request.headers.get("x-vercel-ip-country");

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
    return NextResponse.json({ data: null });
  }

  return NextResponse.json(
    {
      data: {
        latitude,
        longitude,
        // Vercel URI-encodes header values ("S%C3%A3o%20Paulo").
        city: rawCity ? decodeURIComponent(rawCity) : null,
        countryCode: countryCode ? countryCode.toUpperCase() : null,
      },
    },
    /* The answer depends only on the caller's IP, so their browser can keep
       it: a returning visitor gets it from the HTTP cache instead of invoking
       this function again. `private` keeps it out of the shared CDN cache,
       where one visitor's city would be served to the next. A miss (no geo
       headers) is deliberately left uncached. */
    { headers: { "Cache-Control": "private, max-age=3600" } }
  );
}
