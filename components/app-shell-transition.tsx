"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

export function AppShellContent({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      // Clears the fixed phone tab bar (3.5rem + home-indicator inset).
      className="relative z-10 min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
      transition={{ delay: 0.42, duration: 0.55, ease }}
    >
      {children}
    </motion.div>
  );
}

export function AppShellWipe() {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return null;
  }

  return (
    <motion.div
      animate={{ x: "101%" }}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-ink"
      initial={{ x: 0 }}
      transition={{ delay: 0.08, duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
    >
      <motion.span
        animate={{ letterSpacing: "0.3em", opacity: 1 }}
        className="font-mono text-xs font-medium uppercase text-paper"
        initial={{ letterSpacing: "0.55em", opacity: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        HNA
      </motion.span>
    </motion.div>
  );
}
