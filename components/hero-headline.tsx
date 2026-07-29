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
      {/* The split hero's editorial voice: an oversized cream display serif on
          the espresso panel, regular weight and near-solid leading, with
          "hackers" carrying the accent as an italic. */}
      <h1 className="relative z-10 text-balance font-display text-[clamp(3rem,5.6vw,5.6rem)] font-normal leading-[1.02] tracking-[-0.01em] text-paper">
        <RevealWord index={0} still={still}>
          Where
        </RevealWord>{" "}
        <RevealWord index={1} still={still} className="italic">
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
