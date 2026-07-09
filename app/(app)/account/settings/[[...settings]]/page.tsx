import { UserProfile } from "@clerk/nextjs";

export default function AccountSettingsPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EFEDEA] px-6 py-12 text-black sm:px-10 lg:px-16">
      <UserProfile
        path="/account/settings"
        routing="path"
        appearance={{
          variables: {
            colorBackground: "#E6E2DD",
            colorInput: "#DCD6CF",
            colorForeground: "#000000",
            colorMutedForeground: "#706F6B",
            colorPrimary: "#660000",
            colorPrimaryForeground: "#EFEDEA",
            borderRadius: "0.5rem",
          },
          elements: {
            rootBox: "w-full max-w-5xl",
            cardBox: "w-full bg-[#E6E2DD] shadow-none",
            card: "bg-[#E6E2DD] shadow-none",
            navbar: "bg-[#E6E2DD]",
            navbarButton: "text-black hover:bg-[#DCD6CF]",
            pageScrollBox: "bg-[#E6E2DD]",
            profileSection: "border-black/10",
            profileSectionContent: "bg-[#E6E2DD]",
            formFieldInput: "border-black/15 bg-[#DCD6CF] text-black",
            formButtonPrimary: "bg-[#660000] text-[#EFEDEA] hover:bg-[#4d0000]",
            accordionTriggerButton: "hover:bg-[#DCD6CF]",
          },
        }}
      />
    </main>
  );
}
