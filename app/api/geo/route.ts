import { NextResponse } from "next/server";

/* Coarse, prompt-free user location from Vercel's free IP-geo headers.
   City-level accuracy — exactly enough for a "within N km" filter. Locally
   (and on any non-Vercel host) the headers are absent and the client falls
   back to the browser geolocation API. */
export async function GET(request: Request) {
  const latitude = Number(request.headers.get("x-vercel-ip-latitude"));
  const longitude = Number(request.headers.get("x-vercel-ip-longitude"));
  const rawCity = request.headers.get("x-vercel-ip-city");

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
    return NextResponse.json({ data: null });
  }

  return NextResponse.json({
    data: {
      latitude,
      longitude,
      // Vercel URI-encodes header values ("S%C3%A3o%20Paulo").
      city: rawCity ? decodeURIComponent(rawCity) : null,
    },
  });
}
