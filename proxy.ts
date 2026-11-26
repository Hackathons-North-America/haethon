import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/about",
  "/corporate",
  "/discord",
  "/hackathons(.*)",
  // Shared hacker profiles. The unguessable token in the path is the
  // credential, so these render for signed-out visitors.
  "/p/(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health",
  "/api/hackathons(.*)",
  "/api/cities/search",
  "/api/geo",
  "/api/cron(.*)",
  // Discord calls this server-to-server, signed with the application's key.
  "/api/discord/interactions",
  // UploadThing calls this back server-to-server (signature-verified, no Clerk
  // session). Uploads themselves are still admin-gated in the file router.
  "/api/uploadthing(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (req.nextUrl.pathname === "/" && !req.nextUrl.searchParams.has("home")) {
    const { userId } = await auth();

    if (userId) {
      return NextResponse.redirect(new URL("/hackathons", req.url));
    }
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  /* On Vercel every request this matches is a billed function invocation that
     runs before the CDN cache is consulted, so anything that never reads the
     session is kept out of Clerk's proxy entirely:

     - /api/health: static, so uptime checks stay on the CDN fast path.
     - /about, /corporate: prerendered marketing pages. Their document, RSC and
       link-prefetch requests (about ten per visit) are served by the CDN alone.
     - /discord: a redirect, issued by next.config.ts without a function.
     - /p/[username]: shared profiles, cached per username (ISR).
     - /api/cities/search: CDN-cached for a day; the proxy would otherwise run
       on every autocomplete keystroke, cache hit or not.
     - /api/geo: only echoes Vercel's IP-geo request headers.
     - /api/hackathons/catalog and the files under it (/descriptions,
       /votes, /versions): the static catalog files /hackathons searches in the browser.
       Fetched on every catalog visit and re-checked while the tab is open,
       so the proxy would add an invocation to each request.
     - /api/cron/*: authenticated by CRON_SECRET, not by a session.
     - /api/discord/*: Discord's interaction webhooks, authenticated by their
       Ed25519 signature, not by a session.
     - /hackathons (exactly, not the pages under it): prerendered; per-viewer
       state loads in the browser, so Clerk would only add an invocation (and,
       for an expired token, a redirect round trip) to every visit and prefetch.

     None of these call auth(), which requires the proxy to have run. A route
     that starts reading the session must be removed from the exclusions here
     (and stay in isPublicRoute above if signed-out visitors may see it). */
  matcher: [
    "/((?!(?:about|corporate|discord)(?:/|$)|hackathons/?$|p/|api/(?:health|geo|cities/search|hackathons/catalog)(?:/|$)|api/(?:cron|discord)/|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|avif|png|gif|svg|mp4|webm|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api(?!/(?:health|geo|cities/search|hackathons/catalog)(?:/|$)|/(?:cron|discord)/)|trpc)(.*)",
  ],
};
