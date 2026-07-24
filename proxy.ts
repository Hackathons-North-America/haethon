import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/about",
  "/discord",
  "/unsubscribed",
  "/hackathons(.*)",
  "/face-off(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health",
  "/api/hackathons(.*)",
  "/api/faceoff(.*)",
  "/api/cities/search",
  "/api/geo",
  "/api/cron(.*)",
  "/api/email/unsubscribe(.*)",
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
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|avif|png|gif|svg|mp4|webm|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
