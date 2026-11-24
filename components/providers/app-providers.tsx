"use client";

import { ClerkProvider } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { LoginRequiredDialog, LoginRequiredProvider } from "@/components/login-required-dialog";
import { Toaster } from "@/components/toaster";

const PostHogBootstrap = dynamic(
  () => import("@/components/providers/posthog-provider").then((module) => module.PostHogBootstrap),
  { ssr: false }
);

/* Inlined at build time. Without a key the analytics chunk (~73 KB gzipped)
   is never requested at all. */
const analyticsEnabled = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);

/* Longest analytics waits for the browser to go idle before loading anyway. */
const ANALYTICS_IDLE_TIMEOUT_MS = 2000;

/* Mounts analytics once the page has hydrated and the browser has a spare
   moment, so downloading and evaluating the SDK no longer competes with
   hydration for the main thread. The first pageview is captured when it
   mounts, at most ANALYTICS_IDLE_TIMEOUT_MS after hydration. */
function DeferredAnalytics() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(() => setReady(true), { timeout: ANALYTICS_IDLE_TIMEOUT_MS });

      return () => window.cancelIdleCallback(handle);
    }

    // Safari has no requestIdleCallback.
    const handle = window.setTimeout(() => setReady(true), 1);

    return () => window.clearTimeout(handle);
  }, []);

  return ready ? <PostHogBootstrap /> : null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <LoginRequiredProvider>
        {analyticsEnabled ? <DeferredAnalytics /> : null}
        {children}
        <LoginRequiredDialog />
        <Toaster />
      </LoginRequiredProvider>
    </ClerkProvider>
  );
}
