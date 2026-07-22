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
    <>
      <h1 className="relative text-balance font-serif text-[clamp(2.75rem,8vw,5.5rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-navy dark:text-wheat">
        <RevealWord index={0} still={still}>
          Where
        </RevealWord>{" "}
        <RevealWord
          index={1}
          still={still}
          className="animate-aurora-shimmer bg-[linear-gradient(100deg,#5da78e_0%,#7cc7ab_20%,#abdcc0_38%,#e4f6ec_50%,#abdcc0_62%,#7cc7ab_80%,#5da78e_100%)] bg-[length:220%_100%] bg-clip-text text-transparent [filter:drop-shadow(0_0_22px_rgb(134_227_190_/_0.25))] motion-reduce:animate-none"
        >
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
        <RevealWord index={5} still={still} className="relative italic">
          weekend.
          {/* Hand-drawn underline that sketches itself in once the words land. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 220 26"
            fill="none"
            className="absolute -bottom-[0.16em] left-0 h-[0.3em] w-full overflow-visible"
            preserveAspectRatio="none"
          >
            <motion.path
              d="M6 18 C 54 23, 150 6, 214 13"
              stroke="url(#hero-underline-gradient)"
              strokeWidth={7}
              strokeLinecap="round"
              initial={still ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 1.05, duration: 0.9, ease: easeOut }}
            />
            <defs>
              <linearGradient
                id="hero-underline-gradient"
                x1="6"
                y1="0"
                x2="214"
                y2="0"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#5da78e" stopOpacity="0.75" />
                <stop offset="0.55" stopColor="#8ee3be" stopOpacity="0.9" />
                <stop offset="1" stopColor="#abdcc0" stopOpacity="0.7" />
              </linearGradient>
            </defs>
          </svg>
        </RevealWord>
      </h1>
    </>
  );
}
