import { SignUp } from "@clerk/nextjs";

import { clerkThemeVariables } from "@/lib/clerk-appearance";

const appearance = {
  variables: clerkThemeVariables,
  elements: {
    cardBox: "border border-ink/15 shadow-none",
    card: "shadow-none",
  },
};

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-10 py-16 md:px-16">
      <SignUp
        appearance={appearance}
        fallbackRedirectUrl="/hackathons"
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
      />
    </main>
  );
}
