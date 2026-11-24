/* The browser's Sentry SDK, initialized on import.

   Never import this statically from client code: it is the chunk that
   instrumentation-client.ts and app/global-error.tsx load on demand, keeping
   the SDK out of the JavaScript every page needs before it can hydrate.

   The named imports matter. A dynamic `import("@sentry/nextjs")` asks for the
   whole namespace, which defeats tree-shaking and ships the entire SDK
   (Replay, Feedback and all, ~155 KB gzipped). Importing this module instead
   lets the bundler keep only what is used below (~50 KB). */
import { captureException, captureRouterTransitionStart, init } from "@sentry/nextjs";

init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
});

export { captureException, captureRouterTransitionStart };
