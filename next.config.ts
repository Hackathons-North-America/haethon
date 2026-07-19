import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

import { DIRECT_IMAGE_HOSTS, DIRECT_IMAGE_HOST_SUFFIXES } from "./lib/hackathons/logo-hosts";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    /* Logo URLs are effectively immutable (content-addressed CDN paths), so
       optimized variants can outlive short upstream cache headers. */
    minimumCacheTTL: 2678400,
    remotePatterns: [
      ...DIRECT_IMAGE_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
      ...DIRECT_IMAGE_HOST_SUFFIXES.map((suffix) => ({ protocol: "https" as const, hostname: `*${suffix}` })),
    ],
  },
  async redirects() {
    return [
      { source: "/saved", destination: "/my", permanent: false },
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
