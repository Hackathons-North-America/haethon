"use client";

import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { useEffect } from "react";

// Captures a $pageview on every App Router navigation. Next.js does client-side
// route changes without a full reload, so PostHog's built-in pageview tracking
// is disabled and we fire it manually here. useSearchParams requires a Suspense
// boundary, which the provider supplies.
export function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || !posthog.__loaded) {
      return;
    }

    let url = window.origin + pathname;
    const search = searchParams.toString();

    if (search) {
      url += `?${search}`;
    }

    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}
