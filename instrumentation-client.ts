/* Sentry's browser SDK is the largest thing this app shipped on first load —
   it sat in the root chunks every page downloads, parses and runs before
   hydration. Nothing on screen depends on it, so it now loads in its own chunk
   once the browser is idle, and not at all when no DSN is configured.

   The two things a late start could cost are covered here: errors thrown
   before the SDK arrives are buffered and reported once it does, and router
   transitions are forwarded as soon as it is ready. Web vitals are observed
   with `buffered: true`, so the pageload measurements survive the delay. */

type SentrySdk = typeof import("@/lib/monitoring/sentry-browser");

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/* Longest the SDK waits for an idle moment before loading anyway. */
const SENTRY_IDLE_TIMEOUT_MS = 3000;
/* Cap on errors held while the SDK loads; a crash loop must not grow this. */
const MAX_EARLY_ERRORS = 20;

let sentry: SentrySdk | undefined;

if (dsn && typeof window !== "undefined") {
  const earlyErrors: unknown[] = [];

  const rememberError = (event: ErrorEvent) => {
    if (earlyErrors.length < MAX_EARLY_ERRORS) {
      earlyErrors.push(event.error ?? new Error(event.message));
    }
  };
  const rememberRejection = (event: PromiseRejectionEvent) => {
    if (earlyErrors.length < MAX_EARLY_ERRORS) {
      earlyErrors.push(event.reason);
    }
  };

  window.addEventListener("error", rememberError);
  window.addEventListener("unhandledrejection", rememberRejection);

  const loadSentry = async () => {
    try {
      // Importing the module initializes the SDK (see the note there on why
      // this is not a bare import of "@sentry/nextjs").
      const sdk = await import("@/lib/monitoring/sentry-browser");

      // From here the SDK's own global handlers take over.
      window.removeEventListener("error", rememberError);
      window.removeEventListener("unhandledrejection", rememberRejection);

      for (const error of earlyErrors.splice(0)) {
        sdk.captureException(error);
      }

      sentry = sdk;
    } catch {
      // Monitoring must never break the page; a failed chunk load is dropped.
    }
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => void loadSentry(), { timeout: SENTRY_IDLE_TIMEOUT_MS });
  } else {
    // Safari has no requestIdleCallback.
    window.setTimeout(() => void loadSentry(), 1500);
  }
}

export function onRouterTransitionStart(href: string, navigationType: string) {
  sentry?.captureRouterTransitionStart(href, navigationType);
}
