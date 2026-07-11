import { ThemedUserProfile } from "@/components/themed-user-profile";

export default function AccountSettingsPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12 text-navy dark:text-wheat sm:px-10 lg:px-16">
      <ThemedUserProfile />
    </main>
  );
}
