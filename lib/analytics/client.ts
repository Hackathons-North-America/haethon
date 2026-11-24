/* A dependency-free handle on the analytics SDK.

   posthog-js is ~73 KB gzipped. Importing it wherever an event is tracked put
   that whole SDK into the first-load bundle of those pages (the organizer
   console shipped it twice over: once here, once in the lazy provider chunk).
   Components import this file instead; the lazily loaded provider registers
   the real client when it initializes, and events tracked before that are held
   and delivered on registration. */

type AnalyticsProperties = Record<string, unknown>;

export type AnalyticsClient = {
  capture: (event: string, properties?: AnalyticsProperties) => unknown;
};

/* Cap on events held while the SDK loads. */
const MAX_PENDING_EVENTS = 50;

let client: AnalyticsClient | null = null;
let pending: { event: string; properties?: AnalyticsProperties }[] = [];

export function registerAnalyticsClient(next: AnalyticsClient) {
  client = next;

  const queued = pending;
  pending = [];

  for (const { event, properties } of queued) {
    next.capture(event, properties);
  }
}

/** Sends the event now, or holds it until the SDK has loaded. */
export function captureAnalyticsEvent(event: string, properties?: AnalyticsProperties) {
  if (client) {
    client.capture(event, properties);
    return;
  }

  if (pending.length < MAX_PENDING_EVENTS) {
    pending.push({ event, properties });
  }
}

/** Test seam: forget the registered client and anything queued. */
export function resetAnalyticsClientForTests() {
  client = null;
  pending = [];
}
