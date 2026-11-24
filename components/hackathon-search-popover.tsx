"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Variants } from "motion/react";

/* The search bar's dropdown panels and the pill behind the open field. They
   are the only part of the catalog page that needs the animation library, and
   nothing renders until a field is opened, so hackathon-search.tsx loads this
   module lazily: the library stays out of the JavaScript the page needs to
   show its first cards. */

/* Airbnb-style field switching. Every field's dropdown (and the pill that
   highlights the open field in the bar) shares one layoutId, so moving from
   one field to another reads as a single panel: the old contents vanish, the
   panel glides and resizes to the new field, then the new contents fade in.
   Opening from nothing or closing is a quick fade instead.

   `switched` is true when the open field changed from one field straight to
   another; it picks the morph over the fade. layoutCrossfade={false} hides
   the outgoing panel the instant the new one takes over, and
   layoutDependency limits layout animation to that hand-off, so content
   changing inside an open panel (filtering countries, toggling a feature)
   never animates its size. */
const morphEase = [0.22, 1, 0.36, 1] as const;
const morphTransition = { duration: 0.3, ease: morphEase };

const searchPanelVariants: Variants = {
  hidden: { opacity: 0, y: -6 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.16, ease: morphEase } },
  exit: (switched: boolean) =>
    switched ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4, transition: { duration: 0.12, ease: "easeIn" } },
};

const segmentPillVariants: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.16 } },
  exit: (switched: boolean) => ({ opacity: 0, transition: { duration: switched ? 0 : 0.12 } }),
};

export function SearchPopover({
  children,
  className,
  id,
  show,
  switched,
}: {
  children: ReactNode;
  className: string;
  id: string;
  show: boolean;
  switched: boolean;
}) {
  return (
    <AnimatePresence custom={switched} initial={false}>
      {show ? (
        <motion.div
          animate="shown"
          className={className}
          custom={switched}
          exit="exit"
          id={id}
          initial={switched ? false : "hidden"}
          layoutCrossfade={false}
          layoutDependency={id}
          layoutId="hackathon-search-popover"
          // Set here rather than as classes so motion can undo the stretch
          // its scale-based resize would otherwise put on the corners.
          style={{ borderRadius: 28, boxShadow: "0 22px 55px rgba(0,0,0,0.2)" }}
          transition={{ layout: morphTransition }}
          variants={searchPanelVariants}
        >
          {/* Hidden while the panel is still moving, since its contents
              would be squashed by the resize. */}
          <motion.div
            animate={{ opacity: 1 }}
            initial={switched ? { opacity: 0 } : false}
            transition={{ delay: 0.18, duration: 0.16 }}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function SegmentPill({ show, switched }: { show: boolean; switched: boolean }) {
  const dependency = useId();

  return (
    <AnimatePresence custom={switched} initial={false}>
      {show ? (
        <motion.span
          animate="shown"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-paper"
          custom={switched}
          exit="exit"
          initial={switched ? false : "hidden"}
          layoutCrossfade={false}
          layoutDependency={dependency}
          layoutId="hackathon-search-segment-pill"
          style={{ borderRadius: 9999, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)" }}
          transition={{ layout: morphTransition }}
          variants={segmentPillVariants}
        />
      ) : null}
    </AnimatePresence>
  );
}
