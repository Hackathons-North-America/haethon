import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

import { discordGuildUrl } from "./lib/discord/guild-url";

/* Baked in at build time (Vercel exposes project env vars to the build), so
   /discord is answered by the routing layer instead of invoking a function.
   Without the variable the app/discord route handler still answers. */
const discordGuildId = process.env.DISCORD_GUILD_ID?.trim();

/* Files in public/ are not content-hashed, so they cannot be immutable, but
   Vercel's default (max-age=0, must-revalidate) makes every page view
   re-request the logo. A day in the browser, served stale for a week while it
   revalidates, removes that request for returning visitors and still lets a
   replaced asset roll out within a day. */
const publicAssetCacheControl = "public, max-age=86400, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  /* Tags every client bundle with the deploy it came from so the router
     detects version skew after a new deploy and falls back to a full-page
     navigation, upgrading stale tabs. Undefined outside Vercel (no-op). */
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  images: {
    /* Local marketing assets are content-hashed at build time. Keep optimized
       variants warm for a month so traffic does not repeatedly pay to resize
       the same files; remote catalog logos remain explicitly unoptimized. */
    minimumCacheTTL: 60 * 60 * 24 * 31,
  },
  async redirects() {
    return [
      ...(discordGuildId
        ? [{ source: "/discord", destination: discordGuildUrl(discordGuildId), permanent: false }]
        : []),
      { source: "/saved", destination: "/my", permanent: false },
      { source: "/reminders", destination: "/my", permanent: false },
      { source: "/friends", destination: "/hackathons", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "Origin-Agent-Cluster", value: "?1" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests",
          },
        ],
      },
      { source: "/logo-beaver.svg", headers: [{ key: "Cache-Control", value: publicAssetCacheControl }] },
      { source: "/photos/:path*", headers: [{ key: "Cache-Control", value: publicAssetCacheControl }] },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
  silent: true,
});
