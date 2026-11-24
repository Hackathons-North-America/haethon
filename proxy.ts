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
  /* The health response is static and does not inspect auth, so keep it out of
     Clerk's proxy entirely; uptime checks can then stay on the CDN fast path.

     The catalog page (exactly /hackathons, not the pages under it) is left
     out for the same reason. It is prerendered, reads nothing from the
     session on the server, and gets its per-viewer state from the browser, so
     running Clerk in front of it would only add a proxy invocation to every
     visit and prefetch and, for a returning visitor whose session token has
     expired, a redirect round trip through Clerk before any HTML is sent.
     If that page ever calls auth() on the server again, remove it from here:
     auth() throws when the proxy has not run. */
  matcher: [
    "/((?!api/health(?:/|$)|hackathons/?$|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|avif|png|gif|svg|mp4|webm|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api(?!/health(?:/|$))|trpc)(.*)",
  ],
};
