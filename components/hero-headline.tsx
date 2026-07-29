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
      {/* Set in the hackathon card's title voice: bold sans, tight tracking,
          plain ink — with "hackers" carrying the accent the way a card's
          country word does. Sized for the split hero's half-width column. */}
      <h1 className="relative z-10 text-balance font-sans text-[clamp(2.4rem,4.8vw,4.1rem)] font-bold leading-[1.05] tracking-[-0.045em] text-ink">
        <RevealWord index={0} still={still}>
          Where
        </RevealWord>{" "}
        <RevealWord index={1} still={still} className="text-pine">
          hackers
        </RevealWord>{" "}
        <RevealWord index={2} still={still}>
          find
        </RevealWord>{" "}
        <RevealWord index={3} still={still}>
          their
        </RevealWord>{" "}
        <RevealWord index={4} still={still}>
          next
        </RevealWord>{" "}
        <RevealWord index={5} still={still}>
          weekend.
        </RevealWord>
      </h1>
    </div>
  );
}
