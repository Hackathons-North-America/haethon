"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

const easeOut = [0.22, 1, 0.36, 1] as const;

type RevealWordProps = {
  index: number;
  still: boolean;
  children: ReactNode;
  className?: string;
};

function RevealWord({ index, still, children, className }: RevealWordProps) {
  return (
    <motion.span
      className={`inline-block ${className ?? ""}`}
      initial={still ? false : { opacity: 0, y: "0.35em", filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay: 0.15 + index * 0.07, duration: 0.7, ease: easeOut }}
    >
      {children}
    </motion.span>
  );
}

export function HeroHeadline() {
  const prefersReducedMotion = useReducedMotion();
  const still = prefersReducedMotion ?? false;

  return (
    <div className="relative">
      {/* The split hero's voice, set in the same Geist sans the hackathon
          cards use for their titles. Metrics are lifted one-to-one from the
          Federato reference: solid 1.0 leading, -0.02em tracking, light
          weight. 6.2vw is the largest size where the copy still wraps to
          three lines in the 33vw column ("Find and / track every /
          hackathon"), so the whole copy block — headline, description and
          CTA — clears the fold. No text-balance — the reference lets the
          lines wrap naturally against the column edge. */}
      <h1 className="relative z-10 font-sans text-[clamp(3.5rem,6.2vw,6.75rem)] font-light leading-[1] tracking-[-0.02em] text-paper">
        <RevealWord index={0} still={still}>
          Find
        </RevealWord>{" "}
        <RevealWord index={1} still={still}>
          and
        </RevealWord>{" "}
        <RevealWord index={2} still={still}>
          track
        </RevealWord>{" "}
        <RevealWord index={3} still={still}>
          every
        </RevealWord>{" "}
        <RevealWord index={4} still={still}>
          hackathon
        </RevealWord>
      </h1>
    </div>
  );
}
