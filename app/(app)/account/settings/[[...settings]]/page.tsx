import { redirect } from "next/navigation";

import { ThemedUserProfile } from "@/components/themed-user-profile";
import { getCurrentUserRecord } from "@/lib/auth";

export default async function AccountSettingsPage() {
  const user = await getCurrentUserRecord();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
      <ThemedUserProfile initialEmailNotificationsEnabled={!user.emailUnsubscribedAt} />
    </main>
  );
}
