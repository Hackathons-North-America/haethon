import { captureAnalyticsEvent } from "@/lib/analytics/client";

// Central definition of the custom events we send to PostHog. Keeping the names
// and property shapes here (rather than sprinkling string literals across
// components) makes them easy to audit and keeps naming consistent. Event names
// follow PostHog's snake_case convention.
type AnalyticsEvents = {
  organizer_hackathon_updated: {
    hackathon_id: string;
    hackathon_name: string;
    format: string;
    status: string;
  };
  organizer_checkin_code_generated: {
    hackathon_id: string;
  };
  organizer_attendees_verified: {
    hackathon_id: string;
    verified_count: number;
  };
};

export function trackEvent<Name extends keyof AnalyticsEvents>(
  name: Name,
  properties: AnalyticsEvents[Name]
) {
  // Goes through the SDK-free handle so tracking an event never pulls
  // posthog-js into the bundle of the component that tracks it.
  captureAnalyticsEvent(name, properties);
}
