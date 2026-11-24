import { SignIn } from "@clerk/nextjs";

import { clerkThemeVariables } from "@/lib/clerk-appearance";

const appearance = {
  variables: clerkThemeVariables,
  elements: {
    cardBox: "border border-ink/15 shadow-none",
    card: "shadow-none",
  },
};

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-10 py-16 md:px-16">
      <SignIn
        appearance={appearance}
        fallbackRedirectUrl="/hackathons"
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
      />
    </main>
  );
}
