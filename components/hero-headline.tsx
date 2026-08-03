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
          weight. The size is dialled back from the reference's 6.9vw to 5vw so
          the whole copy block — headline, description and CTA — clears the
          fold. 5vw is the largest size that still wraps to four lines
          ("Every / hackathon, / from discovery / to demo day"); a hair larger
          and "from discovery" stops fitting the column and the block jumps to
          five. No text-balance — the reference lets the lines wrap naturally
          against the column edge. */}
      <h1 className="relative z-10 font-sans text-[clamp(3rem,5vw,5.5rem)] font-light leading-[1] tracking-[-0.02em] text-paper">
        <RevealWord index={0} still={still}>
          Every
        </RevealWord>{" "}
        <RevealWord index={1} still={still}>
          hackathon,
        </RevealWord>{" "}
        <RevealWord index={2} still={still}>
          from
        </RevealWord>{" "}
        <RevealWord index={3} still={still}>
          discovery
        </RevealWord>{" "}
        <RevealWord index={4} still={still}>
          to
        </RevealWord>{" "}
        <RevealWord index={5} still={still}>
          demo
        </RevealWord>{" "}
        <RevealWord index={6} still={still}>
          day
        </RevealWord>
      </h1>
    </div>
  );
}
