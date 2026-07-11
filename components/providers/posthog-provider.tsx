"use client";

import posthog from "posthog-js";
import { PostHogProvider as Provider } from "posthog-js/react";
import { Suspense } from "react";

import { PostHogIdentify } from "@/components/providers/posthog-identify";
import { PostHogPageView } from "@/components/providers/posthog-pageview";
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
      // Autocapture (clicks, form interactions) stays on for broad usage data.
      autocapture: true,
    });
  }
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogIdentify />
      {children}
    </Provider>
  );
}
