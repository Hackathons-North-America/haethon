"use client";

import { UserProfile } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

import { AccountSignOutButton } from "@/components/account-sign-out-button";
import { useTheme } from "@/components/providers/theme-provider";

/* Clerk's appearance variables only take flat color values, so this wrapper
   swaps the palette with the theme: brand paper tones in light, the night-sky
   surfaces from the landing hero in dark. */
const lightVariables = {
  colorBackground: "#fcf9f4",
  colorInput: "#ffffff",
  colorForeground: "#1d2a44",
  colorMutedForeground: "#818793",
  colorPrimary: "#721c24",
  colorPrimaryForeground: "#f4ebd9",
  borderRadius: "0.75rem",
};

const darkVariables = {
  colorBackground: "#1b1b1b",
  colorInput: "#262626",
  colorForeground: "#f4ebd9",
  colorMutedForeground: "#928d83",
  colorPrimary: "#f4ebd9",
  colorPrimaryForeground: "#141414",
  borderRadius: "0.75rem",
};

export function ThemedUserProfile() {
  const { theme } = useTheme();

  return (
    <UserProfile
      path="/account/settings"
      routing="path"
      appearance={{
        variables: theme === "dark" ? darkVariables : lightVariables,
        elements: {
          rootBox: "w-full max-w-5xl",
          cardBox: "w-full bg-white/70 dark:bg-white/10 shadow-none",
          card: "bg-white/70 dark:bg-white/10 shadow-none",
          navbar: "bg-white/70 dark:bg-white/10",
          navbarButton: "text-navy dark:text-wheat hover:bg-navy/10 dark:hover:bg-white/10",
          pageScrollBox: "bg-white/70 dark:bg-white/10",
          profileSection: "border-navy/10 dark:border-white/10",
          profileSectionContent: "bg-white/70 dark:bg-white/10",
          formFieldInput:
            "border-navy/15 dark:border-white/15 bg-white dark:bg-white/[0.06] text-navy dark:text-wheat",
          formButtonPrimary:
            "bg-cabernet text-wheat hover:bg-[#5c151c] dark:bg-wheat dark:text-[#141414] dark:hover:bg-white",
          accordionTriggerButton: "hover:bg-navy/10 dark:hover:bg-white/10",
        },
      }}
    >
      <UserProfile.Page label="Sign out" labelIcon={<LogOut aria-hidden="true" className="size-4" />} url="sign-out">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-lg font-semibold text-navy dark:text-wheat">Sign out</h1>
            <p className="mt-1 text-sm text-navy/55 dark:text-wheat/55">Sign out of your account on this device.</p>
          </div>
          <div>
            <AccountSignOutButton />
          </div>
        </div>
      </UserProfile.Page>
    </UserProfile>
  );
}
