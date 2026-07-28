import { createHash, createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { env } from "@/lib/env";

const VOTER_COOKIE = "faceoff_voter_id";
const VOTER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function anonymousFingerprint(anonymousId: string): string {
  const digest = createHash("sha256").update(anonymousId).digest("base64url");
  return `a:${digest}`;
}

function requestAddress(request: Request) {
  if (!process.env.VERCEL) {
    return null;
  }

  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for");
  const address = forwarded?.split(",", 1)[0]?.trim() ?? "";

  return isIP(address) ? address : null;
}

function networkFingerprint(address: string) {
  const digest = createHmac("sha256", env.CRON_SECRET)
    .update(`faceoff-network:${address}`)
    .digest("base64url");

  return `a:${digest}`;
}

export async function resolveFaceoffVoter(userId: string | null, request: Request): Promise<{
  fingerprint: string;
  anonymousIdToSet?: string;
}> {
  if (userId) {
    return { fingerprint: `u:${userId}` };
  }

  /* Vercel overwrites this header with the client address, so production
     anonymous limits survive cookie deletion. The keyed digest avoids storing
     the address itself in Postgres. Local development falls back to a cookie. */
  const address = requestAddress(request);

  if (address) {
    return { fingerprint: networkFingerprint(address) };
  }

  const cookieStore = await cookies();
  const existing = cookieStore.get(VOTER_COOKIE)?.value;

  if (existing) {
    return { fingerprint: anonymousFingerprint(existing) };
  }

  const anonymousIdToSet = randomUUID();

  return {
    anonymousIdToSet,
    fingerprint: anonymousFingerprint(anonymousIdToSet),
  };
}

export function setFaceoffVoterCookie(response: NextResponse, anonymousId: string | undefined) {
  if (!anonymousId) {
    return;
  }

  response.cookies.set(VOTER_COOKIE, anonymousId, {
    httpOnly: true,
    maxAge: VOTER_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
