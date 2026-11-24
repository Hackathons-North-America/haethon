"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Loaded on demand: a static import would put the whole Sentry SDK in the
    // chunks every page downloads, just for the rare time this boundary shows.
    // Without a DSN there is nowhere to report to, so the SDK is never fetched.
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return;
    }

    void import("@/lib/monitoring/sentry-browser")
      .then((sentry) => sentry.captureException(error))
      .catch(() => undefined);
  }, [error]);

  // global-error replaces the root layout when it renders, so it must
  // provide its own <html> and <body> tags.
  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: "1rem",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h2>Something went wrong</h2>
          <button onClick={() => reset()}>Try again</button>
        </div>
      </body>
    </html>
  );
}
