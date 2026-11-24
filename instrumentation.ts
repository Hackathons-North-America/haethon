import type { Instrumentation } from "next";

/* Without a DSN the SDK has nothing to report to, so it is neither initialized
   nor asked to handle request errors: no OpenTelemetry setup and no tracing
   hooks on environments that do not use Sentry (local, previews without the
   variable). With a DSN nothing changes. */
const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

export async function register() {
  if (!sentryEnabled) {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!sentryEnabled) {
    return;
  }

  const { captureRequestError } = await import("@sentry/nextjs");

  captureRequestError(error, request, context);
};
