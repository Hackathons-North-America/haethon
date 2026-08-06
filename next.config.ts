import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
      { source: "/saved", destination: "/my", permanent: false },
      /* /faceoff/icon is its own page; the bare parent belongs to the
         hackathon arena, which shipped under the hyphenated path. */
      { source: "/faceoff", destination: "/face-off", permanent: false },
      { source: "/reminders", destination: "/my", permanent: false },
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
