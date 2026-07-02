import { UserProfile } from "@clerk/nextjs";

export default function AccountSettingsPage() {
  return (
    <main className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-[#EFEDEA] px-6 py-12 sm:px-10 lg:px-16">
      <UserProfile path="/account/settings" routing="path" />
    </main>
  );
}
