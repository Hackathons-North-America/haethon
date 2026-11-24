import { redirect } from "next/navigation";

import { ThemedUserProfile } from "@/components/themed-user-profile";
import { getCurrentUserId } from "@/lib/auth";

export default async function AccountSettingsPage() {
  // Only a signed-in check: Clerk's own UI loads the profile client-side, so
  // the session claim is enough and the users row is never read here.
  const userId = await getCurrentUserId();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
      <ThemedUserProfile />
    </main>
  );
}
