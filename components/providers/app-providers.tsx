"use client";

import { ClerkProvider } from "@clerk/nextjs";
import dynamic from "next/dynamic";

import { LoginRequiredDialog, LoginRequiredProvider } from "@/components/login-required-dialog";
import { Toaster } from "@/components/toaster";

const PostHogBootstrap = dynamic(
  () => import("@/components/providers/posthog-provider").then((module) => module.PostHogBootstrap),
  { ssr: false }
);

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <LoginRequiredProvider>
        <PostHogBootstrap />
        {children}
        <LoginRequiredDialog />
        <Toaster />
      </LoginRequiredProvider>
    </ClerkProvider>
  );
}
