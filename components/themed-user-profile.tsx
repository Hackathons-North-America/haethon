"use client";

import { UserProfile } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

import { AccountSignOutButton } from "@/components/account-sign-out-button";
import { clerkThemeVariables } from "@/lib/clerk-appearance";

export function ThemedUserProfile() {
  return (
    <UserProfile
      path="/account/settings"
      routing="path"
      appearance={{
        variables: clerkThemeVariables,
        elements: {
          rootBox: "w-full max-w-5xl",
          cardBox: "w-full bg-paper shadow-none",
          card: "bg-paper shadow-none",
          navbar: "bg-paper",
          navbarButton: "text-ink hover:bg-ink/10",
          pageScrollBox: "bg-paper",
          profileSection: "border-ink/10",
          profileSectionContent: "bg-paper",
          formFieldInput: "border-ink/20 bg-paper text-ink focus:border-pine",
          formButtonPrimary:
            "rounded-full bg-transparent text-ink shadow-none transition-colors hover:bg-pine hover:text-paper",
          accordionTriggerButton: "hover:bg-ink/10",
        },
      }}
    >
      <UserProfile.Page label="Sign out" labelIcon={<LogOut aria-hidden="true" className="size-4" />} url="sign-out">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-lg font-semibold text-ink">Sign out</h1>
            <p className="mt-1 text-sm text-ink/55">Sign out of your account on this device.</p>
          </div>
          <div>
            <AccountSignOutButton />
          </div>
        </div>
      </UserProfile.Page>
    </UserProfile>
  );
}
