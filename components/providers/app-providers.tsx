"use client";

import { ClerkProvider } from "@clerk/nextjs";

import { PostHogProvider } from "@/components/providers/posthog-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <ThemeProvider>
        <PostHogProvider>
          <QueryProvider>{children}</QueryProvider>
        </PostHogProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}
