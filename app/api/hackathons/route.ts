import { NextResponse } from "next/server";

import { getCurrentUserRecord } from "@/lib/auth";
import { applyUserCardState, getPublicHackathonCatalog } from "@/lib/hackathons/catalog";
import { hackathonSearchSchema } from "@/lib/validations/hackathon";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const parsed = hackathonSearchSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    country: searchParams.get("country") ?? undefined,
    countries: searchParams.getAll("countries"),
    format: searchParams.get("format") ?? undefined,
    beginnerFriendly: searchParams.get("beginnerFriendly") ?? undefined,
    travelReimbursement: searchParams.get("travelReimbursement") ?? undefined,
    highSchoolersOnly: searchParams.get("highSchoolersOnly") ?? undefined,
    startsAfter: searchParams.get("startsAfter") ?? undefined,
    startsBefore: searchParams.get("startsBefore") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    q,
    countries,
    format,
    beginnerFriendly,
    travelReimbursement,
    highSchoolersOnly,
    startsAfter,
    startsBefore,
    limit,
    offset,
  } = parsed.data;

  // The heavy catalog query is served from the shared cross-request cache;
  // only the tiny saved/vote overlay depends on who is asking.
  const [{ cards, hasMore }, user] = await Promise.all([
    getPublicHackathonCatalog({
      name: q ?? "",
      countries,
      format: format ?? null,
      beginnerFriendly: beginnerFriendly ?? null,
      travelReimbursement: travelReimbursement ?? null,
      highSchoolersOnly: highSchoolersOnly ?? null,
      startsAfter: startsAfter ?? null,
      startsBefore: startsBefore ?? null,
      limit,
      offset,
    }),
    getCurrentUserRecord(),
  ]);

  const data = await applyUserCardState(cards, user?.id);

  return NextResponse.json({ data, hasMore });
}
