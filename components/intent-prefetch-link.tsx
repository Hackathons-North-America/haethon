"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A Link that prefetches only once the visitor shows interest in it (hover,
 * focus, or touch) instead of as soon as it scrolls into view.
 *
 * For the hackathon cards' detail links. Their destination renders on the
 * server per request, so a viewport prefetch cannot fetch the page itself;
 * it only costs requests — two per card, every time a card scrolls into view,
 * each one a server invocation. Waiting for intent keeps the head start for
 * the link that is about to be clicked and drops the rest.
 */
export function IntentPrefetchLink({
  onFocus,
  onPointerEnter,
  onTouchStart,
  ...props
}: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [hasIntent, setHasIntent] = useState(false);

  return (
    <Link
      {...props}
      onFocus={(event) => {
        setHasIntent(true);
        onFocus?.(event);
      }}
      onPointerEnter={(event) => {
        setHasIntent(true);
        onPointerEnter?.(event);
      }}
      onTouchStart={(event) => {
        setHasIntent(true);
        onTouchStart?.(event);
      }}
      // null restores Next's default prefetching once there is intent.
      prefetch={hasIntent ? null : false}
    />
  );
}
