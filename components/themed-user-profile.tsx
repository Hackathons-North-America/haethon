"use client";

import { UserProfile } from "@clerk/nextjs";
import { Bell, LogOut } from "lucide-react";

import { AccountSignOutButton } from "@/components/account-sign-out-button";
import { EmailPreferencesToggle } from "@/components/email-preferences-toggle";

const lightVariables = {
  colorBackground: "#fbf7f0",
  colorInput: "#fbf7f0",
  colorForeground: "#1b1917",
  colorMutedForeground: "rgba(27, 25, 23, 0.55)",
  colorPrimary: "#362519",
  colorPrimaryForeground: "#fbf7f0",
  colorBorder: "rgba(27, 25, 23, 0.15)",
  borderRadius: "0px",
};

export function ThemedUserProfile({
  initialEmailNotificationsEnabled,
}: {
  initialEmailNotificationsEnabled: boolean;
}) {
  return (
    <UserProfile
      path="/account/settings"
      routing="path"
      appearance={{
        variables: lightVariables,
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
      <UserProfile.Page
        label="Notifications"
        labelIcon={<Bell aria-hidden="true" className="size-4" />}
        url="notifications"
      >
        <div>
          <h1 className="text-lg font-semibold text-ink">Notifications</h1>
          <p className="mt-1 text-sm text-ink/55">Manage the emails Haethon sends you.</p>
          <div className="mt-6">
            <EmailPreferencesToggle initialEnabled={initialEmailNotificationsEnabled} />
          </div>
        </div>
      </UserProfile.Page>
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
