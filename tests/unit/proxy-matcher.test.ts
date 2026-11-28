import * as pageStaticInfo from "next/dist/build/analysis/get-page-static-info";
import { describe, expect, it, vi } from "vitest";

// The matcher is all this suite reads; Clerk's middleware factory is never run.
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
  createRouteMatcher: () => () => true,
}));

import { config } from "@/proxy";

/* Next's own matcher compiler: exported at runtime, absent from its types. */
const { getMiddlewareMatchers } = pageStaticInfo as unknown as {
  getMiddlewareMatchers: (
    matcher: typeof config.matcher,
    nextConfig: { basePath: string }
  ) => { regexp: string; has?: { type: string; key: string }[] }[];
};

/* Compiled exactly the way `next build` compiles them, so this asserts on the
   routing table Vercel receives rather than on a hand-rolled approximation. */
const matchers = getMiddlewareMatchers(config.matcher, { basePath: "" }).map((matcher) => ({
  regexp: new RegExp(matcher.regexp),
  has: matcher.has ?? [],
}));

/* `headers` are lower-case names present on the request. */
function runsProxy(pathname: string, headers: string[] = []) {
  return matchers.some(
    ({ regexp, has }) =>
      regexp.test(pathname) && has.every((condition) => condition.type === "header" && headers.includes(condition.key))
  );
}

describe("proxy matcher", () => {
  it.each([
    "/",
    "/my",
    "/account",
    "/account/settings",
    "/submit",
    "/admin",
    "/admin/import",
    "/organizer",
    "/sign-in",
    "/sign-up/verify",
    "/api/hackathons",
    "/api/hackathons/123/track",
    "/api/hackathons/123/vote",
    "/api/user-hackathons/123",
    "/api/account/profile",
    "/api/admin/hackathons",
    "/api/organizer/hackathons/123",
    "/api/uploadthing",
    "/api/hackathon-submissions",
  ])("runs Clerk on %s (it reads the session)", (pathname) => {
    expect(runsProxy(pathname)).toBe(true);
  });

  it.each([
    "/hackathons",
    "/hackathons/",
    "/hackathons/some-hackathon",
    "/hackathons/some-hackathon/",
    "/about",
    "/corporate",
    "/discord",
    "/p/some-hacker",
    "/api/health",
    "/api/geo",
    "/api/cities/search",
    "/api/hackathons/catalog",
    "/api/hackathons/catalog/descriptions",
    "/api/hackathons/catalog/votes",
    "/api/hackathons/catalog/versions",
    "/api/cron/sync-discord",
    "/api/cron/cleanup-hackathons",
    "/api/discord/interactions",
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/logo-beaver.svg",
    "/photos/hack-canada-team.webp",
    "/favicon.ico",
  ])("skips Clerk on %s (it never reads the session)", (pathname) => {
    expect(runsProxy(pathname)).toBe(false);
  });

  /* Client-side navigation to a hackathon inside the app is intercepted by
     the side panel, which reads the session; only document requests for the
     static full page skip the proxy. */
  it.each(["/hackathons/some-hackathon", "/hackathons/some-hackathon/"])(
    "runs Clerk on the RSC request for %s",
    (pathname) => {
      expect(runsProxy(pathname, ["rsc"])).toBe(true);
    }
  );

  /* The exclusions are anchored, so a protected route that merely shares a
     prefix with an excluded one still goes through auth. */
  it.each([
    "/about-us",
    "/aboutness/secret",
    "/corporate-dashboard",
    "/discordant",
    "/profile",
    "/p",
    "/api/geofence",
    "/api/healthcheck",
    "/api/cities",
    "/api/cities/search-admin",
    "/api/cronjobs",
    "/api/cron",
    "/api/discordant",
    "/api/discord",
    "/hackathons-archive",
    "/hackathons/some-hackathon/edit",
    "/api/hackathons/catalogs",
    "/api/hackathons/catalog-admin",
  ])("still runs Clerk on the look-alike %s", (pathname) => {
    expect(runsProxy(pathname)).toBe(true);
  });
});
