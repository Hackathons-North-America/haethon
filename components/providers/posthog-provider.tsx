"use client";

import posthog from "posthog-js";

import { PostHogIdentify } from "@/components/providers/posthog-identify";
import { PostHogPageView } from "@/components/providers/posthog-pageview";
import { registerAnalyticsClient } from "@/lib/analytics/client";
import { posthogConfig } from "@/lib/analytics/posthog";

// Initialize PostHog at module load (client only), not inside an effect. Because
// this runs before any child component effect, the first pageview and user
// identification are captured. No key means analytics stays disabled. posthog-js
// is imported only in this client graph — importing it in instrumentation-client
// too breaks Turbopack's module factory.
if (typeof window !== "undefined" && !posthog.__loaded) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  if (key) {
    posthog.init(key, {
      api_host: posthogConfig.apiHost,
      ui_host: posthogConfig.uiHost,
      // Only create person profiles for identified (signed-in) users; anonymous
      // traffic is still counted but doesn't consume person-profile quota.
      person_profiles: "identified_only",
      // Pageviews are captured manually in PostHogPageView to handle App Router
      // client-side navigations correctly.
      capture_pageview: false,
      capture_pageleave: true,
      // Autocapture is off to control event volume at scale — we instrument
      // explicit events instead.
      autocapture: false,
    });

    // Hands the live client to lib/analytics/client and flushes any events
    // components tracked while this chunk was still loading.
    registerAnalyticsClient(posthog);
  }
}

export function PostHogBootstrap() {
  return (
    <>
      <PostHogPageView />
      <PostHogIdentify />
    </>
  );
}
