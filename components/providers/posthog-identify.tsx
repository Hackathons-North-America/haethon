"use client";

import { useUser } from "@clerk/nextjs";
import posthog from "posthog-js";
import { useEffect, useRef } from "react";

// Links PostHog events to the signed-in Clerk user. With person_profiles set to
// "identified_only", this is what turns anonymous traffic into a named person.
// We only reset on an actual sign-out transition, so anonymous visitors keep a
// stable distinct_id across page views.
export function PostHogIdentify() {
  const { isLoaded, isSignedIn, user } = useUser();
  const hasIdentified = useRef(false);

  useEffect(() => {
    if (!isLoaded || !posthog.__loaded) {
      return;
    }

    if (isSignedIn && user) {
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName ?? undefined,
      });
      hasIdentified.current = true;
    } else if (hasIdentified.current) {
      posthog.reset();
      hasIdentified.current = false;
    }
  }, [isLoaded, isSignedIn, user]);

  return null;
}
