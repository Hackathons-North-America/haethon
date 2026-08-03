import { SignUp } from "@clerk/nextjs";

const appearance = {
  variables: {
    colorBackground: "#fbf7f0",
    colorInput: "#fbf7f0",
    colorForeground: "#1b1917",
    colorMutedForeground: "rgba(27, 25, 23, 0.55)",
    colorPrimary: "#362519",
    colorPrimaryForeground: "#fbf7f0",
    colorBorder: "rgba(27, 25, 23, 0.15)",
    borderRadius: "0px",
  },
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
