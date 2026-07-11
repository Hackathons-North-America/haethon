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
      initial={
        still ? false : { opacity: 0, y: "0.55em", filter: "blur(10px)" }
      }
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay: 0.12 + index * 0.09, duration: 0.85, ease: easeOut }}
    >
      {children}
    </motion.span>
  );
}

type SparkleProps = {
  still: boolean;
  className: string;
  duration: number;
  delay: number;
};

function Sparkle({ still, className, duration, delay }: SparkleProps) {
  if (still) {
    return (
      <span aria-hidden="true" className={`${className} opacity-60`}>
        ✦
      </span>
    );
  }

  return (
    <motion.span
      aria-hidden="true"
      className={className}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: [0.35, 1, 0.35], scale: [0.85, 1.18, 0.85] }}
      transition={{
        delay,
        duration,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      ✦
    </motion.span>
  );
}

export function HeroHeadline() {
  const prefersReducedMotion = useReducedMotion();
  const still = prefersReducedMotion ?? false;

  return (
    <h1 className="relative mt-7 font-serif text-[clamp(2.75rem,8vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-navy dark:text-wheat">
      {/* Twinkle accents — pure decoration. */}
      <Sparkle
        still={still}
        className="absolute -left-7 -top-5 hidden text-[0.32em] text-rust sm:block"
        duration={3.6}
        delay={1}
      />
      <Sparkle
        still={still}
        className="absolute -right-5 bottom-2 hidden text-[0.22em] text-boreal sm:block dark:text-[#7fb8a5]"
        duration={4.4}
        delay={1.4}
      />

      <RevealWord index={0} still={still}>
        Where
      </RevealWord>{" "}
      <RevealWord index={1} still={still} className="relative">
        <span className="hero-gradient-word bg-gradient-to-r from-boreal via-[#5a9e8a] to-cabernet bg-clip-text text-transparent dark:from-[#a9d8b6] dark:via-[#63c2a6] dark:to-[#e4a3ab]">
          hackers
        </span>
        {/* Hand-drawn double-pass underline that inks itself in. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 300 26"
          preserveAspectRatio="none"
          className="absolute -bottom-[0.04em] left-0 h-[0.16em] w-full overflow-visible"
        >
          <motion.path
            d="M6 18 C 68 8, 172 5, 294 12"
            fill="none"
            stroke="var(--rust)"
            strokeWidth={4.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={still ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.85 }}
            transition={{ delay: 0.95, duration: 0.7, ease: easeOut }}
          />
          <motion.path
            d="M14 22 C 90 14, 190 11, 288 17"
            fill="none"
            stroke="var(--rust)"
            strokeWidth={3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={still ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.4 }}
            transition={{ delay: 1.2, duration: 0.6, ease: easeOut }}
          />
        </svg>
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
      <RevealWord index={5} still={still} className="italic">
        weekend.
      </RevealWord>
    </h1>
  );
}
